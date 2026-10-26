#!/usr/bin/env node
// Strong-baseline comparison. Same reader, same corpus, same retrieved window:
//   A  naive            question only, no documents
//   B  rag-cite         documents + "cite the file, say NOT FOUND if absent"
//   C  rag-cite + NLI   B, then an entailment check; INSUFFICIENT => abstain
//   D  harness          askOneShot (contract reader + mechanical receipts)
//
// Question it answers: does D beat the best simple alternative (C) on
// false-accepts, outside the noise? Decide the rule BEFORE running (see
// bench/ARM-COMPARE.md). Tune the C threshold/judge on dev only; run held-out once.
//
//   node bench/arm-compare.mjs --questions bench/ooh-pilot.jsonl \
//     --corpus bench/corpus/ooh-v1 --base-url http://localhost:11434/v1 \
//     --model qwen3.5:4b --judge-model bespoke-minicheck [--judge-cmd "<cmd>"] \
//     [--arms A,B,C,D] [--seeds 3] [--k 3] [--out bench/results/arm-compare.jsonl]
//   node bench/arm-compare.mjs --fake     # offline plumbing self-test, no models
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { selectByReference } from '../kit/lib/retrieval/window.mjs'
import { askOneShot } from '../kit/lib/answer/oneshot.mjs'
import { chatWithUsage } from '../kit/lib/model.mjs'
import { judgeSufficiency, judgeByCommand } from '../kit/lib/receipts/sufficiency.mjs'
import { verify } from '../kit/lib/receipts/gate.mjs'
import { ABSTAIN_TERMS, norm, numbersIn, parseAnswer } from '../kit/lib/receipts/text.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const FAKE = flag('fake')
const arms = opt('arms', 'A,B,C,D').split(',')
const seeds = Number(opt('seeds', FAKE ? 1 : 3))
const K = Number(opt('k', 3))
const corpus = resolve(opt('corpus', 'bench/corpus/ooh-v1'))
const qfile = opt('questions', 'bench/ooh-pilot.jsonl')
const outPath = opt('out', 'bench/results/arm-compare.jsonl')
const baseUrl = opt('base-url', 'http://localhost:11434/v1')
const judgeBaseUrl = opt('judge-base-url', baseUrl)
const apiKeyEnv = opt('api-key-env')
const isOllama = (u) => /:11434|ollama/i.test(String(u ?? ''))
const reader = { label: 'reader', baseUrl, model: opt('model', 'qwen3.5:4b'), apiKeyEnv, apiKey: isOllama(baseUrl) ? 'ollama' : undefined }
const judge = { label: 'judge', baseUrl: judgeBaseUrl, model: opt('judge-model', reader.model), apiKeyEnv, apiKey: isOllama(judgeBaseUrl) ? 'ollama' : undefined }
const judgeCmd = opt('judge-cmd')

const items = readFileSync(qfile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

// ---------- scoring (mechanical; no LLM oracle) ----------
const hasAbstain = (t) => ABSTAIN_TERMS.some((m) => norm(t).includes(m))
const leadAbstain = (t) => /^\s*(not found|no record|cannot find|nowhere|not documented|not stated)\b/i.test(t)
const valueIn = (text, v) => typeof v === 'number'
  ? numbersIn(text).includes(String(v)) || numbersIn(text).includes(String(v).replace(/(\d)(?=(\d{3})+$)/g, '$1'))
  : norm(text).includes(norm(String(v)))
export function score(item, text) {
  const abstained = leadAbstain(text) || (item.condition === 'unanswerable' && hasAbstain(text))
  if (item.condition === 'unanswerable') return { shown: !abstained, correct: abstained, falseAccept: !abstained }
  if (item.condition === 'partial') {
    const stated = item.gold.parts.filter((p) => p.status === 'stated')
    const gotStated = stated.every((p) => valueIn(text, p.value))
    const flagged = hasAbstain(text)
    return { shown: !leadAbstain(text), correct: gotStated && flagged, falseAccept: !leadAbstain(text) && !flagged }
  }
  const ok = !abstained && valueIn(text, item.gold)
  return { shown: !abstained, correct: ok, falseAccept: !abstained && !ok } // wrong answer shown as an answer
}
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]
  const p = k / n, d = 1 + z * z / n
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}

// ---------- model plumbing (injectable for --fake) ----------
const fakeChat = (item) => async (msgs) => {
  const p = msgs.map((m) => m.content).join('\n')
  if (/SUFFICIENT or INSUFFICIENT|Claim:/.test(p)) return { content: /\d/.test(p.split('ANSWER:')[1] ?? '') ? 'SUFFICIENT' : 'INSUFFICIENT' }
  if (/not_found/.test(p) || /JSON/i.test(p)) return { content: JSON.stringify({ answer: '', quotes: [], not_found: true }) }
  const g = item.condition === 'answerable' ? String(item.gold) : null
  return { content: g && p.includes('Documents') ? g : 'NOT FOUND' }
}
const chat = (item) => FAKE ? fakeChat(item) : (msgs, o) => chatWithUsage(reader, msgs, { maxTokens: 400, think: false, ...o })

const window_ = (item) => selectByReference(corpus, item.question).candidates.slice(0, K)
  .map((c) => ({ rel: c.rel, content: readFileSync(join(corpus, c.rel), 'utf8').slice(0, 6000) }))
const docsBlock = (docs) => docs.map((d, i) => `[${i + 1}] ${d.rel}\n${d.content}`).join('\n\n')
const PROMPT_B = (q, docs) => [
  'Answer using ONLY the documents. Name the source file.',
  'If the documents do not state the answer, reply exactly: NOT FOUND.',
  'If only part is stated, give that part and say which part is not stated.',
  '', 'Documents:', docsBlock(docs), '', 'Question: ' + q,
].join('\n')

async function runArm(arm, item) {
  const t0 = Date.now()
  const ask = chat(item)
  if (arm === 'A') {
    const r = await ask([{ role: 'user', content: 'Answer concisely. If you do not know, reply NOT FOUND.\nQuestion: ' + item.question }])
    return { text: r.content, ms: Date.now() - t0 }
  }
  const docs = window_(item)
  if (arm === 'B' || arm === 'C') {
    const r = await ask([{ role: 'user', content: PROMPT_B(item.question, docs) }])
    let text = r.content, gate = null
    if (arm === 'C' && !leadAbstain(text)) {
      const ev = docsBlock(docs)
      gate = judgeCmd ? judgeByCommand(judgeCmd, item.question, ev, text)
        : await judgeSufficiency(judge, item.question, ev, text, FAKE ? { _chat: fakeChat(item) } : {})
      if (gate !== 'SUFFICIENT') text = 'NOT FOUND (entailment check: ' + gate + ')'
    }
    return { text, gate, ms: Date.now() - t0 }
  }
  // D: the harness on the SAME docs as B/C, then the mechanical gate.
  // A gate rejection is an abstention; a gate pass is the only shown answer.
  const res = await askOneShot(reader, corpus, item.question, {
    retriever: 'reference', promptStyle: 'v45', partialRule: true, docs,
    ...(FAKE ? { _chat: fakeChat(item), _vet: fakeChat(item) } : {})
  })
  const receipt = res.final?.text ?? ''
  const gateItem = { id: item.id, question: item.question, not_found: res.parsed?.notFound ?? true }
  const g = verify(gateItem, receipt, corpus)
  const text = g.mechanicalPass ? (parseAnswer(receipt).proposed || receipt) : 'NOT FOUND (gate rejected: ' + g.why + ')'
  return { text, receipt, gate: g, ms: Date.now() - t0 }
}

// ---------- run + report ----------
const rows = []
for (let s = 0; s < seeds; s++) for (const item of items) for (const arm of arms) {
  let out
  try { out = await runArm(arm, item) } catch (e) { out = { text: '', error: String(e.message ?? e), ms: 0 } }
  rows.push({ seed: s, arm, id: item.id, condition: item.condition, ...out, ...score(item, out.text) })
}
mkdirSync(dirname(resolve(outPath)), { recursive: true })
writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

const pct = (k, n) => n ? (100 * k / n).toFixed(0).padStart(3) + '%' : '  - '
const ci = (k, n) => { const [a, b] = wilson(k, n); return `[${Math.max(0, 100 * a).toFixed(0)}-${Math.min(100, 100 * b).toFixed(0)}]` }
console.log(`${FAKE ? '(FAKE MODELS — plumbing check only, numbers are meaningless)\n' : ''}items=${items.length} seeds=${seeds} k=${K} reader=${reader.model} judge=${judgeCmd ? 'cmd' : judge.model}\n`)
console.log('arm  answerable-correct        unanswerable-abstain       partial-correct            false-accept(all)       s/q')
for (const arm of arms) {
  const R = rows.filter((r) => r.arm === arm)
  const cell = (cond, f) => { const x = R.filter((r) => r.condition === cond); const k = x.filter(f).length; return `${pct(k, x.length)} ${ci(k, x.length).padEnd(9)} n=${String(x.length).padEnd(3)}` }
  const fa = R.filter((r) => r.falseAccept).length
  console.log(`${arm}    ${cell('answerable', (r) => r.correct).padEnd(26)} ${cell('unanswerable', (r) => r.correct).padEnd(26)} ${cell('partial', (r) => r.correct).padEnd(26)} ${(pct(fa, R.length) + ' ' + ci(fa, R.length)).padEnd(23)} ${(R.reduce((a, r) => a + r.ms, 0) / R.length / 1000).toFixed(1)}`)
}
console.log(`\nrows -> ${outPath}. Intervals are Wilson 95% over seed-pooled rows (seeds are not independent questions: widen by eye).`)
