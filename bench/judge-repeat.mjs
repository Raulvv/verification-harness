#!/usr/bin/env node
// Determinism-aware judge harness. Judges each stored reader output k times
// (schema-constrained, temp 0) and reports: per-pass AUROC + mean/range, how
// many items flip score across passes, and a calibration table. This exists
// because a single pass of a hosted judge is NOT deterministic (see B110).
//
//   node bench/judge-repeat.mjs [records.jsonl] [judge] [k]
import { readFileSync } from 'node:fs'
import { hotpotRows } from './ingest-hotpot.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'

const FILE = process.argv[2] ?? 'bench/results/hotpot-fresh-301-600.jsonl'
const JUDGE = process.argv[3] ?? 'kimi-k3'
const K = Number(process.argv[4] ?? 3)
const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const isLocal = (m) => !/^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(m)
const M = isLocal(JUDGE) ? { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: JUDGE } : { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: KEY, model: JUDGE }
const y = (x) => (x.condition === 'answerable' && x.reader_correct === 1 ? 1 : 0)
const stateOf = (s) => (s == null ? 'unverified' : s >= 5 ? 'verified' : s >= 2 ? 'unverified' : 'not_found')

const r = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(0, 200)
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
console.log(`Determinism harness · ${FILE} · judge ${JUDGE} · k=${K} · N=${r.length}\n`)

const scores = [] // per item: { y, runs:[...] }
let i = 0
for (const x of r) {
  if (x.reader_abstained) { scores.push({ y: y(x), runs: Array(K).fill(null), abstained: true }); continue }
  const row = byId.get(x.id); const gold = new Set((row.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))
  const paras = row.context.title.map((t, j) => ({ title: t, text: (row.context.sentences[j] ?? []).join(' ') }))
  const keep = x.condition === 'answerable' ? paras : paras.filter((p) => !gold.has(String(p.title).toLowerCase()))
  const ev = keep.map((p) => `# ${p.title}\n${p.text}`).join('\n\n')
  const runs = []
  for (let k = 0; k < K; k++) { let s = null; try { s = await judgeGrade(M, row.question, ev, x.answer) } catch {} ; runs.push(s) }
  scores.push({ y: y(x), runs, abstained: false, answerable: x.condition === 'answerable' })
  if (++i % 10 === 0) process.stderr.write('.')
}

// AUROC per pass + pooled (mean score)
const auroc = (items, get) => {
  const pos = items.filter((s) => s.y === 1).map(get), neg = items.filter((s) => s.y === 0).map(get)
  let w = 0; for (const a of pos) for (const b of neg) w += a > b ? 1 : a === b ? 0.5 : 0
  return pos.length && neg.length ? w / (pos.length * neg.length) : NaN
}
const scored = scores.filter((s) => !s.abstained)
const passes = []
for (let k = 0; k < K; k++) passes.push(auroc(scored, (s) => s.runs[k]))
const meanAU = passes.reduce((a, b) => a + b, 0) / K
console.log(`AUROC vs oracle (per pass): ${passes.map((p) => p.toFixed(3)).join('  ')}`)
console.log(`  mean ${meanAU.toFixed(3)} · range ${(Math.max(...passes) - Math.min(...passes)).toFixed(3)} · min ${Math.min(...passes).toFixed(3)} max ${Math.max(...passes).toFixed(3)}`)

// flip analysis
let anyFlip = 0, stateFlip = 0, nullRuns = 0
for (const s of scored) {
  const vals = s.runs
  if (new Set(vals).size > 1) anyFlip++
  if (new Set(vals.map(stateOf)).size > 1) stateFlip++
  nullRuns += vals.filter((v) => v == null).length
}
console.log(`\nitems with any score flip: ${anyFlip}/${scored.length} (${(100 * anyFlip / scored.length).toFixed(1)}%)`)
console.log(`items whose STATE flips (verified/unverified/not_found): ${stateFlip}/${scored.length} (${(100 * stateFlip / scored.length).toFixed(1)}%)`)
console.log(`null returns: ${nullRuns}/${scored.length * K} calls (${(100 * nullRuns / (scored.length * K)).toFixed(1)}%)`)

// calibration on pass 0 (answerable)
console.log('\ncalibration (answerable, pass 0): score -> correct/n')
const line = []
for (let s = 1; s <= 5; s++) { const g = scored.filter((x) => x.answerable && x.runs[0] === s); if (g.length) line.push(`${s}: ${g.filter((x) => x.y === 1).length}/${g.length}`) }
console.log('  ' + line.join('  '))
