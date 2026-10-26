import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAggregate, formatAggregate } from '../../lib/cli/ask.mjs'

const rows = [
  { title: 'A', annual: 100, outlook_pct: 5 },
  { title: 'B', annual: 200, outlook_pct: 2 }
]

test('cli aggregate: deterministic answer and coverage', () => {
  const r = runAggregate({ rows, spec: { op: 'max', field: 'annual' }, question: 'highest?' })
  assert.equal(r.answer, 'B — 200')
  assert.equal(r.coverage.complete, true)
  assert.match(r.receipt, /coverage|Receipt/)
})

test('cli aggregate: json carries coverage and aggregate', () => {
  const r = runAggregate({ rows, spec: { op: 'count', field: 'annual', filter: { field: 'annual', op: '>', value: 150 } } })
  const j = JSON.parse(formatAggregate(r, { json: true }))
  assert.equal(j.answer, '1')
  assert.equal(j.aggregate.qualifying, 1)
  assert.equal(j.coverage.candidates, 2)
})
