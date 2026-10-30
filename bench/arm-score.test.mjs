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

test('arm score: do not give is a valid unanswerable abstention', () => {
  const item = { condition: 'unanswerable' }
  assert.equal(score(item, 'The documents do not give a 2033-only figure; they give an annual average.').correct, true)
})

test('arm score: percent and percent-word are equivalent for partial values', () => {
  const item = { condition: 'partial', gold: { parts: [{ part: 'growth', value: '5%', status: 'stated' }, { part: '2010 employment', value: null, status: 'not stated' }] } }
  assert.equal(score(item, 'Grounds Maintenance Workers are projected to grow 5 percent; the 2010 employment is not stated.').correct, true)
})

test('arm score: unicode apostrophes normalize for partial values', () => {
  const item = {
    condition: 'partial',
    gold: { parts: [{ part: 'education', value: "Master's degree", status: 'stated' }, { part: '2033 openings', value: null, status: 'not stated' }] },
  }
  assert.equal(score(item, 'The education is a master’s degree. The documents do not state the 2033 openings.').correct, true)
})
