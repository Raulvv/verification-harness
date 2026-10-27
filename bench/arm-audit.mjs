#!/usr/bin/env node
// Blinded hand-audit of every WRONG-SHOWN row, then a corrected report.
// The hand check that found the object-gold bug covered 20 rows; this covers all
// rows an arm showed that the scorer did not count as correct, because string
// golds on partials use the same strict matching.
//
//   node bench/arm-audit.mjs sheet   --rows <rows.jsonl> --questions <q.jsonl> [--out bench/results/audit]
//       -> audit-sheet.csv (arm hidden, shuffled, identical answers merged) + audit-key.json
//   node bench/arm-audit.mjs ingest  --rows <rows.jsonl> --questions <q.jsonl> --sheet <filled.csv> --key <audit-key.json>
//       -> per-arm wrong-shown before/after the audit, and false-accept under BOTH definitions
//
// Verdict column values: ok (answer is actually correct/acceptable), wrong, unsure.
// Fill it WITHOUT looking at the key. Arms are never printed in the sheet.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const [cmd, ...rest] = process.argv.slice(2)
const opt = (n, d) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : d }
const jsonl = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = jsonl(opt('rows'))
const items = new Map(jsonl(opt('questions')).map((x) => [x.id, x]))

// wrong shown = the arm presented an answer and the scorer did not call it correct.
// (unanswerable: any shown answer is wrong by definition.)
const wrongShown = (r) => r.shown && !r.correct
const csv = (s) => '"' + String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ⏎ ') + '"'
function parseCsv(text) {
  const out = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); out.push(row) }
  return out
}
const seededShuffle = (a, seed) => { // deterministic: same input => same sheet
  let s = parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16)
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const keyOf = (r) => `${r.id}\u0000${(r.text ?? '').trim()}`

if (cmd === 'sheet') {
  const groups = new Map()
  for (const r of rows.filter(wrongShown)) {
    const k = keyOf(r)
    if (!groups.has(k)) groups.set(k, { id: r.id, condition: r.condition, text: r.text, members: [] })
    groups.get(k).members.push({ arm: r.arm, seed: r.seed ?? 0 })
  }
  const list = seededShuffle([...groups.values()], 'arm-audit-v1').map((g, i) => ({ ...g, audit_id: 'a' + String(i + 1).padStart(3, '0') }))
  const dir = resolve(opt('out', 'bench/results/audit')); mkdirSync(dir, { recursive: true })
  const head = 'audit_id,condition,question,gold,answer_shown,verdict(ok|wrong|unsure),note'
  const body = list.map((g) => {
    const it = items.get(g.id)
    return [g.audit_id, g.condition, csv(it?.question), csv(typeof it?.gold === 'object' ? JSON.stringify(it.gold) : it?.gold), csv(g.text), '', ''].join(',')
  })
  writeFileSync(`${dir}/audit-sheet.csv`, [head, ...body].join('\n') + '\n')
  writeFileSync(`${dir}/audit-key.json`, JSON.stringify(Object.fromEntries(list.map((g) => [g.audit_id, { id: g.id, text: g.text, members: g.members }])), null, 1))
  console.log(`${rows.filter(wrongShown).length} wrong-shown rows -> ${list.length} unique answers to judge (identical answers merged).\nsheet: ${dir}/audit-sheet.csv\nkey (do not open while judging): ${dir}/audit-key.json`)
} else if (cmd === 'ingest') {
  const key = JSON.parse(readFileSync(opt('key'), 'utf8'))
  const [, ...lines] = parseCsv(readFileSync(opt('sheet'), 'utf8'))
  const verdict = new Map(lines.filter((l) => l[0]).map((l) => [l[0], (l[5] ?? '').trim().toLowerCase()]))
  const missing = [...Object.keys(key)].filter((id) => !['ok', 'wrong', 'unsure'].includes(verdict.get(id)))
  if (missing.length) { console.error(`unfilled/invalid verdicts: ${missing.join(', ')}`); process.exit(1) }
  const byRow = new Map()
  for (const [aid, g] of Object.entries(key)) for (const m of g.members) byRow.set(`${m.arm}|${m.seed}|${g.id}`, verdict.get(aid))
  const wilson = (k, n, z = 1.96) => { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d] }
  const fmt = (k, n) => { const [a, b] = wilson(k, n); return `${(100 * k / n).toFixed(0)}% [${Math.max(0, 100 * a).toFixed(0)}-${Math.min(100, 100 * b).toFixed(0)}]` }
  console.log('| Arm | n | Wrong shown (scorer) | Judged ok (scorer artifact) | Wrong shown (audited) | Unsure | FA scorer-def | FA audited, wrong-shown def |')
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const arm of [...new Set(rows.map((r) => r.arm))]) {
    const R = rows.filter((r) => r.arm === arm)
    const ws = R.filter(wrongShown)
    const v = (r) => byRow.get(`${r.arm}|${r.seed ?? 0}|${r.id}`)
    const okN = ws.filter((r) => v(r) === 'ok').length
    const unsure = ws.filter((r) => v(r) === 'unsure').length
    const wrongN = ws.filter((r) => v(r) === 'wrong').length
    console.log(`| ${arm} | ${R.length} | ${ws.length} | ${okN} | ${wrongN} | ${unsure} | ${fmt(R.filter((r) => r.falseAccept).length, R.length)} | ${fmt(wrongN, R.length)} (upper bound incl. unsure: ${fmt(wrongN + unsure, R.length)}) |`)
  }
  console.log('\nFA audited counts every wrong answer shown (including partials that flag the gap but state a wrong value); the scorer definition does not.')
} else { console.error('usage: arm-audit.mjs sheet|ingest ...'); process.exit(1) }
