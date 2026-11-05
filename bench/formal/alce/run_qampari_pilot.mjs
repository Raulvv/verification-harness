#!/usr/bin/env node
// QAMPARI pilot: B (list + citation) vs DA (list + citation + verbatim quote).
// Same reader, same oracle passages, same output schema; DA adds the gate.
//
//   OPENCODE_API_KEY=... node alce/run_qampari_pilot.mjs --questions 30
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chatWithUsage } from '../../../kit/lib/model.mjs'

const HERE = resolve(import.meta.dirname)
const DATA = resolve(HERE, '../competitive/private/alce/ALCE-data/qampari_eval_gtr_top100_reranked_oracle.json')
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const N = Number(opt('questions', 30))
const SEED = Number(opt('seed', 0))
const MODEL = opt('model', 'deepseek-v4.1-flash')
const BASE = opt('base-url', 'https://opencode.ai/inference/openai/v1')
const OUT = resolve(opt('out', resolve(HERE, '../competitive/private/alce/runs/qampari-pilot.jsonl')))
const MAX_TOKENS = Number(opt('max-tokens', 8000))
const reader = { label: 'reader', baseUrl: BASE, model: MODEL, apiKeyEnv: 'OPENCODE_API_KEY' }

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const quoteInDoc = (doc, quote) => norm(doc).includes(norm(quote))

const docsBlock = (docs) => docs.map((d, i) => `Document [${i + 1}](Title: ${d.title}): ${d.text}`).join('\n\n')

const PROMPT = (q, docs, quotes) => [
  'Instruction: Provide a list of accurate answers for the given question using only the provided documents (some may be irrelevant).',
  'For each answer, cite exactly one document number.',
  quotes
    ? 'Also copy a verbatim passage from that document that supports the answer; the quote must appear exactly in the document.'
    : '',
  'Return ONLY JSON, no prose:',
  quotes
    ? '{"answers":[{"text":"<answer>","doc":<1-5>,"quote":"<verbatim passage>"}],"not_found":false}'
    : '{"answers":[{"text":"<answer>","doc":<1-5>}],"not_found":false}',
  'If the documents do not answer the question, return {"answers":[],"not_found":true}.',
  '',
  `Question: ${q}`,
  '',
  docsBlock(docs),
  '',
  'Answer:',
].filter(Boolean).join('\n')

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

const rows = JSON.parse(readFileSync(DATA, 'utf8'))
const questions = sample(rows, N, SEED)
const out = []

for (const [qi, item] of questions.entries()) {
  const docs = item.docs.slice(0, 5)
  for (const arm of ['B', 'DA']) {
    const t0 = Date.now()
    const messages = [{ role: 'user', content: PROMPT(item.question, docs, arm === 'DA') }]
    const r = await chatWithUsage(reader, messages, { maxTokens: MAX_TOKENS, temperature: 0, think: false, format: 'json' })
    let parsed = null
    let error = null
    try {
      parsed = parseJson(r.content)
    } catch (e) {
      error = String(e.message ?? e)
    }
    let answers = parsed?.answers ?? []
    let rejected = 0
    if (arm === 'DA') {
      answers = answers.map((a) => {
        const doc = docs[Number(a.doc) - 1]
        if (!doc || typeof a.quote !== 'string' || !quoteInDoc(doc.text, a.quote)) {
          rejected += 1
          return null
        }
        return a
      }).filter(Boolean)
    }
    const valid = answers.filter((a) => docs[Number(a.doc) - 1] && typeof a.text === 'string' && a.text.trim())
    const formatted = valid.length ? valid.map((a) => `${a.text.trim()} [${a.doc}]`).join(', ') : 'NOT FOUND'
    out.push({
      id: item.id,
      arm,
      question: item.question,
      gold: item.answers,
      answers: valid,
      formatted,
      rejected,
      not_found: Boolean(parsed?.not_found) || valid.length === 0,
      raw: r.content,
      error,
      usage: r.usage ?? {},
      ms: Date.now() - t0,
    })
    console.error(`[${qi + 1}/${questions.length}] ${arm} answers=${valid.length} rejected=${rejected} ${Date.now() - t0}ms`)
  }
}

writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n')
const tok = out.reduce((s, r) => s + (r.usage?.total_tokens ?? 0), 0)
const cost = out.reduce((s, r) => s + (r.usage?.cost ?? 0), 0)
console.log(`wrote ${out.length} rows -> ${OUT}`)
console.log(`tokens ${tok} cost $${cost.toFixed(4)}`)
