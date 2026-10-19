#!/usr/bin/env node
// Does the gate beat cheap baselines at matched coverage? Decision = answer or
// abstain; a correct decision is (answerable AND answered AND correct) or
// (unanswerable AND abstained). Sweep each baseline's threshold and print
// (coverage, accuracy), plus the gate's point.
import { readFileSync } from 'node:fs'

// Artifact-first: read the pinned artifact (fresh clone: works). The gitignored
// export names the label `reader_correct`; the artifact names it `oracle_correct`.
const src = (() => {
  try {
    const rows = readFileSync('unified.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const b95 = rows.filter((x) => String(x.run_id ?? '').startsWith('b95-'))
    if (b95.length) return { r: b95, from: 'unified.jsonl (b95-)' }
  } catch {}
  try {
    const rows = readFileSync('bench/results/unified-public.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const b95 = rows.filter((x) => String(x.run_id ?? '').startsWith('b95'))
    if (b95.length) return { r: b95, from: 'unified-public.jsonl (b95)' }
  } catch {}
  return { r: readFileSync('bench/results/hotpot-fresh-301-600.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)), from: 'export (reader_correct)' }
})()
const r = src.r
const lab = (x) => x.oracle_correct ?? x.reader_correct
const N = r.length
const acc = (decide) => {
  let ok = 0, ans = 0
  for (const x of r) { const answered = decide(x); if (answered) ans++; const good = answered ? (x.condition === 'answerable' && lab(x) === 1) : (x.condition === 'unanswerable'); if (good) ok++ }
  return { coverage: ans / N, accuracy: ok / N }
}
const pct = (x) => (100 * x).toFixed(1)

const gate = acc((x) => x.state !== 'not_found')
console.log(`\nBaselines at matched coverage · N=${N} · from ${src.from}`)
console.log(`gate (frozen): coverage ${pct(gate.coverage)}%  accuracy ${pct(gate.accuracy)}%\n`)

for (const [name, key] of [['top1 retrieval score', 'top1_retrieval_score'], ['reader mean logprob', 'mean_logprob']]) {
  const vals = r.map((x) => x[key]).filter((v) => v != null).sort((a, b) => a - b)
  console.log(`${name} — sweep (coverage, accuracy):`)
  const out = []
  for (let q = 0; q <= 10; q++) {
    const tau = vals[Math.min(vals.length - 1, Math.floor((q / 10) * vals.length))]
    const m = acc((x) => (x[key] ?? -Infinity) >= tau)
    out.push(`${pct(m.coverage)}/${pct(m.accuracy)}`)
  }
  console.log('  ' + out.join('  '))
  // best accuracy the baseline reaches AT OR BELOW the gate's coverage
  let best = { accuracy: -1 }
  for (const tau of vals) { const m = acc((x) => (x[key] ?? -Infinity) >= tau); if (m.coverage <= gate.coverage + 0.005 && m.accuracy > best.accuracy) best = m }
  console.log(`  best at coverage<=${pct(gate.coverage)}%: accuracy ${pct(best.accuracy)}% (coverage ${pct(best.coverage)}%)  → gate ${pct(gate.accuracy)}% ${best.accuracy > gate.accuracy ? 'LOSES' : 'wins'} by ${pct(Math.abs(gate.accuracy - best.accuracy))}pp\n`)
}
