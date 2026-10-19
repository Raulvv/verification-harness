#!/usr/bin/env node
// Mechanical hop check — evaluation on the private corpus (B108/B111/B113).
//
// Reads a private-run export (which carries `hops_missing` from
// lib/hopcheck.mjs) and compares the LLM-judge tri-state against the
// hop-checked tri-state. The hop check downgrades `verified` → `unverified`
// when the receipt did not cite BOTH source documents (one hop uncited ⇒ the
// answer is incomplete, even if the surviving hop reads as support).
//
// Target (next-step spec): partial verified < 5%, answerable coverage ≥ 85%.
//
//   node bench/hopcheck-eval.mjs [records.jsonl]
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] ?? 'bench/results/private-4b.jsonl'
const r = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-')

const hopChecked = (x) => (x.hops_missing?.length > 0 && x.state === 'verified' ? 'unverified' : x.state)

console.log(`Mechanical hop check · ${FILE} · N=${r.length}\n`)
console.log('condition     N   | base: shown%  verified%  ver_acc% | hop-check: shown%  verified%  ver_acc%')
for (const c of ['answerable', 'partial', 'unanswerable']) {
  const g = r.filter((x) => x.condition === c)
  if (!g.length) continue
  const baseShown = g.filter((x) => x.state !== 'not_found').length
  const baseVer = g.filter((x) => x.state === 'verified')
  const hcShown = g.filter((x) => hopChecked(x) !== 'not_found').length
  const hcVer = g.filter((x) => hopChecked(x) === 'verified')
  const verAcc = (ve) => (ve.length ? pct(ve.filter((x) => x.reader_correct).length, ve.length) : '-')
  console.log(`${c.padEnd(13)} ${String(g.length).padEnd(3)} | ${pct(baseShown, g.length).padStart(5)}%   ${pct(baseVer.length, g.length).padStart(7)}%   ${verAcc(baseVer).padStart(6)}% | ${pct(hcShown, g.length).padStart(7)}%   ${pct(hcVer.length, g.length).padStart(7)}%   ${verAcc(hcVer).padStart(6)}%`)
}

const partial = r.filter((x) => x.condition === 'partial')
const partialVerified = partial.filter((x) => hopChecked(x) === 'verified').length
const ans = r.filter((x) => x.condition === 'answerable')
const ansCoverage = pct(ans.filter((x) => hopChecked(x) !== 'not_found').length, ans.length)
console.log(`\npartial verified (hop-checked): ${partialVerified}/${partial.length} (${pct(partialVerified, partial.length)}%)  [target < 5%]`)
console.log(`answerable coverage (hop-checked): ${ansCoverage}%  [target ≥ 85%]`)
console.log(`\nanswerable receipt completeness: cited BOTH docs ${ans.filter((x) => x.hops_missing?.length === 0).length}/${ans.length} (${pct(ans.filter((x) => x.hops_missing?.length === 0).length, ans.length)}%)`)
