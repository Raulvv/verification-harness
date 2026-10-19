#!/usr/bin/env node
// Prompt ablation: flat grade vs hop-coverage grade, SAME judge (qwen3.5:9b),
// SAME items (the partial run). Tests whether enumerating required facts stops
// the gate from verifying a well-supported-but-incomplete answer (B108).
//
//   node bench/judge-coverage.mjs [records.jsonl] [judge]
import { readFileSync } from 'node:fs'
import { hotpotRows } from './ingest-hotpot.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'
import { judgeCoverage } from './lib/coverage.mjs'

const FILE = process.argv[2] ?? 'bench/results/hotpot-fresh-partial-4b.jsonl'
const JUDGE = process.argv[3] ?? 'qwen3.5:9b'
const M = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: JUDGE }
const LO = 2, HI = 5
const stateOf = (s) => (s == null ? 'unverified' : s >= HI ? 'verified' : s >= LO ? 'unverified' : 'not_found')

const r = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
const out = []
console.log(`Coverage ablation · ${FILE} · judge ${JUDGE} · N=${r.length}\n`)
let i = 0
for (const x of r) {
  const row = byId.get(x.id); if (!row) continue
  const gold = new Set((row.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))
  const goldList = [...new Set((row.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))]
  const paras = row.context.title.map((t, j) => ({ title: t, text: (row.context.sentences[j] ?? []).join(' ') }))
  const keep = x.condition === 'answerable' ? paras
    : x.condition === 'unanswerable' ? paras.filter((p) => !gold.has(String(p.title).toLowerCase()))
      : paras.filter((p) => String(p.title).toLowerCase() !== goldList[0])
  const ev = keep.map((p) => `# ${p.title}\n${p.text}`).join('\n\n')
  let flat = null, cov = null
  if (!x.reader_abstained) {
    if (!process.env.COVONLY) flat = await judgeGrade(M, row.question, ev, x.answer)
    const c = await judgeCoverage(M, row.question, ev, x.answer)
    cov = c == null ? null : c.score
  }
  out.push({ condition: x.condition, correct: x.reader_correct, abstained: x.reader_abstained ? 1 : 0, flat, cov })
  if (++i % 10 === 0) process.stderr.write('.')
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-')
console.log('\ncondition     judge     N   not_found%  verified%  verified_acc%  false_accept')
for (const c of ['answerable', 'unanswerable', 'partial']) {
  const g = out.filter((x) => x.condition === c)
  for (const [name, key] of [['flat', 'flat'], ['coverage', 'cov']]) {
    const nf = g.filter((x) => x.abstained ? true : stateOf(x[key]) === 'not_found').length
    const ve = g.filter((x) => !x.abstained && stateOf(x[key]) === 'verified')
    const veOk = ve.filter((x) => x.correct === 1).length
    console.log(`${c.padEnd(13)} ${name.padEnd(9)} ${String(g.length).padEnd(3)} ${pct(nf, g.length).padEnd(11)} ${pct(ve.length, g.length).padEnd(10)} ${pct(veOk, ve.length).padEnd(14)} ${ve.length - veOk}`)
  }
}
// answerable coverage (shown) must not drop
const ans = out.filter((x) => x.condition === 'answerable')
const shownFlat = ans.filter((x) => x.abstained ? false : stateOf(x.flat) !== 'not_found').length
const shownCov = ans.filter((x) => x.abstained ? false : stateOf(x.cov) !== 'not_found').length
console.log(`\nanswerable coverage (shown): flat ${pct(shownFlat, ans.length)}%  coverage ${pct(shownCov, ans.length)}%`)
