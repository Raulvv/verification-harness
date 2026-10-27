#!/usr/bin/env node
// Aggregate report for arm-compare.jsonl. Read-only; no model calls.
//   node bench/arm-report.mjs --rows bench/results/arm-compare-heldout-deepseek.jsonl \
//     --questions bench/results/ooh-test-private.jsonl --corpus bench/corpus/ooh-v1 --k 3
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { selectByReference } from '../kit/lib/retrieval/window.mjs'
import { verify } from '../kit/lib/receipts/gate.mjs'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const rowsPath = opt('rows', 'bench/results/arm-compare-heldout-deepseek.jsonl')
const qPath = opt('questions', 'bench/results/ooh-test-private.jsonl')
const corpus = opt('corpus', 'bench/corpus/ooh-v1')
const K = Number(opt('k', 3))
const rows = readFileSync(rowsPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
const items = new Map(readFileSync(qPath, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.id, x] }))
const arms = [...new Set(rows.map((r) => r.arm))]
const conditions = ['answerable', 'unanswerable', 'partial']
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d] }
const pct = (k, n) => { if (!n) return '—'; const [a,b]=wilson(k,n); return `${(100*k/n).toFixed(0)}% [${Math.max(0,100*a).toFixed(0)}-${Math.min(100,100*b).toFixed(0)}]` }
const windowFor = (item) => selectByReference(corpus, item.question).candidates.slice(0, K).map((c) => c.rel)
const sourceInWindow = (item, win) => (item.sources ?? []).every((s) => win.includes(s + '.md'))

const by = new Map()
for (const r of rows) {
  const key = `${r.arm}|${r.condition}`
  if (!by.has(key)) by.set(key, [])
  by.get(key).push(r)
}
console.log(`# Arm report\n\nRows: \`${rowsPath}\`  \nQuestions: \`${qPath}\`  \nCorpus: \`${corpus}\`  \nK: ${K}  \nSHA-256: \`${createHash('sha256').update(readFileSync(rowsPath)).digest('hex')}\`\n`)
console.log('| Arm | Condition | n | Correct | Abstained | Wrong shown | Retrieval miss | Coverage | False accept |')
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
for (const arm of arms) for (const cond of conditions) {
  const R = by.get(`${arm}|${cond}`) ?? []
  if (!R.length) continue
  const correct = R.filter((r) => r.correct).length
  const abstained = R.filter((r) => !r.shown).length
  const wrong = R.filter((r) => r.shown && !r.correct).length
  const miss = R.filter((r) => {
    const item = items.get(r.id)
    return item && (item.sources ?? []).length && !sourceInWindow(item, windowFor(item))
  }).length
  const shown = R.filter((r) => r.shown).length
  const fa = R.filter((r) => r.falseAccept).length
  console.log(`| ${arm} | ${cond} | ${R.length} | ${correct} | ${abstained} | ${wrong} | ${miss} | ${shown}/${R.length} | ${pct(fa, R.length)} |`)
}
console.log('\n## D strict-mode delta\n')
const D = rows.filter((r) => r.arm === 'D')
let strictPass = 0, strictReject = 0, strictFA = 0
for (const r of D) {
  if (!r.falseAccept) continue
  const item = items.get(r.id)
  const g = verify({ id: r.id, question: item?.question ?? '', not_found: false }, r.receipt ?? r.text ?? '', corpus, { strict: true })
  if (g.mechanicalPass) { strictPass++; strictFA++ } else strictReject++
}
console.log(`D false accepts: ${D.filter((r) => r.falseAccept).length}; strict passes: ${strictPass}; strict rejects: ${strictReject}; strict false accepts: ${strictFA}`)
console.log('\nNote: retrieval miss is gold source absent from the deterministic K window; it is not a model call. “Wrong shown” includes possible scorer-strict paraphrase misses; a hand spot-check is still required.')
