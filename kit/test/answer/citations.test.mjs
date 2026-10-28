// Citation metadata on the assembled receipt: byte offsets (Anthropic
// convention: 0-indexed, exclusive end), section/context, and the opt-in
// per-document cap. The canonical receipt text is untouched by all of this.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assembleOneShot } from '../../lib/answer/assemble.mjs'

function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cites-'))
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
  return dir
}

const PAY = '# Pay\nIn May 2023, the top industries were as follows:\nFinance and insurance\n$120,800\nProfessional, scientific, and technical services\n120,060\n'

test('citations: exact quotes carry byte offsets, section and table context', () => {
  const dir = corpus({ 'a.md': PAY })
  try {
    const docs = [{ rel: 'a.md', content: PAY }]
    const quote = 'Finance and insurance\n$120,800\nProfessional, scientific, and technical services\n120,060'
    const a = assembleOneShot(dir, 'q', docs, { answer: 'Pay varies.', quotes: [{ doc: 1, quote }], notFound: false })
    const c = a.citations[0]
    assert.equal(c.document_index, 1)
    assert.equal(c.rel, 'a.md')
    assert.equal(c.quote, quote)
    assert.equal(c.exact, true)
    assert.equal(PAY.slice(c.start_char_index, c.end_char_index), quote)
    assert.equal(c.section, 'Pay')
    assert.match(c.context, /were as follows:$/)
    assert.equal(c.kind, 'table')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('citations: a case-variant quote is lifted to the file bytes, not carried as given', () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fact is 42\n' })
  try {
    const docs = [{ rel: 'a.md', content: '# Doc A\nthe fact is 42\n' }]
    const a = assembleOneShot(dir, 'q', docs, { answer: 'The fact is 42.', quotes: [{ doc: 1, quote: 'THE FACT IS 42' }], notFound: false })
    const c = a.citations[0]
    assert.equal(c.quote, 'the fact is 42') // the file's bytes win
    assert.equal(c.exact, true)
    assert.equal(docs[0].content.slice(c.start_char_index, c.end_char_index), c.quote)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('citations: --max-quotes-per-doc caps the leg and the citation list', () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fact is 42\nthe other fact is 7\n' })
  try {
    const docs = [{ rel: 'a.md', content: '# Doc A\nthe fact is 42\nthe other fact is 7\n' }]
    const parsed = { answer: 'Two facts.', quotes: [{ doc: 1, quote: 'the fact is 42' }, { doc: 1, quote: 'the other fact is 7' }], notFound: false }
    const full = assembleOneShot(dir, 'q', docs, parsed, {})
    assert.equal(full.citations.length, 2)
    const capped = assembleOneShot(dir, 'q', docs, parsed, { maxQuotesPerDoc: 1 })
    assert.equal(capped.citations.length, 1)
    assert.equal(capped.legs[0].quotes.length, 1)
    assert.equal(capped.legs[0].quote, 'the fact is 42')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
