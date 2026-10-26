// The evidence a sufficiency judge sees (B60): the receipt's own quote by
// default, or — for synthesis corpora — the union of every cited document (B64).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judgeEvidence, judgeEvidenceUnion, judgeEvidenceFor } from '../../lib/receipts/evidence.mjs'

const receipt = 'Q: The vision is X\nSource: Doc A (2026-01)\nQuote: "the scalable growth engine"'
const docs = [
  { rel: 'a.md', content: 'The scalable growth engine line.\nMore about growth.' },
  { rel: 'b.md', content: 'Filler.\nThe vision and the engine are scalable.' },
  { rel: 'c.md', content: 'secret sauce lives here.' },
]
const legs = [{ rel: 'a.md' }, { rel: 'b.md' }]

test('judgeEvidence: receipt mode is the quote alone when the receipt carries one', () => {
  const ev = judgeEvidence(receipt, 'vision growth engine', docs, legs)
  assert.ok(ev.includes('the scalable growth engine'), 'the receipt quote')
  assert.ok(!ev.includes('More about growth.'), 'receipt mode does not add cited docs')
})

test('judgeEvidenceUnion: the quote PLUS every cited doc, never an uncited one', () => {
  const ev = judgeEvidenceUnion(receipt, 'vision growth engine', docs, legs)
  assert.ok(ev.includes('the scalable growth engine'), 'keeps the receipt quote')
  assert.ok(ev.includes('The scalable growth engine line.'), 'adds a cited doc')
  assert.ok(!ev.includes('secret sauce'), 'an uncited doc never enters')
})

test('judgeEvidenceFor: the mode selects the strategy (default is window)', () => {
  assert.equal(judgeEvidenceFor('receipt', receipt, 'vision', docs, legs), judgeEvidence(receipt, 'vision', docs, legs))
  assert.equal(judgeEvidenceFor('union', receipt, 'vision', docs, legs), judgeEvidenceUnion(receipt, 'vision', docs, legs))
  // default (no mode) is the whole window — every doc's content
  const win = judgeEvidenceFor(undefined, receipt, 'vision', docs, legs)
  assert.ok(win.includes('secret sauce'), 'default is the window: every doc, cited or not')
  assert.equal(win, judgeEvidenceFor('window', receipt, 'vision', docs, legs))
})
