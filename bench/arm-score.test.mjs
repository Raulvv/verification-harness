import { test } from 'node:test'
import assert from 'node:assert/strict'
import { score } from './lib/arm-score.mjs'

test('arm score: object gold checks winner and numeric fields', () => {
  const item = { condition: 'answerable', gold: { winner: 'Psychologists', difference_pp: 3 } }
  const r = score(item, 'Psychologists have the higher rate, 7% vs 4%, a difference of 3 percentage points.')
  assert.equal(r.correct, true)
  assert.equal(r.falseAccept, false)
})
test('arm score: scalar gold remains strict', () => {
  assert.equal(score({ condition: 'answerable', gold: 3359400 }, '3,359,400').correct, true)
  assert.equal(score({ condition: 'answerable', gold: 3359400 }, '3,000,000').correct, false)
})
test('arm score: partial needs stated value plus missing-part disclosure', () => {
  const item = { condition: 'partial', gold: { parts: [{ part: 'US', value: 61270, status: 'stated' }, { part: 'FL', value: null, status: 'not stated' }] } }
  assert.equal(score(item, 'The US median is $61,270; Florida is not stated.').correct, true)
  assert.equal(score(item, 'The US median is $61,270.').correct, false)
})
