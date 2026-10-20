#!/usr/bin/env node
// Private-corpus gate run. Reads LLM-generated 2-hop questions over the corpus
// root (`docs/` by default; `GEN_ROOT` overrides — same env as private-gen, the
// D1-B clean-room arm), builds three conditions per question (both hops / one
// hop / neither), and runs the fully-local gate (4B reader + 9B judge). Gold
// labels are by construction: answerable = both docs, partial = one hop
// removed, unanswerable = neither.
//
//   node bench/private-run.mjs [questions.jsonl]
import { mkdtempSync, writeFileSync, rmSync, readFileSync, appendFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { selectByDense, chatWithUsage, parseOneShot, PROMPT_V45, ONESHOT_SCHEMA } from '../kit/index.mjs'
import { assembleOneShot } from '../kit/lib/answer/assemble.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'
import { judgePrompt } from './lib/judge.mjs'
import { hopsMissing } from './lib/hopcheck.mjs'
import { opencodeKey } from './lib/auth.mjs'

const FILE = process.argv[2] ?? 'bench/results/private-questions.jsonl'
const OUT = process.env.OUT ?? 'bench/results/private-run.jsonl'
const READER_MODEL = process.env.READER_MODEL ?? 'qwen3.5:4b'
const READER_HOSTED = /^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(READER_MODEL)
// Key for BOTH routes: the hosted reader and the hosted accuracy oracle
// (accJudge fires on a local reader too — gating on READER_HOSTED silently
// zeroed reader_correct). Local-only setups without auth get null; the reader
// route then fails loud at request time, accJudge fails loud in its guard.
const KEY = opencodeKey(process.env.HOME)
const READER = READER_HOSTED
  ? { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: KEY, model: READER_MODEL }
  : { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: READER_MODEL }
const JUDGE = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: process.env.JUDGE_MODEL ?? 'qwen3.5:9b' }
const LO = 2, HI = 5
const stateOf = (abstained, score) => abstained ? 'not_found' : score == null ? 'unverified' : score < LO ? 'not_found' : score >= HI ? 'verified' : 'unverified'

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [] })
const TRUNC = Number(process.env.TRUNC ?? 3000)
const ROOT = process.env.GEN_ROOT ?? 'docs'
const DOC = new Map(walk(ROOT).map((p) => [relative(ROOT, p).replace(/\.md$/, ''), { title: (readFileSync(p, 'utf8').match(/^#\s+(.+)$/m) ?? [, relative(ROOT, p)])[1].trim(), body: readFileSync(p, 'utf8').slice(0, TRUNC) }]))
console.log(`corpus: ${DOC.size} docs`)

async function readAnswer(prompt) {
  const t0 = Date.now()
  if (READER_HOSTED) { const res = await chatWithUsage(READER, [{ role: 'user', content: prompt }], { maxTokens: 3000, think: false, format: ONESHOT_SCHEMA }); return { content: res.content ?? '', tokens: (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0), ms: Date.now() - t0 } }
  const res = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: READER.model, messages: [{ role: 'user', content: prompt }], stream: false, think: false, options: { temperature: 0, num_predict: 1000 } }) })
  const j = await res.json(); return { content: j.message?.content ?? '', tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0), ms: Date.now() - t0 }
}
async function accJudge(q, gold, ans) {
  if (!KEY) throw new Error('accuracy judge: no opencode-go key (auth.json missing) — cannot label reader_correct')
  const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) }, body: JSON.stringify({ model: 'deepseek-v4.1-flash', max_tokens: 500, temperature: 0, messages: [{ role: 'user', content: judgePrompt(q, gold, ans) }] }) })
  const j = await r.json()
  if (!r.ok || !j.choices?.[0]?.message) throw new Error(`accuracy judge: HTTP ${r.status} — refusing to score reader_correct=0 on a failed oracle call`)
  const m = j.choices[0].message; return /\byes\b/i.test(String(m.content ?? '') || String(m.reasoning_content ?? ''))
}

const Q = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
console.log(`Private gate run · ${FILE} · ${Q.length} questions · reader ${READER.model} · judge ${JUDGE.model}\n`)
// Fail before burning reader time: any answered answerable fires the hosted
// accuracy oracle, and a missing key must never become reader_correct=0.
if (Q.length > 0 && !KEY) { console.error('refusing to run: no opencode-go key in auth.json (accuracy oracle would be unreachable)'); process.exit(1) }
// Resume: skip (id, condition) pairs already present in OUT (a long run can be
// interrupted and continued without re-reading the 4B on the done items).
const done = new Set()
if (existsSync(OUT)) readFileSync(OUT, 'utf8').split('\n').filter(Boolean).forEach((l) => { const x = JSON.parse(l); done.add(x.id + '|' + x.condition) })
const recs = []
let i = 0
for (const q of Q) {
  const base = [q.docA, q.docB]
  for (const condition of ['answerable', 'partial', 'unanswerable']) {
    if (done.has(q.id + '|' + condition)) continue
    let dir = null
    try {
      const ids = condition === 'answerable' ? [...base, ...q.distractors] : condition === 'partial' ? [q.docA, ...q.distractors] : [...q.distractors]
      dir = mkdtempSync(join(tmpdir(), 'pv-'))
      const seen = new Set(); const rels = []
      ids.forEach((id, n) => { const d = DOC.get(id); if (!d) return; let rel = id.replace(/[^A-Za-z0-9]+/g, '_') + '.md'; while (seen.has(rel)) rel = 'x' + rel; seen.add(rel); rels.push(rel); writeFileSync(join(dir, rel), `# ${d.title}\n${d.body}`) })
      const win = (await selectByDense(dir, q.question, { corpus: rels })).candidates.map((c) => c.rel)
      const docs = win.map((rel) => ({ rel, content: readFileSync(join(dir, rel), 'utf8') }))
      const parts = docs.map((d, n) => `=== DOC ${n + 1}: ${d.rel} ===\n${d.content}`)
      let read = await readAnswer(PROMPT_V45(q.question, parts))
      let parsed = null, abstained = false, answer = 'NOT FOUND', quote = '', parseFailed = false, asm = null
      const parse = () => { try { parsed = parseOneShot(read.content); abstained = Boolean(parsed.notFound); answer = parsed.answer; asm = assembleOneShot(dir, q.question, docs, parsed); quote = (asm.legs ?? []).map((l) => l.quote).join(' | '); return true } catch { return false } }
      if (!parse()) {
        // one tight retry (the kit's pattern — a constrained decode can stall mid-JSON)
        read = await readAnswer(PROMPT_V45(q.question, parts, true))
        if (!parse()) { parseFailed = true; answer = 'NOT FOUND' }
      }
      const noAnswer = abstained || parseFailed
      const citedDocs = [...new Set((asm?.legs ?? []).map((l) => l.rel))]
      const hops_missing = noAnswer ? null : hopsMissing([q.docA, q.docB], citedDocs)
      const correct = parseFailed ? null : noAnswer ? (condition === 'answerable' ? 0 : 1) : (condition === 'answerable' ? ((await accJudge(q.question, q.answer, answer)) ? 1 : 0) : 0)
      let score = null, judgeMs = null
      if (!noAnswer) { const jt0 = Date.now(); score = await judgeGrade(JUDGE, q.question, docs.map((d) => d.content).join('\n\n'), answer); judgeMs = Date.now() - jt0 }
      const state = stateOf(noAnswer, score)
      recs.push({ id: q.id, condition, reader_abstained: abstained ? 1 : 0, parse_failure: parseFailed ? 1 : 0, reader_correct: correct, score, state, fail_reason: noAnswer ? (parseFailed ? 'parse_failure' : 'reader_abstained') : (score == null ? 'judge_no_score' : null), judge_model: JUDGE.model, seconds_reader: Number((read.ms / 1000).toFixed(2)), seconds_judge: judgeMs == null ? null : Number((judgeMs / 1000).toFixed(2)), tokens: read.tokens, cited_docs: citedDocs, hops_missing, answer, quote })
      appendFileSync(OUT, JSON.stringify(recs[recs.length - 1]) + '\n')
      if (++i % 10 === 0) process.stderr.write('.')
    } catch (err) {
      process.stderr.write('E')
      appendFileSync(OUT, JSON.stringify({ id: q.id, condition, reader_abstained: null, parse_failure: null, reader_correct: null, score: null, state: 'error', fail_reason: 'run_error: ' + String(err?.message ?? err).slice(0, 80), judge_model: JUDGE.model, seconds_reader: null, seconds_judge: null, tokens: null, cited_docs: null, hops_missing: null, answer: null, quote: null }) + '\n')
      if (++i % 10 === 0) process.stderr.write('.')
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  }
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-')
// Summarize the FULL output file (correct even when resuming).
const all = readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
console.log(`\ncondition     N   reader_abst%  not_found%  verified%  verified_acc%  false_accept`)
for (const c of ['answerable', 'partial', 'unanswerable']) {
  const g = all.filter((x) => x.condition === c)
  const ra = g.filter((x) => x.reader_abstained).length
  const nf = g.filter((x) => x.state === 'not_found').length
  const ve = g.filter((x) => x.state === 'verified')
  const veOk = ve.filter((x) => x.reader_correct).length
  console.log(`${c.padEnd(13)} ${String(g.length).padEnd(3)} ${pct(ra, g.length).padEnd(12)} ${pct(nf, g.length).padEnd(11)} ${pct(ve.length, g.length).padEnd(10)} ${pct(veOk, ve.length).padEnd(14)} ${ve.length - veOk}`)
}
const ans = all.filter((x) => x.condition === 'answerable')
console.log(`\nanswerable coverage (shown): ${pct(ans.filter((x) => x.state !== 'not_found').length, ans.length)}%`)
