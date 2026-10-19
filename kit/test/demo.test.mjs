// The hero demo's acts must hold. If the machine ever lets a fabricated quote
// through, or an abstention carries a receipt, these redden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runFixture, poisonedReceipt, FIXTURES, CORPUS } from '../demo/demo.mjs'
import { verify } from '../lib/receipts/gate.mjs'

const by = Object.fromEntries(FIXTURES.map((f) => [f.label, f]))

test('demo act 1 — an honest citation resolves byte-for-byte', () => {
  const r = runFixture(by['honest'])
  assert.equal(r.kept.length, 1)
  assert.match(r.receipt.text, /Quote: The account escalation SLA is 48 hours from first contact\./)
  assert.equal(r.verdict.mechanicalPass, true)
})

test('demo act 2 — a fabricated quote is dropped, never assembled', () => {
  const r = runFixture(by['fabricated quote'])
  assert.equal(r.kept.length, 0)
  assert.equal(r.dropped.length, 1)
  assert.match(r.receipt.text, /Quote: NOT FOUND/)
  assert.equal(r.verdict.mechanicalPass, false)
})

test('demo act 2b — the gate rejects a lying citation, naming the reason', () => {
  const v = verify({ not_found: false }, poisonedReceipt(), CORPUS)
  assert.equal(v.mechanicalPass, false)
  assert.match(v.why, /quote not found in incident-policy\.md/)
})

test('demo act 3 — an unanswerable question abstains with no receipt', () => {
  const r = runFixture(by['not found'])
  assert.equal(r.receipt.legs.length, 0)
  assert.equal(r.receipt.text, 'Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND')
  assert.equal(r.verdict.mechanicalPass, true)
})
