// The number anchor: the answer/quote binding, mechanical and model-free.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numbersIn, claimNumbers, derivedNumbers, unanchoredNumbers } from '../../lib/receipts/text.mjs'

test('numbersIn: comma grouping and a trailing .0 normalize, percent is kept as its number', () => {
  assert.deepEqual(numbersIn('10,500 units; 3.0 s; 95.6%'), ['10500', '3', '95.6'])
})

test('unanchoredNumbers: a number the quotes do not state is unanchored', () => {
  assert.deepEqual(unanchoredNumbers('The fee is 12 USD.', ['the fee is 10 USD']), ['12'])
})

test('unanchoredNumbers: a number the quotes do state is anchored', () => {
  assert.deepEqual(unanchoredNumbers('The fee is 10 USD.', ['the fee is 10 USD']), [])
})

test('unanchoredNumbers: the comparison is token-exact, never a substring', () => {
  assert.deepEqual(unanchoredNumbers('It has 3 items.', ['it has 13 items']), ['3'])
})

test('unanchoredNumbers: an explicit derived value is allowed', () => {
  assert.deepEqual(unanchoredNumbers('The total is 150 USD.', ['each unit costs 50 USD'], { allow: [150] }), [])
})

test('unanchoredNumbers: several evidence quotes pool their numbers', () => {
  assert.deepEqual(unanchoredNumbers('10 then 20 then 30.', ['the first is 10', 'the second is 20']), ['30'])
})

test('claimNumbers: versions, releases, dates, sections and row ids are not claims; number words are', () => {
  assert.deepEqual(claimNumbers('v4.5 and 0.1.0 on 2026-10-20, §3.6, B118; three points'), ['3'])
})

test('derivedNumbers: arithmetic over quoted operands anchors its result', () => {
  assert.deepEqual(derivedNumbers('26 errors × 3 points = 78 points', ['26 errors; 3 points']), ['78'])
  assert.deepEqual(derivedNumbers('26 × 3 = 80', ['26 errors; 3 points']), [])
})

test('unanchoredNumbers: shown arithmetic is anchored; a wrong result is not', () => {
  assert.deepEqual(unanchoredNumbers('26 errors × 3 points = 78 points', ['26 errors; 3 points']), [])
  assert.deepEqual(unanchoredNumbers('26 errors × 3 points = 80 points', ['26 errors; 3 points']), ['80'])
})

test('unanchoredNumbers: a number given by the question is not a corpus claim', () => {
  assert.deepEqual(unanchoredNumbers('The total is 120 points.', ['3 points per item'], { ignore: 'a 40-question set' }), ['120'])
  assert.deepEqual(unanchoredNumbers('The total is 120 points.', ['3 points per item'], { ignore: 'a 40-question set', allow: [120] }), [])
})
