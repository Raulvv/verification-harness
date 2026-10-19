#!/usr/bin/env node
// End-to-end table (test 3) + partial-support negatives (test 2).
// Artifact-first: reads unified.jsonl (canonical root), then the published
// partition bench/results/unified-public.jsonl — both committed; the
// gitignored exports are the last fallback. `oracle_correct` is the artifact's
// name for the export's `reader_correct`.
import { readFileSync } from 'node:fs'
const load = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }
const all = (() => {
  for (const f of ['unified.jsonl', 'bench/results/unified-public.jsonl']) {
    const rows = load(f)
    if (rows.length) return rows
  }
  return []
})()
const byRun = (p) => { const g = all.filter((x) => String(x.run_id ?? '').startsWith(p)); return g.length ? g : null }
const lab = (x) => x.oracle_correct ?? x.reader_correct
const pct = (a, b) => b ? (100 * a / b).toFixed(1) : '—'

// ---- test 2: partial-support negatives (4B reader + kimi judge) ----
console.log('\n== TEST 2 · partial-support negatives (one gold hop removed) ==')
console.log('   4B reader + kimi judge, rows 301-400, 3 conditions\n')
const P = byRun('b108-') ?? load('bench/results/hotpot-fresh-partial-4b.jsonl')
console.log('condition        N   abstained%   not_found%  unverified%  verified%  verified_acc%')
for (const c of ['answerable', 'unanswerable', 'partial']) {
  const g = P.filter((x) => x.condition === c)
  if (!g.length) { console.log(`${c.padEnd(16)} —`); continue }
  const ab = g.filter((x) => x.reader_abstained).length
  const nf = g.filter((x) => x.state === 'not_found').length
  const un = g.filter((x) => x.state === 'unverified').length
  const ve = g.filter((x) => x.state === 'verified')
  const veOk = ve.filter((x) => lab(x)).length
  console.log(`${c.padEnd(16)} ${String(g.length).padEnd(3)} ${pct(ab, g.length).padEnd(11)} ${pct(nf, g.length).padEnd(11)} ${pct(un, g.length).padEnd(11)} ${pct(ve.length, g.length).padEnd(10)} ${pct(veOk, ve.length)}`)
}
const part = P.filter((x) => x.condition === 'partial')
console.log(`\n  partial: ${part.filter((x) => x.reader_abstained).length}/${part.length} abstained (correct);`)
console.log(`  ${part.filter((x) => !x.reader_abstained && x.state === 'verified').length} answered-and-verified (false-accept on a missing-hop Q);`)
console.log(`  ${part.filter((x) => !x.reader_abstained && x.state === 'unverified').length} answered-but-unverified.`)

// ---- test 3: end-to-end table ----
console.log('\n\n== TEST 3 · end-to-end (rows 301-400, answerable + unanswerable) ==\n')
const shownGated = (x) => x.state !== 'not_found'
const configs = [
  ['27B reader, no gate', 'b104-', 'bench/results/hotpot-fresh-27b.jsonl', 17.8, true],
  ['4B reader + 27B judge', 'b105-', 'bench/results/hotpot-fresh-4b-27bjudge.jsonl', 3.4 + 17.8, false],
  ['4B reader + 9B judge', 'b109-', 'bench/results/hotpot-fresh-4b-9bjudge.jsonl', 3.4 + 6.6, false],
  ['4B reader + kimi (hosted)', 'b95-', 'bench/results/hotpot-fresh-301-600.jsonl', 3.4, false],
]
console.log('config                       cov%(ans)  unk_abst%(unans)  verified_acc%  false_accept  s/rec  GB')
for (const [name, run, file, gb, raw] of configs) {
  let R = byRun(run) ?? load(file)
  if (!R.length) { console.log(`${name.padEnd(28)} (missing ${run} in unified.jsonl/unified-public.jsonl and ${file})`); continue }
  R = R.slice(0, 200) // rows 301-400 (all files ordered by row, then condition)
  const shown = (x) => raw ? !x.reader_abstained : shownGated(x)
  const ans = R.filter((x) => x.condition === 'answerable'), un = R.filter((x) => x.condition === 'unanswerable')
  const cov = ans.filter(shown).length
  const unk = un.filter((x) => !shown(x)).length
  const ve = R.filter((x) => x.state === 'verified')
  const veOk = ve.filter((x) => lab(x)).length
  const fa = raw ? R.filter((x) => !x.reader_abstained && !lab(x)).length : R.filter((x) => x.state === 'verified' && !lab(x)).length
  const secs = R.reduce((a, x) => a + (x.seconds_reader ?? x.seconds ?? 0), 0) / R.length
  console.log(`${name.padEnd(28)} ${pct(cov, ans.length).padEnd(10)} ${pct(unk, un.length).padEnd(17)} ${(raw ? '—' : pct(veOk, ve.length)).padEnd(14)} ${String(fa).padEnd(13)} ${secs.toFixed(2).padEnd(6)} ${gb}`)
}
console.log('\n  cov%(ans) = answerable shown (verified+unverified); unk_abst%(unans) = unanswerable not_found;')
console.log('  verified_acc% = correct among verified; false_accept = verified & wrong (raw rows: answered & wrong — the row above the gate has no shown/verified split); GB = nominal resident model size (quantized weights, not measured RSS).')
