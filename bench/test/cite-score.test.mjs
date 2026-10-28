import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteChecks, requiredValues, coverage, splitClaims, computedHolds, citationStats } from '../lib/cite-score.mjs'

const DOCS = [
  { rel: 'a.md', content: '# A\nThe pay is $95,890 per year. Growth is 17%.' },
  { rel: 'b.md', content: '# B\nThe other pay is $79,880 per year.' },
]

test('quoteChecks: exact, tolerant, misattributed, missing', () => {
  const r = quoteChecks([
    { doc: 1, quote: 'The pay is $95,890 per year.' },
    { doc: 1, quote: '**The pay is $95,890 per year.**' },
    { doc: 1, quote: 'The other pay is $79,880 per year.' },
    { doc: 1, quote: 'not in the corpus' },
  ], DOCS)
  assert.deepEqual(r.map((x) => x.status), ['exact', 'tolerant', 'misattributed', 'missing'])
})

test('requiredValues/coverage: computed answers require operands, not the result', () => {
  const item = { condition: 'answerable', gold: 363900, formula: '341,800 + 22,100 = 363,900' }
  assert.deepEqual(requiredValues(item), [341800, 22100])
  assert.equal(coverage(item, ['Number of Jobs | 341,800 | Employment Change | 22,100']).complete, true)
  assert.equal(coverage(item, ['341,800']).complete, false)
})

test('partial coverage uses stated parts only', () => {
  const item = { condition: 'partial', gold: { parts: [{ part: 'a', value: 86070, status: 'stated' }, { part: 'b', value: null, status: 'not stated' }] } }
  assert.deepEqual(requiredValues(item), [86070])
  assert.equal(coverage(item, ['the pay is 86,070']).complete, true)
})

test('claims: source lines are not claims', () => {
  const c = splitClaims('The pay is $95,890. Source: a.md. [2] b.md')
  assert.deepEqual(c.map((x) => x.kind), ['positive'])
})

test('claims: positive, computed, absence, and no split on vs.', () => {
  const c = splitClaims('Civil engineers earn $95,890. The 2033 figure is 341,800 + 22,100 = 363,900. The California figure is not stated. The comparison (17% vs. 6%) is 11 points.')
  assert.deepEqual(c.map((x) => x.kind), ['positive', 'computed', 'absence', 'positive'])
  assert.match(c[3].text, /17% vs\. 6%/i)
  assert.equal(computedHolds(c[1].text, ['341,800', '22,100']), true)
  assert.equal(computedHolds(c[1].text, ['341,800']), false)
})

test('claims: do not state / only two have pay are absences', () => {
  assert.equal(splitClaims('The documents do not state carpenters pay.')[0].kind, 'absence')
  assert.equal(splitClaims('Only two of the three occupations have pay figures.')[0].kind, 'absence')
  assert.equal(splitClaims('The highest among all three cannot be confirmed.')[0].kind, 'absence')
})

test('citationStats: file mentions and validity summary', () => {
  const item = { condition: 'answerable', gold: 95890 }
  const s = citationStats({ item, answer: 'The pay is $95,890 (a.md).', quotes: [{ doc: 1, quote: 'The pay is $95,890 per year.' }], docs: DOCS })
  assert.equal(s.all_valid, true)
  assert.equal(s.mentions, 1)
  assert.equal(s.coverage.complete, true)
})
