// The minimized receipt must stay gate-verifiable: ` | ` is a real leg split,
// so a minimized quote is rebuilt only from verbatim units (a pipe-flattened
 // stitch used to read as one sentence and fail the kit's own gate).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { minimizeAssembled } from '../../lib/answer/minimize.mjs'
import { assembleOneShot } from '../../lib/answer/assemble.mjs'
import { verify } from '../../lib/receipts/gate.mjs'

function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'minimize-'))
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
  return dir
}

const DOCS = [{ rel: 'a.md', content: '# Doc A\nThe fact is 42. The next sentence covers unrelated filler that need not ship.\n' }]
const PARSED = {
  answer: 'The fact is 42.',
  quotes: [{ doc: 1, quote: 'The fact is 42\nThe next sentence covers unrelated filler that need not ship.' }],
}

test('minimize: the shortened receipt is strictly shorter and still gate-verifiable', () => {
  const dir = corpus({ 'a.md': DOCS[0].content })
  try {
    const full = assembleOneShot(dir, 'what is the fact?', DOCS, PARSED, {})
    const min = assembleOneShot(dir, 'what is the fact?', DOCS, PARSED, { minimizeReceipt: true })
    assert.equal(min.minimized, true)
    assert.ok(min.text.length < full.text.length, 'minimal receipt is shorter than the full one')
    assert.match(min.text, /The fact is 42/)
    const item = { id: 't', question: 'what is the fact?', not_found: false, candidates: [{ path: 'a.md', quote: min.legs[0].quote }] }
    assert.equal(verify(item, min.text, dir).mechanicalPass, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('minimize: every selected unit is a verbatim unit of the file', () => {
  const dir = corpus({ 'a.md': DOCS[0].content })
  try {
    const full = assembleOneShot(dir, 'what is the fact?', DOCS, PARSED, {})
    const min = minimizeAssembled(full, PARSED.answer)
    for (const leg of min.legs) {
      const text = DOCS[0].content
      for (const unit of leg.quote.split(/\s*\|\s+/)) {
        assert.ok(text.toLowerCase().replace(/\s+/g, ' ').includes(unit.toLowerCase().replace(/\s+/g, ' ')), `unit not verbatim: ${unit}`)
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('minimize: coverage the units cannot represent falls back to the full receipt', () => {
  // a short segment (`42`) is dropped by the sentence filter (length<=3), so a
  // minimizing choice would lose answer words -> the guard keeps the full text
  const dir = corpus({ 'b.md': '# Doc B\n42. The total ships today.\n' })
  try {
    const parsed = {
      answer: '42 and the refund total.',
      quotes: [{ doc: 1, quote: '42\nThe total ships today.' }],
    }
    const full = assembleOneShot(dir, 'what is the total?', [{ rel: 'b.md', content: '# Doc B\n42. The total ships today.\n' }], parsed, {})
    const out = minimizeAssembled(full, parsed.answer)
    assert.equal(out.minimized, false)
    assert.equal(out.reason, 'answer_drop')
    assert.equal(out.text, full.text)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
