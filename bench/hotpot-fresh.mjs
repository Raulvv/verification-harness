#!/usr/bin/env node
// FRESH gate run — HotpotQA dev rows 301-600 (never seen), both conditions
// (normal + gold-paragraphs-removed), 4B reader, FROZEN gate config. Exports
// JSONL with one row per (item, condition).
//
// Columns: id, condition, reader_abstained, parse_failure, reader_correct,
//          score, state, fail_reason, top1_retrieval_score, mean_logprob,
//          quote_in_gold, judge_model, seconds_reader, seconds_judge, tokens,
//          answer, quote (answer/quote are FULL length, not truncated)
//
//   node bench/hotpot-fresh.mjs [start] [end]
import { mkdtempSync, writeFileSync, rmSync, readFileSync, appendFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hotpotRows } from './ingest-hotpot.mjs'
import { selectByDense, chatWithUsage, parseOneShot, PROMPT_V45, ONESHOT_SCHEMA } from '../kit/index.mjs'
import { assembleOneShot } from '../kit/lib/answer/assemble.mjs'
import { embedTexts, normalize } from '../kit/lib/retrieval/embed.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'
import { judgePrompt } from './lib/judge.mjs'

const CFG = JSON.parse(readFileSync(new URL('./gate-config.json', import.meta.url), 'utf8'))
const START = Number(process.argv[2] ?? 301)
const END = Number(process.argv[3] ?? 600)
const OUT = process.env.OUT ?? `bench/results/hotpot-fresh-${START}-${END}.jsonl`
const READER_MODEL = process.env.READER_MODEL ?? CFG.reader_model
const READER_HOSTED = /^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(READER_MODEL)
const READER = READER_HOSTED
  ? { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key, model: READER_MODEL }
  : { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: READER_MODEL }
const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? CFG.judge_model
const JUDGE_LOCAL = !/^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(JUDGE_MODEL)
const JUDGE = JUDGE_LOCAL
  ? { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: JUDGE_MODEL }
  : { baseUrl: CFG.judge_base_url, apiKey: KEY, model: JUDGE_MODEL }
const ACC_JUDGE = process.env.ACC_JUDGE ?? 'deepseek-v4.1-flash'
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const dot = (a, b) => a.reduce((x, y, i) => x + y * b[i], 0)

async function readAnswer(prompt) {
  const t0 = Date.now()
  if (READER_HOSTED) {
    const res = await chatWithUsage(READER, [{ role: 'user', content: prompt }], { maxTokens: 1000, think: false, format: ONESHOT_SCHEMA })
    return { content: res.content ?? '', logprobs: [], tokens: (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0), ms: Date.now() - t0 }
  }
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: READER_MODEL, messages: [{ role: 'user', content: prompt }], stream: false, think: false, logprobs: true, options: { temperature: 0, num_predict: 1000 } }),
  })
  const j = await res.json()
  const lps = (j.logprobs ?? []).map((x) => x.logprob).filter((x) => typeof x === 'number')
  return { content: j.message?.content ?? '', logprobs: lps, tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0), ms: Date.now() - t0 }
}
async function accJudge(q, gold, ans) {
  const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) },
    body: JSON.stringify({ model: ACC_JUDGE, max_tokens: 500, temperature: 0, messages: [{ role: 'user', content: judgePrompt(q, gold, ans) }] }),
  })
  const m = (await r.json()).choices?.[0]?.message ?? {}
  return /\byes\b/i.test(String(m.content ?? '') || String(m.reasoning_content ?? ''))
}
const stateOf = (abstained, score, parseFailed = false) => {
  if (abstained) return { state: 'not_found', fail_reason: parseFailed ? 'parse_failure' : 'reader_abstained' }
  if (score == null) return { state: 'unverified', fail_reason: 'judge_no_score' } // reader answered, no score → unverified
  if (score < CFG.lo) return { state: 'not_found', fail_reason: null }
  if (score >= CFG.hi) return { state: 'verified', fail_reason: null }
  return { state: 'unverified', fail_reason: null }
}

const rows = await hotpotRows(END)
const items = rows.slice(START - 1, END)
const CONDS = process.env.PARTIAL ? ['answerable', 'unanswerable', 'partial'] : ['answerable', 'unanswerable']
console.log(`Fresh gate run · rows ${START}-${END} (${items.length}) · reader ${READER_MODEL} · judge ${JUDGE_MODEL} · lo=${CFG.lo} hi=${CFG.hi}\n`)
if (existsSync(OUT)) rmSync(OUT)

for (const r of items) {
  const gold = new Set((r.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))
  const goldList = [...new Set((r.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))]
  const paras = r.context.title.map((t, i) => ({ title: t, text: (r.context.sentences[i] ?? []).join(' ') }))
  for (const condition of CONDS) {
    // answerable = all; unanswerable = no gold; partial = one gold hop removed
    const keep = condition === 'answerable' ? paras
      : condition === 'unanswerable' ? paras.filter((p) => !gold.has(String(p.title).toLowerCase()))
        : paras.filter((p) => String(p.title).toLowerCase() !== goldList[0])
    const dir = mkdtempSync(join(tmpdir(), 'fr-'))
    const seen = new Set(); const rels = []
    keep.forEach((p, i) => { const b = String(p.title).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `doc${i}`; let rel = `${b}.md`, k = 1; while (seen.has(rel)) rel = `${b}_${k++}.md`; seen.add(rel); rels.push(rel); writeFileSync(join(dir, rel), `# ${p.title}\n${p.text}`) })
    const win = (await selectByDense(dir, r.question, { corpus: rels })).candidates.map((c) => c.rel)
    const docs = win.map((rel) => ({ rel, content: readFileSync(join(dir, rel), 'utf8') }))
    const parts = docs.map((d, i) => `=== DOC ${i + 1}: ${d.rel} ===\n${d.content}`)
    // reader (with logprobs)
    let read = await readAnswer(PROMPT_V45(r.question, parts))
    let parsed = null, abstained = false, answer = 'NOT FOUND', quote = '', parseFailed = false
    const parse = () => { try { parsed = parseOneShot(read.content); abstained = Boolean(parsed.notFound); answer = parsed.answer; const asm = assembleOneShot(dir, r.question, docs, parsed); quote = (asm.legs ?? []).map((l) => l.quote).join(' | '); return true } catch { return false } }
    if (!parse()) {
      // one tight retry (the kit's pattern — a constrained decode can stall mid-JSON)
      read = await readAnswer(PROMPT_V45(r.question, parts, true))
      if (!parse()) { parseFailed = true; answer = 'NOT FOUND' }
    }
    const noAnswer = abstained || parseFailed
    // retrieval top-1 score (dense cosine)
    let top1 = null
    try { const qv = normalize((await embedTexts([`search_query: ${r.question}`]))[0]); const dv = normalize((await embedTexts([`search_document: ${docs[0]?.content ?? ''}`]))[0]); top1 = dot(qv, dv) } catch {}
    // reader correct (accuracy judge)
    const correct = parseFailed ? null : noAnswer ? ((condition === 'unanswerable' || condition === 'partial') ? 1 : 0) : (condition === 'answerable' ? (await accJudge(r.question, r.answer, answer) ? 1 : 0) : 0)
    // quote in gold?
    const goldText = norm(paras.filter((p) => gold.has(String(p.title).toLowerCase())).map((p) => p.text).join(' '))
    const quote_in_gold = quote ? (goldText.includes(norm(quote.slice(0, 60))) ? 1 : 0) : 0
    // gate
    let score = null, judgeMs = null
    if (!noAnswer) { const ev = keep.map((p) => `# ${p.title}\n${p.text}`).join('\n\n'); const jt0 = Date.now(); score = await judgeGrade(JUDGE, r.question, ev, answer); judgeMs = Date.now() - jt0 }
    const { state, fail_reason } = stateOf(noAnswer, score, parseFailed)
    const rec = { id: r.id ?? START - 1 + items.indexOf(r), condition, reader_abstained: abstained ? 1 : 0, parse_failure: parseFailed ? 1 : 0, reader_correct: correct, score, state, fail_reason, top1_retrieval_score: top1 == null ? null : Number(top1.toFixed(4)), mean_logprob: read.logprobs.length ? Number((read.logprobs.reduce((a, b) => a + b, 0) / read.logprobs.length).toFixed(4)) : null, quote_in_gold, judge_model: JUDGE_MODEL, seconds_reader: Number((read.ms / 1000).toFixed(2)), seconds_judge: judgeMs == null ? null : Number((judgeMs / 1000).toFixed(2)), tokens: read.tokens, answer, quote }
    appendFileSync(OUT, JSON.stringify(rec) + '\n')
    rmSync(dir, { recursive: true, force: true })
    process.stderr.write('.')
  }
}
console.log(`\nwrote ${OUT}`)
