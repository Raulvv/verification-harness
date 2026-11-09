#!/usr/bin/env node
// Recompute every tier-1 claim of PROVENANCE.md from provenance/data/.
// Read-only, no network, no model calls, no dependencies:
//
//   node bench/recompute-claims.mjs
//
// Prints each claim ID with its computed and expected value. Exit code 1 if
// any claim differs. Expected values are the canonical ones in PROVENANCE.md;
// the point of this script is that a reader can regenerate them from the data.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'provenance', 'data')

// --- minimal CSV (quoted fields supported) ---------------------------------
function parseCsv(text) {
  const rows = []
  for (const line of text.trim().split('\n').slice(1)) {
    const f = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === ',') { f.push(cur); cur = '' }
      else cur += c
    }
    f.push(cur)
    rows.push(f)
  }
  return rows
}

const HEADER = ['date','hash','messages','subagent_messages','tok_input','tok_cache_read',
  'tok_cache_write','tok_output','cost_usd','subagent_cost_usd','models','subject']
const rows = parseCsv(readFileSync(join(DATA, 'spend.csv'), 'utf8'))
  .map((f) => Object.fromEntries(HEADER.map((h, i) => [h, f[i] ?? ''])))
const n = (r, k) => Number(r[k]) || 0

// --- checks ----------------------------------------------------------------
const results = []
const check = (id, computed, expected, note = '') =>
  results.push({ id, computed, expected, note, ok: String(computed) === String(expected) })

// A1 — bill, commits, messages
const cost = rows.reduce((s, r) => s + n(r, 'cost_usd'), 0)
const msgs = rows.reduce((s, r) => s + n(r, 'messages'), 0)
check('A1a', `$${cost.toFixed(2)}`, '$727.90', 'total API-equivalent cost')
check('A1b', rows.length, 1000, 'commits')
check('A1c', msgs, 31821, 'assistant messages')

// A2 — tokens and the re-read ratio
const out = rows.reduce((s, r) => s + n(r, 'tok_output'), 0)
const cr = rows.reduce((s, r) => s + n(r, 'tok_cache_read'), 0)
check('A2a', `${(out / 1e6).toFixed(1)}M`, '13.1M', 'output tokens')
check('A2b', `${(cr / 1e9).toFixed(2)}B`, '8.16B', 'cache-read tokens')
check('A2c', Math.round(cr / out), 623, 'cache-read tokens per output token')

// A3 — monthly split
const months = {}
for (const r of rows) {
  const m = r.date.slice(0, 7)
  months[m] ??= { cost: 0, commits: 0 }
  months[m].cost += n(r, 'cost_usd')
  months[m].commits++
}
check('A3a', `$${months['2026-09'].cost.toFixed(2)}`, '$695.93', 'September cost')
check('A3b', `${(100 * months['2026-09'].cost / cost).toFixed(1)}%`, '95.6%', 'September share')
check('A3c', `$${months['2026-10'].cost.toFixed(2)}`, '$31.98', 'October cost')
check('A3d', months['2026-10'].commits, 419, 'October commits')

// A4 — top-12 commits
const top12 = [...rows].sort((a, b) => n(b, 'cost_usd') - n(a, 'cost_usd')).slice(0, 12)
const dates = new Set(top12.map((r) => r.date.slice(0, 10)))
check('A4a', [...dates].sort().join('+'), '2026-09-18+2026-09-19', 'top-12 dates')
check('A4b', `$${n(top12[0], 'cost_usd').toFixed(2)}`, '$63.31', 'largest single commit')

// A5 — subagent share
const subMsgs = rows.reduce((s, r) => s + n(r, 'subagent_messages'), 0)
const subCost = rows.reduce((s, r) => s + n(r, 'subagent_cost_usd'), 0)
check('A5a', `${(100 * subMsgs / msgs).toFixed(1)}%`, '35.4%', 'subagent share of messages')
check('A5b', `$${subCost.toFixed(2)}`, '$153.40', 'subagent cost (subset of total)')
check('A5c', `${(100 * subCost / cost).toFixed(1)}%`, '21.1%', 'subagent share of cost')

// A6 — pricing scheme by zero-residual regression on single-model commits,
// fitted per model (each model has its own price vector). The check reports
// the metered reference model (claude-sonnet-5).
// cost = (r_in*tok_in + r_cr*tok_cr + r_cw*tok_cw + r_out*tok_out) / 1e6
function solve(A, b) {
  const n0 = b.length
  for (let i = 0; i < n0; i++) {
    let p = i
    for (let r = i + 1; r < n0; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    ;[A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]
    if (Math.abs(A[i][i]) < 1e-18) return null
    for (let r = 0; r < n0; r++) {
      if (r === i) continue
      const g = A[r][i] / A[i][i]
      for (let c = i; c < n0; c++) A[r][c] -= g * A[i][c]
      b[r] -= g * b[i]
    }
  }
  return b.map((v, i) => v / A[i][i])
}
function fit(samples) {
  const A = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], b = [0, 0, 0, 0]
  for (const r of samples) {
    const x = [n(r,'tok_input'), n(r,'tok_cache_read'), n(r,'tok_cache_write'), n(r,'tok_output')].map((v) => v / 1e6)
    const y = n(r, 'cost_usd')
    for (let i = 0; i < 4; i++) {
      b[i] += x[i] * y
      for (let j = 0; j < 4; j++) A[i][j] += x[i] * x[j]
    }
  }
  return solve(A.map((row) => [...row]), [...b])
}
const single = rows.filter((r) => r.models.trim().split(/\s+/).length === 1 && n(r, 'cost_usd') > 0)
const byModel = new Map()
for (const r of single) {
  const m = r.models.trim()
  if (!byModel.has(m)) byModel.set(m, [])
  byModel.get(m).push(r)
}
const ref = byModel.get('claude-sonnet-5')
const rates = fit(ref)
let resid = 0
for (const r of ref) {
  const x = [n(r,'tok_input'), n(r,'tok_cache_read'), n(r,'tok_cache_write'), n(r,'tok_output')].map((v) => v / 1e6)
  resid = Math.max(resid, Math.abs(x.reduce((s, v, i) => s + v * rates[i], 0) - n(r, 'cost_usd')))
}
check('A6a', rates.map((v) => v.toFixed(2)).join('/'), '3.00/0.30/3.75/15.00',
  `$/M in/cr/cw/out (claude-sonnet-5, n=${ref.length} single-model commits)`)
check('A6b', `$${resid.toFixed(3)}`, '$0.000', 'max regression residual')

// A7 — Sonnet-labelled commits only in 2026-09
const sonnet = rows.filter((r) => r.models.includes('sonnet'))
check('A7', [...new Set(sonnet.map((r) => r.date.slice(0, 7)))].sort().join('+'), '2026-09',
  `${sonnet.length} sonnet rows`)

// B4 — Naruto sanity check
const naruto = JSON.parse(readFileSync(join(DATA, 'naruto-batch.json'), 'utf8'))
check('B4a', naruto.n, 20, 'naruto questions')
check('B4b', naruto.correct, 7, 'naruto correct')

// A10 — chain of custody: every migrated artifact matches MANIFEST.md
{
  const man = readFileSync(join(ROOT, 'provenance', 'MANIFEST.md'), 'utf8')
  const entries = [...man.matchAll(/^- `(provenance\/[^`]+)`: source `([0-9a-f]+)`, migrated `([0-9a-f]+)`$/gm)]
  let ok = 0
  for (const [, rel, , want] of entries) {
    const got = createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex')
    if (got === want) ok++
  }
  check('A10', `${ok}/${entries.length}`, '22/22', 'MANIFEST migrated SHA-256')
}

// B5/B7 — model-size sweep, recomputed from the committed run rows
const cx = JSON.parse(readFileSync(join(DATA, 'crossover-100.json'), 'utf8'))
const fa = JSON.parse(readFileSync(join(DATA, 'final-arms-100.json'), 'utf8'))
const tb = readFileSync(join(DATA, 'tier-b-hotpot-300-judged.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
const qmean = (rows, arm, judge = 'qwen') => {
  const v = rows.filter((r) => r[arm]).map((r) => r[arm][judge])
  return `${(100 * v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)}%`
}
check('B5a', qmean(cx, 'bare4'), '24.0%', 'closed-book 4B (qwen)')
check('B5b', qmean(cx, 'naive4'), '80.0%', 'plain RAG 4B')
check('B5c', qmean(cx, 'full4'), '86.0%', 'receipt 4B')
check('B5d', qmean(tb.slice(0, 100), 'bare'), '31.0%', 'closed-book 9B (tier-b head-100)')
check('B5e', qmean(cx, 'naive9'), '80.0%', 'plain RAG 9B')
check('B5f', qmean(cx, 'full9'), '87.0%', 'receipt 9B')
check('B5g', qmean(fa, 'bare27'), '36.0%', 'closed-book 27B')
check('B5h', qmean(fa, 'ours27'), '87.0%', 'receipt 27B')
check('B7', `${qmean(cx, 'full4', 'granite')}/${qmean(cx, 'full9', 'granite')}/${qmean(fa, 'ours27', 'granite')}`,
  '93.0%/93.0%/93.0%', 'Granite receipt row 4B/9B/27B')

// B19 — AbstentionBench official vs blind, recomputed from judged rows
const prfStr = (file, arm, pred) => {
  const rows = readFileSync(join(DATA, file), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.arm === arm)
  const tp = rows.filter((r) => r[pred] && r.should_abstain).length
  const fp = rows.filter((r) => r[pred] && !r.should_abstain).length
  const fn = rows.filter((r) => !r[pred] && r.should_abstain).length
  const p = tp + fp ? (100 * tp) / (tp + fp) : 0
  const rec = tp + fn ? (100 * tp) / (tp + fn) : 0
  const f1 = p + rec ? (2 * p * rec) / (p + rec) : 0
  return `${p.toFixed(1)}/${rec.toFixed(1)}/${f1.toFixed(1)}`
}
check('B19a', prfStr('abstentionbench-judged.jsonl', 'rail', 'is_abstention'), '91.1/94.4/92.7', 'SQuAD rail official P/R/F1')
check('B19b', prfStr('abstentionbench-judged.jsonl', 'naive', 'is_abstention'), '94.0/87.0/90.4', 'SQuAD naive official')
check('B19c', prfStr('abstentionbench-judged-blind.jsonl', 'rail', 'blind_abstention'), '51.8/53.7/52.7', 'SQuAD rail blind')
check('B19d', prfStr('abstentionbench-judged-blind.jsonl', 'naive', 'blind_abstention'), '60.4/53.7/56.9', 'SQuAD naive blind')
check('B19e', prfStr('abstentionbench-judged-musique.jsonl', 'rail', 'is_abstention'), '83.7/100.0/91.1', 'Musique rail official')
check('B19f', prfStr('abstentionbench-judged-musique.jsonl', 'naive', 'is_abstention'), '93.9/75.6/83.8', 'Musique naive official')
check('B19g', prfStr('abstentionbench-judged-musique-blind.jsonl', 'rail', 'blind_abstention'), '54.4/75.6/63.3', 'Musique rail blind')
check('B19h', prfStr('abstentionbench-judged-musique-blind.jsonl', 'naive', 'blind_abstention'), '62.2/56.1/59.0', 'Musique naive blind')
const agree = (of, bl, arm) => {
  const O = new Map(readFileSync(join(DATA, of), 'utf8').trim().split('\n').map(JSON.parse).map((r) => [r.id + '|' + r.arm, r.is_abstention]))
  const B = readFileSync(join(DATA, bl), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.arm === arm)
  let same = 0
  for (const r of B) if (O.get(r.id + '|' + r.arm) === r.blind_abstention) same++
  return `${Math.round((100 * same) / B.length)}%`
}
check('B19i', `${agree('abstentionbench-judged.jsonl', 'abstentionbench-judged-blind.jsonl', 'rail')}/${agree('abstentionbench-judged.jsonl', 'abstentionbench-judged-blind.jsonl', 'naive')}`, '56%/64%', 'SQuAD official↔blind agreement rail/naive')
check('B19j', `${agree('abstentionbench-judged-musique.jsonl', 'abstentionbench-judged-musique-blind.jsonl', 'rail')}/${agree('abstentionbench-judged-musique.jsonl', 'abstentionbench-judged-musique-blind.jsonl', 'naive')}`, '70%/80%', 'Musique official↔blind agreement rail/naive')

// B20 — SQuAD 2.0 label audit, recomputed from the adjudication TSV
{
  const lines = readFileSync(join(DATA, 'squad54-audit.tsv'), 'utf8').trim().split('\n')
  const hdr = lines[0].split('\t')
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [hdr[i], v])))
  const cat = {}
  for (const r of rows) cat[r.category] = (cat[r.category] ?? 0) + 1
  check('B20a', rows.length, 54, 'adjudicated items')
  check('B20b', `A${cat.A}/N${cat.N}/C${cat.C}/F${cat.F}/G${cat.G}/U${cat.U}`, 'A13/N3/C1/F32/G4/U1', 'label composition')
  const correct = (r, key) =>
    r[key] === 'correct' || r[key] === 'corrected' || (r[key] === 'abstain' && (r.category === 'F' || r.category === 'G'))
  const nu = rows.filter((r) => r.category !== 'U')
  check('B20c', `${nu.filter((r) => correct(r, 'rail_outcome')).length}/${nu.length}`, '46/53', 'rail, corrected human view')
  check('B20d', `${nu.filter((r) => correct(r, 'naive_outcome')).length}/${nu.length}`, '48/53', 'naive, corrected human view')
}

// --- report ----------------------------------------------------------------
console.log('PROVENANCE tier-1 recomputation (provenance/data/)\n')
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'DIFF'} ${r.id}  ${String(r.computed).padEnd(28)} expected ${String(r.expected).padEnd(22)} ${r.note}`)
}
const bad = results.filter((r) => !r.ok).length
console.log(`\n${results.length - bad}/${results.length} claims reproduce${bad ? ` — ${bad} DIFF` : ''}`)
process.exit(bad ? 1 : 0)
