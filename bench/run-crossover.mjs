#!/usr/bin/env node
// Crossover lock — does the receipt requirement help (9B) or hurt (4B)?
// Four arms on 4B and three on 9B, same N HotpotQA items, cross-family judged:
//   bare4 · naive4 · full4 · src4 · naive9 · full9 · src9
// Resumable per arm (arm-by-arm so each model loads once).
//
//   node bench/run-crossover.mjs [n=100]
import { writeFileSync, readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chatWithUsage } from '../kit/index.mjs'
import { PROMPT, PROMPT_SOURCE, ONESHOT_SCHEMA, ONESHOT_SCHEMA_SOURCE } from '../kit/index.mjs'
import { parseOneShot } from '../kit/index.mjs'
import { rehomeLegs } from '../kit/index.mjs'
import { hotpotRows } from './ingest-hotpot.mjs'

const N = Number(process.argv[2] ?? 100)
const HERE = dirname(fileURLToPath(import.meta.url))
const RESULTS = join(HERE, 'results')

const base = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local' }
const M4 = { ...base, model: 'qwen3.5:4b' }
const M9 = { ...base, model: 'qwen3.5:9b' }
const JUDGE = { qwen: M9, granite: { ...base, model: 'granite4:3b' } }

const ANSWER_SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }
const RAG_SCHEMA = { type: 'object', properties: { answer: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } } }, required: ['answer', 'citations'] }
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(a|an|the)\b/g, ' ').replace(/\s+/g, ' ').trim()
const containsGold = (t, g) => { const x = norm(t), y = norm(g); return !!y && (x.includes(y) || y.split(' ').every((w) => x.includes(w))) }
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const parseJSON = (s) => { try { return JSON.parse(String(s ?? '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')) } catch { return null } }
const paragraphs = (row) => row.context.title.map((t, i) => ({ title: t, text: (row.context.sentences[i] ?? []).join(' ') }))
const log = (s) => process.stderr.write(String(s) + '\n')

async function call(model, messages, schema, maxTokens) {
  const t0 = Date.now()
  try {
    const r = await chatWithUsage(model, messages, { maxTokens, think: false, format: schema })
    return { content: r.content, ms: Date.now() - t0, tok: (r.usage?.prompt_tokens ?? 0) + (r.usage?.completion_tokens ?? 0), error: null }
  } catch (e) { return { content: '', ms: Date.now() - t0, tok: 0, error: String(e?.message ?? e) } }
}

const armBare = async (row, model) => {
  const r = await call(model, [{ role: 'user', content: `Answer the question in as few words as possible (a name, a date, or yes/no). Return ONLY JSON {"answer": "<short answer>"}.\n\nQuestion: ${row.question}` }], ANSWER_SCHEMA, 64)
  return { answer: (parseJSON(r.content) ?? {}).answer ?? '', ms: r.ms, tok: r.tok, error: r.error }
}
const armNaive = async (row, model) => {
  const paras = paragraphs(row)
  const body = paras.map((p) => `=== ${p.title} ===\n${p.text}`).join('\n\n')
  const r = await call(model, [{ role: 'user', content: `Answer the question using ONLY the passages below. Cite the titles you used.\nReturn ONLY JSON {"answer": "<short answer>", "citations": ["<passage title>", ...]}.\n\n${body}\n\nQuestion: ${row.question}` }], RAG_SCHEMA, 200)
  return { answer: (parseJSON(r.content) ?? {}).answer ?? '', ms: r.ms, tok: r.tok, error: r.error }
}
const armFull = async (row, model) => {
  const paras = paragraphs(row)
  const docs = paras.map((p) => ({ rel: p.title, content: p.text }))
  const parts = paras.map((p, i) => `=== DOC ${i + 1}: ${p.title} ===\n${p.text}`)
  const r = await call(model, [{ role: 'user', content: PROMPT(row.question, parts) }], ONESHOT_SCHEMA, 800)
  try { const p = parseOneShot(r.content); const { kept, dropped } = rehomeLegs(docs, p.quotes); return { answer: p.answer, ms: r.ms, tok: r.tok, error: null, quotes: (p.quotes ?? []).length, verified: kept.length, dropped: dropped.length } } catch { return { answer: '', ms: r.ms, tok: r.tok, error: 'parse' } }
}
const armSource = async (row, model) => {
  const paras = paragraphs(row)
  const parts = paras.map((p, i) => `=== DOC ${i + 1}: ${p.title} ===\n${p.text}`)
  const r = await call(model, [{ role: 'user', content: PROMPT_SOURCE(row.question, parts) }], ONESHOT_SCHEMA_SOURCE, 400)
  try { const p = parseOneShot(r.content); return { answer: p.answer, ms: r.ms, tok: r.tok, error: null } } catch { return { answer: '', ms: r.ms, tok: r.tok, error: 'parse' } }
}

const judgePrompt = (q, gold, ans) => ['You grade whether a system answer correctly answers a question.', 'Gold answer: ' + gold, 'System answer: ' + ans, 'If the system answer states the same thing as the gold (extra context is fine, wording may differ), reply YES.', 'If it states a different answer, or omits the answer, reply NO.', 'The question was: ' + q, 'Reply with exactly one word: YES or NO.'].join('\n')
async function askJudge(model, q, gold, ans) {
  try { const r = await chatWithUsage(model, [{ role: 'user', content: judgePrompt(q, gold, ans) }], { maxTokens: 4, think: false }); return /^\s*yes\b/i.test(String(r.content ?? '')) ? 1 : 0 } catch { return 0 }
}

async function main() {
  const rows = await hotpotRows(N)
  const byId = new Map(rows.map((r) => [r.id, r]))
  mkdirSync(RESULTS, { recursive: true })
  const ARMS = {
    bare4: { model: M4, fn: armBare }, naive4: { model: M4, fn: armNaive }, full4: { model: M4, fn: armFull }, src4: { model: M4, fn: armSource },
    bare9: { model: M9, fn: armBare }, naive9: { model: M9, fn: armNaive }, full9: { model: M9, fn: armFull }, src9: { model: M9, fn: armSource },
  }
  const t0 = Date.now()
  // --- generation, arm by arm (each model loads once) ---
  for (const [name, { model, fn }] of Object.entries(ARMS)) {
    const LOG = join(RESULTS, `crossover-${name}-${N}.jsonl`)
    if (!existsSync(LOG)) writeFileSync(LOG, '')
    const done = new Set(readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id))
    await call(model, [{ role: 'user', content: 'Say OK.' }], ANSWER_SCHEMA, 8)
    log(`\n${name}: ${rows.length} items · ${done.size} done`)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (done.has(row.id)) continue
      const o = await fn(row, model)
      appendFileSync(LOG, JSON.stringify({ id: row.id, ...o }) + '\n')
      log(`  ${name} ${i + 1}/${rows.length} · ${(o.ms / 1000).toFixed(1)}s · ${(Date.now() - t0) / 1000 | 0}s elapsed`)
    }
  }
  // --- judging ---
  const recs = rows.map((row) => ({ id: row.id, gold: row.answer, question: row.question }))
  const byArm = {}
  for (const name of Object.keys(ARMS)) byArm[name] = new Map(readFileSync(join(RESULTS, `crossover-${name}-${N}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return [o.id, o] }))
  log('\njudging …')
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i]
    for (const name of Object.keys(ARMS)) {
      const o = byArm[name].get(rec.id) ?? {}
      const c = containsGold(o.answer, rec.gold) ? 1 : 0
      o.contains = c
      o.qwen = c ? 1 : await askJudge(JUDGE.qwen, rec.question, rec.gold, o.answer)
      o.granite = c ? 1 : await askJudge(JUDGE.granite, rec.question, rec.gold, o.answer)
      rec[name] = o
    }
    log(`  ${i + 1}/${recs.length}`)
  }
  const pct = (k, m) => (mean(recs.map((r) => r[k]?.[m]).filter((x) => x != null)) * 100).toFixed(1)
  const num = (k, m) => mean(recs.map((r) => r[k]?.[m]).filter((x) => x != null))
  const meta = { bare4: '4B', naive4: '4B', full4: '4B', src4: '4B', bare9: '9B', naive9: '9B', full9: '9B', src9: '9B' }
  const trace = (k) => {
    const q = recs.map((r) => r[k]?.quotes).filter((x) => x != null).reduce((a, b) => a + b, 0)
    const v = recs.map((r) => r[k]?.verified).filter((x) => x != null).reduce((a, b) => a + b, 0)
    return q ? (v / q * 100).toFixed(1) : '—'
  }
  const lines = [`# Crossover — HotpotQA (${recs.length} items, shared window)`, '', '| arm | model | contains | qwen | granite | trace | s/q | tok/q |', '|---|---|---|---|---|---|---|---|']
  for (const k of Object.keys(ARMS)) lines.push(`| ${k} | ${meta[k]} | ${pct(k, 'contains')} | ${pct(k, 'qwen')} | ${pct(k, 'granite')} | ${trace(k)} | ${(num(k, 'ms') / 1000).toFixed(1)} | ${Math.round(num(k, 'tok'))} |`)
  const md = lines.join('\n') + '\n'
  writeFileSync(join(RESULTS, `crossover-${recs.length}.md`), md)
  writeFileSync(join(RESULTS, `crossover-${recs.length}.json`), JSON.stringify(recs, null, 2))
  process.stderr.write('\n' + md)
}
main()
