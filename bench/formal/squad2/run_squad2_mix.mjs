#!/usr/bin/env node
// SQuAD 2.0 mixed test: 100 answerable + 100 unanswerable.
// B: answer or NOT FOUND. DA: same, plus a verbatim quote that must contain
// the answer; a failed gate forces abstention.
//
//   OPENCODE_API_KEY=... node squad2/run_squad2_mix.mjs
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chatWithUsage } from '../../../kit/lib/model.mjs'

const HERE = resolve(import.meta.dirname)
const DATA = resolve(HERE, '../competitive/private/squad2/dev-v2.0.json')
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const N_POS = Number(opt('answerable', 100))
const N_NEG = Number(opt('unanswerable', 100))
const SEED = Number(opt('seed', 0))
const MODEL = opt('model', 'deepseek-v4.1-flash')
const BASE = opt('base-url', 'https://opencode.ai/inference/openai/v1')
const OUT = resolve(opt('out', resolve(HERE, '../competitive/private/squad2/runs/squad2-mix-200.jsonl')))
const MAX_TOKENS = Number(opt('max-tokens', 16000))
const RETRY_TOKENS = Number(opt('retry-tokens', 24000))
const reader = { label: 'reader', baseUrl: BASE, model: MODEL, apiKeyEnv: 'OPENCODE_API_KEY' }

const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(a|an|the)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const quoteOk = (context, quote, answer) =>
  norm(quote).length > 0 && norm(context).includes(norm(quote)) && norm(quote).includes(norm(answer))

const PROMPT = (item, quotes) => [
  'Answer the question using only the document.',
  'If the document does not contain the answer, return {"answer":"","not_found":true}.',
  quotes
    ? 'Otherwise return {"answer":"<short span from the document>","quote":"<verbatim sentence or span from the document that contains the answer>","not_found":false}.'
    : 'Otherwise return {"answer":"<short span from the document>","not_found":false}.',
  'Return ONLY JSON.',
  '',
  `Document: ${item.context}`,
  '',
  `Question: ${item.question}`,
].join('\n')

const parseJson = (text) => {
  const m = String(text ?? '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('no JSON object')
  return JSON.parse(m[0])
}

const sample = (rows, n, seed) => {
  let s = seed >>> 0
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const a = rows.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(n, a.length))
}

const raw = JSON.parse(readFileSync(DATA, 'utf8'))['data']
const all = []
for (const article of raw) {
  for (const para of article.paragraphs) {
    for (const qa of para.qas) {
      all.push({
        id: qa.id,
        question: qa.question,
        context: para.context,
        answers: (qa.answers || []).map((a) => a.text),
        impossible: Boolean(qa.is_impossible),
        title: article.title,
      })
    }
  }
}
const positives = sample(all.filter((x) => !x.impossible), N_POS, SEED)
const negatives = sample(all.filter((x) => x.impossible), N_NEG, SEED + 1)
const items = sample([...positives, ...negatives], positives.length + negatives.length, SEED + 2)

mkdirSync(dirname(OUT), { recursive: true })
const partial = OUT + '.partial.jsonl'
writeFileSync(partial, '')
const out = []
const started = Date.now()

for (const [i, item] of items.entries()) {
  for (const arm of ['B', 'DA']) {
    const t0 = Date.now()
    const messages = [{ role: 'user', content: PROMPT(item, arm === 'DA') }]
    let r = await chatWithUsage(reader, messages, { maxTokens: MAX_TOKENS, temperature: 0, think: false, format: 'json' })
    if (!r.content || !/\{/.test(String(r.content))) {
      r = await chatWithUsage(reader, [
        ...messages,
        { role: 'assistant', content: r.content || '(empty)' },
        { role: 'user', content: 'Return the JSON object now. Do not reason further.' },
      ], { maxTokens: RETRY_TOKENS, temperature: 0, think: false, format: 'json' })
    }
    let parsed = null
    let error = null
    try { parsed = parseJson(r.content) } catch (e) { error = String(e.message ?? e) }
    const answer = String(parsed?.answer ?? '').trim()
    const quote = String(parsed?.quote ?? '')
    let gate = null
    let rejected = 0
    let abstained = Boolean(parsed?.not_found) || !answer
    if (arm === 'DA' && !abstained) {
      gate = quoteOk(item.context, quote, answer)
      if (!gate) { rejected = 1; abstained = true }
    }
    const row = {
      id: item.id,
      arm,
      question: item.question,
      context: item.context,
      gold: item.answers,
      impossible: item.impossible,
      answer,
      quote,
      gate,
      rejected,
      abstained,
      raw: r.content,
      error,
      usage: r.usage ?? {},
      ms: Date.now() - t0,
    }
    out.push(row)
    appendFileSync(partial, JSON.stringify(row) + '\n')
    console.error(`[${i + 1}/${items.length}] ${arm} impossible=${item.impossible} abstained=${abstained} rejected=${rejected} ${row.ms}ms elapsed=${((Date.now() - started) / 1000).toFixed(0)}s`)
  }
}

writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n')
const tok = out.reduce((s, r) => s + (r.usage?.total_tokens ?? 0), 0)
const cost = out.reduce((s, r) => s + (r.usage?.cost ?? 0), 0)
console.log(`wrote ${out.length} rows -> ${OUT}`)
console.log(`tokens ${tok} cost $${cost.toFixed(4)}`)
