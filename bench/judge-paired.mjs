#!/usr/bin/env node
// Paired judge comparison on the SAME stored reader outputs (isolates the judge).
// Reads a fresh-run JSONL, rebuilds each item's window, and grades it with two
// judges (schema-constrained, temp 0). Reports paired state counts, quadratic-
// weighted kappa of the 0-5 scores, AUROC of each score against the oracle, a
// calibration table per judge, and the false-abstention split.
//
//   node bench/judge-paired.mjs [records.jsonl] [judgeA] [judgeB]
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hotpotRows } from './ingest-hotpot.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'

const FILE = process.argv[2] ?? 'bench/results/hotpot-fresh-4b-27bjudge.jsonl'
const A = process.argv[3] ?? 'kimi-k3'
const B = process.argv[4] ?? 'oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU'
const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const isLocal = (m) => !/^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(m)
const model = (m) => isLocal(m) ? { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: m } : { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: KEY, model: m }
const LO = 2, HI = 5
const stateOf = (s) => (s == null ? 'unverified' : s >= HI ? 'verified' : s >= LO ? 'unverified' : 'not_found')

const r = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
const scored = []
console.log(`Paired judges on ${FILE}: A=${A} B=${B}\n`)
for (const x of r) {
  const row = byId.get(x.id); if (!row) continue
  const gold = new Set((row.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))
  const paras = row.context.title.map((t, i) => ({ title: t, text: (row.context.sentences[i] ?? []).join(' ') }))
  const keep = x.condition === 'answerable' ? paras : paras.filter((p) => !gold.has(String(p.title).toLowerCase()))
  const ev = keep.map((p) => `# ${p.title}\n${p.text}`).join('\n\n')
  const sa = x.reader_abstained ? null : await judgeGrade(model(A), row.question, ev, x.answer)
  const sb = x.reader_abstained ? null : await judgeGrade(model(B), row.question, ev, x.answer)
  scored.push({ condition: x.condition, correct: x.reader_correct, a: sa, b: sb })
  process.stderr.write('.')
}
const pct = (x, n) => (n ? (100 * x / n).toFixed(1) : '-')

// paired states
const PAIRS = ['verified', 'unverified', 'not_found']
const tab = {}; for (const p of PAIRS) { tab[p] = {}; for (const q of PAIRS) tab[p][q] = 0 }
for (const s of scored) tab[stateOf(s.a)][stateOf(s.b)]++
console.log('\npaired state table (rows=A ' + A + ', cols=B ' + B + '):')
console.log('            ' + PAIRS.map((p) => p.padEnd(12)).join(''))
for (const p of PAIRS) console.log(p.padEnd(12) + PAIRS.map((q) => String(tab[p][q]).padEnd(12)).join(''))
console.log(`A unverified ${PAIRS.reduce((a, p) => a + tab[p].unverified, 0)} · B unverified ${PAIRS.reduce((a, p) => a + tab.unverified[p], 0)}`)

// quadratic-weighted kappa on the 0-5 scores
const pairs = scored.filter((s) => s.a != null && s.b != null)
const wkappa = (ps, k = 5) => {
  const n = ps.length; let obs = 0, exp = 0
  const oa = Array(k + 1).fill(0), ob = Array(k + 1).fill(0)
  for (const s of ps) { oa[s.a]++; ob[s.b]++ }
  for (const s of ps) obs += 1 - Math.pow((s.a - s.b) / k, 2)
  obs /= n
  for (let i = 0; i <= k; i++) for (let j = 0; j <= k; j++) exp += (oa[i] / n) * (ob[j] / n) * (1 - Math.pow((i - j) / k, 2))
  return (obs - exp) / (1 - exp)
}
console.log(`\nquadratic-weighted kappa (0-5 scores): ${wkappa(pairs).toFixed(3)} (n=${pairs.length})`)

// AUROC of each judge's score against the oracle (positive = answerable AND correct)
const y = (s) => (s.condition === 'answerable' && s.correct === 1 ? 1 : 0)
const auroc = (ps, key) => {
  const pos = ps.filter((s) => y(s) === 1).map((s) => s[key]); const neg = ps.filter((s) => y(s) === 0).map((s) => s[key])
  let wins = 0; for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0
  return pos.length && neg.length ? wins / (pos.length * neg.length) : NaN
}
console.log(`AUROC vs oracle: A ${auroc(pairs, 'a').toFixed(3)} · B ${auroc(pairs, 'b').toFixed(3)}`)

// calibration table (answerable): correct rate per score
console.log('\ncalibration (answerable): score -> n, correct rate')
for (const key of ['a', 'b']) {
  const line = []
  for (let s = 1; s <= 5; s++) { const g = scored.filter((x) => x.condition === 'answerable' && x[key] === s); if (g.length) line.push(`${s}: ${g.length}/${g.filter((x) => x.correct === 1).length}`) }
  console.log(`  ${key === 'a' ? A : B}: ` + line.join('  '))
}

// false-abstention split (answerable): gate not_found -> correct lost vs wrong removed
console.log('\nfalse-abstention split (answerable, gate=not_found):')
for (const key of ['a', 'b']) {
  const nf = scored.filter((x) => x.condition === 'answerable' && stateOf(x[key]) === 'not_found')
  const lost = nf.filter((x) => x.correct === 1).length, removed = nf.filter((x) => x.correct === 0).length
  console.log(`  ${key === 'a' ? A : B}: ${nf.length} abstained = ${lost} correct LOST + ${removed} wrong removed`)
}
