#!/usr/bin/env node
// Verify the deterministic reducer against the frozen H3 gold. No model calls.
//   node bench/formal/competitive/verify_h3_aggregate.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadRows, h3Spec, baseFor, expectedFor, formatField, receiptLine, legsFor } from '../../lib/ooh-rows.mjs'
import { askAggregate } from '../../../kit/lib/answer/aggregate.mjs'

const HERE = resolve(import.meta.dirname)
const INPUT = process.argv[2] ?? resolve(HERE, 'private/hard-h3-100.jsonl')
const source = loadRows({ source: 'table', dataPath: resolve(HERE, '../../../bench/ooh-data.json') })
const rows = readFileSync(INPUT, 'utf8').split('\n').filter(Boolean).map(JSON.parse)

const goldOk = (gold, r) => {
  if (Array.isArray(gold)) {
    const ranked = r.aggregate.ranked ?? []
    return gold.length === ranked.length &&
      gold.every((g, i) => g.title === ranked[i].title && (g.pay ?? g.openings) === ranked[i].value)
  }
  if (gold && typeof gold === 'object') {
    const v = gold.value ?? gold.pay
    return r.aggregate.winner === gold.winner && r.aggregate.value === v
  }
  return r.aggregate.value === gold
}

const byType = {}
const failures = []
for (const item of rows) {
  const spec = h3Spec(item.question)
  if (item.condition !== 'answerable') {
    if (spec) failures.push({ id: item.id, type: item.type, reason: 'non-answerable question was routed to the reducer' })
    continue
  }
  if (!spec) {
    failures.push({ id: item.id, type: item.type, reason: 'no spec for answerable question' })
    continue
  }
  const result = askAggregate({
    rows: baseFor(source, spec),
    spec,
    expected: expectedFor(source, spec),
    question: item.question,
    formatField,
    receiptLine,
    legsFor,
  })
  const ok = result.coverage.complete && goldOk(item.gold, result)
  byType[item.type] ??= { n: 0, ok: 0 }
  byType[item.type].n += 1
  if (ok) byType[item.type].ok += 1
  else failures.push({
    id: item.id, type: item.type, question: item.question,
    gold: item.gold, answer: result.answer,
    got: result.aggregate.ranked ?? { winner: result.aggregate.winner, value: result.aggregate.value },
  })
}

for (const [type, s] of Object.entries(byType)) console.log(`${type.padEnd(22)} ${s.ok}/${s.n}`)
console.log(`answerable ${Object.values(byType).reduce((a, s) => a + s.ok, 0)}/${Object.values(byType).reduce((a, s) => a + s.n, 0)}`)
if (failures.length) {
  console.log(`\nfailures: ${failures.length}`)
  for (const f of failures) console.log(JSON.stringify(f))
  process.exit(1)
}
