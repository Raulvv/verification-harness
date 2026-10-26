import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askAggregate } from '../../lib/answer/aggregate.mjs'

const rows = [
  { title: 'A', annual: 100, outlook_pct: 5, quotes: [{ title: 'A', doc: 'a.md', quote: 'A pay' }] },
  { title: 'B', annual: 200, outlook_pct: 2, quotes: [{ title: 'B', doc: 'b.md', quote: 'B pay' }] },
  { title: 'C', annual: 50, outlook_pct: 10, quotes: [{ title: 'C', doc: 'c.md', quote: 'C pay' }] },
  { title: 'D', annual: null, outlook_pct: 3 }
]
const money = (_, v) => '$' + Number(v).toLocaleString('en-US')

test('aggregate: max over all candidates, with a full receipt', () => {
  const r = askAggregate({ rows, spec: { op: 'max', field: 'annual' }, question: 'max?', formatField: money })
  assert.equal(r.answer, 'B — $200')
  assert.equal(r.aggregate.winner, 'B')
  assert.equal(r.coverage.candidates, 4)
  assert.equal(r.coverage.expected, 4)
  assert.match(r.quote, /A \| annual: \$100/)
  assert.match(r.quote, /B \| annual: \$200/)
  assert.equal(r.legs.length, 3)
})

test('aggregate: min with filter and percent formatting', () => {
  const r = askAggregate({ rows, spec: { op: 'min', field: 'annual', filter: { field: 'outlook_pct', op: '>=', value: 5 } }, formatField: money })
  assert.equal(r.answer, 'C — $50')
  assert.equal(r.aggregate.qualifying, 2)
  assert.equal(r.quote.split('\n').length, 4)
})

test('aggregate: count and sum use only qualifying rows', () => {
  const c = askAggregate({ rows, spec: { op: 'count', field: 'outlook_pct', filter: { field: 'outlook_pct', op: '>', value: 3 } } })
  assert.equal(c.answer, '2')
  const s = askAggregate({ rows, spec: { op: 'sum', field: 'annual', select: ['A', 'B'] }, formatField: money })
  assert.equal(s.answer, '$300')
  assert.equal(s.coverage.candidates, 2)
  assert.equal(s.coverage.expected, 2)
})

test('aggregate: explicit expected coverage is not tautological', () => {
  const ok = askAggregate({ rows, spec: { op: 'max', field: 'annual' }, expected: 4 })
  assert.equal(ok.coverage.complete, true)
  const short = askAggregate({ rows, spec: { op: 'max', field: 'annual' }, expected: 5 })
  assert.equal(short.answer, 'NOT FOUND')
  assert.equal(short.coverage.complete, false)
  assert.match(short.final.text, /incomplete candidate set \(4\/5\)/)
})

test('aggregate: a missing selected title is loud', () => {
  assert.throws(() => askAggregate({ rows, spec: { op: 'sum', field: 'annual', select: ['A', 'Z'] } }), /selected title missing/)
})

test('aggregate: a bad op or filter is loud', () => {
  assert.throws(() => askAggregate({ rows, spec: { op: 'median', field: 'annual' } }), /spec.op/)
  assert.throws(() => askAggregate({ rows, spec: { op: 'count', field: 'annual', filter: { field: 'annual', op: '~', value: 1 } } }), /filter op/)
})
