#!/usr/bin/env node
// Private-corpus re-grade, with parse failures as their own bucket.
//
// Two DIFFERENT mechanical signals (neither is "the" accuracy):
//  - gold-token-coverage: the answer restates the GOLD answer's content words —
//    an ACCURACY proxy (≈ the oracle, and like the oracle it is lenient).
//  - both-facts completeness: the answer restates BOTH stored source facts
//    (factA AND factB) — a COMPLETENESS measure, stricter than accuracy (a correct
//    answer may state only the final fact, not both source facts).
//
// Parse failures (the reader emitted unparseable JSON) are reported as their own
// bucket and excluded from both rates — they are decode failures, not answers.
//
//   node bench/private-regrade.mjs [records.jsonl] [questions.jsonl]
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] ?? 'bench/results/private-4b-v2.jsonl'
const QFILE = process.argv[3] ?? 'bench/results/private-questions-v2.jsonl'
const r = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const Q = new Map(readFileSync(QFILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((q) => [q.id, q]))
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-')

const toks = (s) => new Set(String(s ?? '').toLowerCase().match(/[a-z0-9]{4,}/g) || [])
const covers = (answer, fact) => { const f = toks(fact); if (!f.size) return true; let n = 0; const a = toks(answer); for (const t of f) if (a.has(t)) n++; return n / f.size >= 0.5 }
const goldCover = (x, q) => covers(x.answer, q.answer)
const bothFacts = (x, q) => covers(x.answer, q.factA) && covers(x.answer, q.factB)

console.log(`Private re-grade · ${FILE} · N=${r.length}\n`)
console.log('condition     N   parse_fail  oracle(parseable)  gold-cover  both-facts-completeness')
for (const c of ['answerable', 'partial', 'unanswerable']) {
  const g = r.filter((x) => x.condition === c)
  const pf = g.filter((x) => x.parse_failure === 1).length
  const ok = g.filter((x) => x.parse_failure !== 1)
  const orc = ok.filter((x) => x.reader_correct === 1).length
  const gc = ok.filter((x) => { const q = Q.get(x.id); return goldCover(x, q) }).length
  const bf = ok.filter((x) => { const q = Q.get(x.id); return bothFacts(x, q) }).length
  console.log(`${c.padEnd(13)} ${String(g.length).padEnd(3)} ${String(pf).padEnd(11)} ${String(orc).padEnd(19)} ${String(gc).padEnd(12)} ${bf}`)
}

const ans = r.filter((x) => x.condition === 'answerable')
const ansPf = ans.filter((x) => x.parse_failure === 1).length
const ansOk = ans.filter((x) => x.parse_failure !== 1)
const orc = ansOk.filter((x) => x.reader_correct === 1).length
const gc = ansOk.filter((x) => { const q = Q.get(x.id); return goldCover(x, q) }).length
const bf = ansOk.filter((x) => { const q = Q.get(x.id); return bothFacts(x, q) }).length
console.log(`\nanswerable (N=100): parse_failure ${ansPf}; on the ${ansOk.length} parseable rows —`)
console.log(`  oracle accuracy      ${orc} = ${pct(orc, ansOk.length)}%`)
console.log(`  gold-token coverage  ${gc} = ${pct(gc, ansOk.length)}%   (accuracy proxy, ≈ oracle)`)
console.log(`  both-facts complete  ${bf} = ${pct(bf, ansOk.length)}%   (completeness rate, NOT accuracy)`)
