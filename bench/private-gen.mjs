#!/usr/bin/env node
// Private-corpus question generator. Builds a flat corpus from a doc root
// (`docs/` by default; `GEN_ROOT` overrides — the D1-B clean-room arm points it
// at the public repo's own docs). The root is private to the model, so no
// memorization; samples doc PAIRS, and asks a hosted model for a 2-hop question
// whose answer needs one fact from each doc. Stores docA/docB + fixed
// distractors so the run is deterministic.
//
//   node bench/private-gen.mjs [nPairs]
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { chatWithUsage } from '../kit/lib/model.mjs'
import { withRetry } from './lib/retry.mjs'

const N = Number(process.argv[2] ?? 100)
const ROOT = process.env.GEN_ROOT ?? 'docs'
const OUT = process.env.OUT ?? 'bench/results/private-questions.jsonl'
// A more capable cross-family generator than the old qwen3.5:9b — the 9B produced
// terse/inconsistent golds ("source-v45; none for the answer", "Warning W5; Yes").
const GEN = process.env.GEN_MODEL ?? 'kimi-k3'
const isHosted = /^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(GEN)
// An Ollama-style tag (`name:tag` or `namespace/name`) that happens to match the
// hosted list would silently egress doc text — fail safe to local instead.
const hostedRoute = isHosted && !/[:/]/.test(GEN)
if (isHosted && !hostedRoute) console.error(`note: '${GEN}' matches the hosted list but looks like an Ollama tag — routing local`)
// credentials only matter for the hosted route — a local GEN_MODEL must run
// without the opencode auth file (CI / air-gapped corpus builds).
const KEY = hostedRoute ? JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key : null
const GM = hostedRoute ? { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: KEY, model: GEN } : { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: GEN }

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [] })
const TRUNC = Number(process.env.TRUNC ?? 3000)
const docs = walk(ROOT).map((p) => {
  const raw = readFileSync(p, 'utf8')
  const h1 = raw.match(/^#\s+(.+)$/m)
  return { id: relative(ROOT, p).replace(/\.md$/, ''), title: h1 ? h1[1].trim() : relative(ROOT, p), body: raw.slice(0, TRUNC) }
})
console.log(`corpus: ${docs.length} docs`)

// seeded RNG for reproducibility
let seed = 0x9e3779b9
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) }
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

const GEN_PROMPT = (a, b) => [
  'Write ONE two-hop question whose answer requires a fact from DOC A AND a fact from DOC B.',
  'The question must not be answerable from either document alone.',
  'Also give the short gold answer, and the one fact each document supplies.',
  'DOC A (' + a.title + '):\n' + a.body.slice(0, 5000),
  'DOC B (' + b.title + '):\n' + b.body.slice(0, 5000),
  'Return JSON: {"question":..., "answer":..., "factA":..., "factB":...}',
].join('\n')

const GEN_SCHEMA = {
  type: 'object',
  properties: { question: { type: 'string' }, answer: { type: 'string' }, factA: { type: 'string' }, factB: { type: 'string' } },
  required: ['question', 'answer', 'factA', 'factB'],
  additionalProperties: false,
}

async function gen(a, b) {
  // transient resets on the hosted route must not kill a 100-question run
  const res = await withRetry(() => chatWithUsage(GM, [{ role: 'user', content: GEN_PROMPT(a, b) }], { maxTokens: 1500, think: false, jsonSchema: GEN_SCHEMA }), 3, 1500)
  const txt = String(res.content ?? '')
  const m = txt.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { const o = JSON.parse(m[0]); return o.question && o.answer ? o : null } catch { return null }
}

let made = 0, tries = 0
mkdirSync('bench/results', { recursive: true })
// N=0 is the offline smoke path (see scripts/private-gen.test.js) — it must not
// delete an existing default artifact before writing nothing.
if (N > 0 && existsSync(OUT)) rmSync(OUT)
while (made < N && tries < N * 4) {
  tries++
  const i = Math.floor(rnd() * docs.length); let k = Math.floor(rnd() * docs.length)
  if (k === i) k = (k + 1) % docs.length
  const a = docs[i], b = docs[k]
  const distractors = []
  while (distractors.length < 3) { const d = pick(docs); if (d.id !== a.id && d.id !== b.id && !distractors.includes(d.id)) distractors.push(d.id) }
  const q = await gen(a, b)
  if (!q) { process.stderr.write('x'); continue }
  // grounding filter: the gold answer's content words must live in the two docs,
  // AND each doc must contribute (a genuine 2-hop, not answerable from one doc).
  const ev = (a.body + ' ' + b.body).toLowerCase()
  const evA = a.body.toLowerCase(), evB = b.body.toLowerCase()
  const toks = [...new Set(String(q.answer).toLowerCase().match(/[a-z0-9]{5,}/g) || [])]
  const frac = toks.length ? toks.filter((t) => ev.includes(t)).length / toks.length : 0
  const fracA = toks.length ? toks.filter((t) => evA.includes(t)).length / toks.length : 0
  const fracB = toks.length ? toks.filter((t) => evB.includes(t)).length / toks.length : 0
  if (frac < 0.6 || fracA < 0.15 || fracB < 0.15) { process.stderr.write('u'); continue }
  const line = JSON.stringify({ id: `p${made}`, question: q.question, answer: q.answer, factA: q.factA, factB: q.factB, docA: a.id, docB: b.id, distractors, grounded: Number(frac.toFixed(2)) })
  appendFileSync(OUT, line + '\n')
  made++; process.stderr.write('.')
  if (made % 20 === 0) console.log(`  ${made}/${N}`)
}
console.log(`\nwrote ${OUT}: ${made} questions (${tries} tries)`)
