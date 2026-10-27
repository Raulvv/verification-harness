#!/usr/bin/env node
// Re-score an arm-compare JSONL with the current mechanical scorer. No model calls.
import { readFileSync, writeFileSync } from 'node:fs'
import { score } from './lib/arm-score.mjs'
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const rowsPath = opt('rows', 'bench/results/arm-compare.jsonl')
const qPath = opt('questions', 'bench/ooh-pilot.jsonl')
const outPath = opt('out', rowsPath.replace(/\.jsonl$/, '-rescored.jsonl'))
const items = new Map(readFileSync(qPath, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.id, x] }))
const rows = readFileSync(rowsPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
const out = rows.map((r) => {
  const item = items.get(r.id)
  if (!item) throw new Error(`missing item ${r.id}`)
  return { ...r, ...score(item, r.text ?? '') }
})
writeFileSync(outPath, out.map((r) => JSON.stringify(r)).join('\n') + '\n')
console.log(`rescored ${out.length} rows -> ${outPath}`)
