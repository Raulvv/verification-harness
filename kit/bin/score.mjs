#!/usr/bin/env node
// Scoring CLI — the scorecard.
//   node kit/bin/score.mjs <results.json ...> --golden <file> [--config <file>]
import { readFileSync } from 'node:fs'
import { scoreAll } from '../lib/receipts/score.mjs'
import { parseFiles } from '../lib/cli.mjs'
import { readResults } from '../lib/receipts/results.mjs'

const { groups, positionals } = parseFiles(process.argv.slice(2), { multi: ['golden'] })
const goldenFiles = groups.golden
const resultsFiles = positionals
if (!goldenFiles.length || !resultsFiles.length) {
  console.error('usage: node kit/bin/score.mjs <results.json ...> --golden <file> [...]')
  process.exit(1)
}
const items = goldenFiles.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).items)
const results = resultsFiles.flatMap(readResults)
const s = scoreAll(items, results)
console.log(`\n  ${results[0]?.model ?? '?'}`)
for (const r of s.rows) {
  console.log(`   ${r.id.padEnd(6)} ${r.points}/2 p${r.path ? '✓' : '✗'} q${r.quote ? '✓' : '✗'}  ${String(r.ms).padStart(6)}ms${r.error ? '  ERR' : ''}`)
}
console.log('')
for (const g of Object.values(s.groups)) console.log('  ' + g)
console.log('  ' + s.total)
console.log(`  points ${s.points}/${s.max}`)
