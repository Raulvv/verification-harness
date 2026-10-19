#!/usr/bin/env node
// Judge determinism on the private corpus (the B110 analog for the qwen3.5:9b
// judge the private runs actually use). Re-grades each stored reader output k
// times (schema-constrained, temp 0) and reports: per-pass score agreement,
// score flips, tri-state flips, and the median score for items that ever score
// 4-5. Exists because a single pass of a judge is not deterministic in general
// (B110: the hosted judge flips 9.4% of labels); the local 9B is expected to
// flip ~0, but the private-corpus number is unmeasured until this runs.
//
//   node bench/private-judge-repeat.mjs [records.jsonl] [k] [limit]
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'

const FILE = process.argv[2] ?? 'bench/results/private-4b-full.jsonl'
const K = Number(process.argv[3] ?? 3)
const LIMIT = Number(process.argv[4] ?? 0)
const JUDGE = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: process.env.JUDGE_MODEL ?? 'qwen3.5:9b' }
const LO = 2, HI = 5
const stateOf = (s) => (s == null ? 'unverified' : s >= HI ? 'verified' : s >= LO ? 'unverified' : 'not_found')

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [] })
const DOC = new Map(walk('docs').map((p) => [relative('docs', p).replace(/\.md$/, ''), { title: (readFileSync(p, 'utf8').match(/^#\s+(.+)$/m) ?? [, relative('docs', p)])[1].trim(), body: readFileSync(p, 'utf8').slice(0, 3000) }]))

const Q = new Map(readFileSync('bench/results/private-questions.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((q) => [q.id, q]))
const records = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const scored = records.filter((x) => !x.reader_abstained && !x.parse_failure)
const N = LIMIT > 0 ? scored.slice(0, LIMIT) : scored
console.log(`Private judge repeat · ${FILE} · judge ${JUDGE.model} · k=${K} · scoring ${N.length} answered records\n`)

let i = 0
const out = []
for (const x of N) {
  const q = Q.get(x.id); if (!q) continue
  const ids = x.condition === 'answerable' ? [q.docA, q.docB, ...q.distractors] : x.condition === 'partial' ? [q.docA, ...q.distractors] : [...q.distractors]
  const dir = mkdtempSync(join(tmpdir(), 'jr-'))
  const docs = []
  for (const id of ids) { const d = DOC.get(id); if (!d) continue; docs.push(d) }
  const ev = docs.map((d) => `# ${d.title}\n${d.body}`).join('\n\n')
  const runs = []
  for (let k = 0; k < K; k++) { let s = null; try { s = await judgeGrade(JUDGE, q.question, ev, x.answer) } catch {}; runs.push(s) }
  rmSync(dir, { recursive: true, force: true })
  out.push({ id: x.id, condition: x.condition, stored: x.score, runs })
  if (++i % 5 === 0) process.stderr.write('.')
}

let anyFlip = 0, stateFlip = 0, nulls = 0
for (const o of out) {
  const vals = o.runs
  if (new Set(vals).size > 1) anyFlip++
  if (new Set(vals.map(stateOf)).size > 1) stateFlip++
  nulls += vals.filter((v) => v == null).length
}
console.log(`\nscore flips: ${anyFlip}/${out.length} (${(100 * anyFlip / out.length).toFixed(1)}%)`)
console.log(`state flips: ${stateFlip}/${out.length} (${(100 * stateFlip / out.length).toFixed(1)}%)`)
console.log(`null returns: ${nulls}/${out.length * K} (${(100 * nulls / (out.length * K)).toFixed(1)}%)`)

// median score for items that ever score 4-5 (the borderline band)
const hi = out.filter((o) => o.runs.some((v) => v >= 4))
const median = (a) => { const s = [...a].filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
let medianChanged = 0
for (const o of hi) { const m = median(o.runs); if (m !== o.stored) medianChanged++ }
console.log(`\nitems ever scoring 4-5: ${hi.length}; median differs from stored pass: ${medianChanged}`)
