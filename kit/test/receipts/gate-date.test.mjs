// Date precision: citeDate/monthYear resolution and the gate's date check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verify } from '../../lib/receipts/gate.mjs'
import { citeDate, monthYear, parseCite } from '../../lib/receipts/cite.mjs'

const dir = mkdtempSync(join(tmpdir(), 'cdate-'))
writeFileSync(join(dir, 'doc.md'), '# Doc Title\n\nThe fact since 2024-05-06 is here.\n')
writeFileSync(join(dir, 'doc.md.meta.json'), JSON.stringify({ title: 'Doc Title', updated: '2026-09-19' }))
const it = { id: 't', question: 'q', expect: ['fact'], not_found: false, candidates: [{ path: 'doc.md', quote: 'The fact' }] }
const cite = (d) => `Q: The fact.\nSource: Doc Title (${d}) · doc.md:3\nQuote: The fact since 2024-05-06 is here.`

test('citeDate parses month+year in every accepted form; year-only is imprecise', () => {
  assert.deepEqual(citeDate('T (Sep 2026) · a.md'), { raw: 'Sep 2026', norm: '2026-09', imprecise: false })
  assert.equal(citeDate('T (September 2026) · a.md').norm, '2026-09')
  assert.equal(citeDate('T (2026-09) · a.md').norm, '2026-09')
  assert.equal(citeDate('T (2026-09-19) · a.md').norm, '2026-09')
  assert.equal(citeDate('T (2026) · a.md').imprecise, true)
  assert.equal(citeDate('T · a.md').raw, '')
  assert.equal(monthYear('2026-09-19'), 'Sep 2026')
  assert.equal(monthYear('2024-05-06'), 'May 2024')
})

test('gate: month+year passes, wrong month fails, bare year rejects, in-content date passes', () => {
  assert.equal(verify(it, cite('Sep 2026'), dir).mechanicalPass, true)
  assert.equal(verify(it, cite('September 2026'), dir).mechanicalPass, true)
  assert.equal(verify(it, cite('2026-09'), dir).mechanicalPass, true)
  assert.match(verify(it, cite('2026'), dir).why, /month and year/)
  assert.match(verify(it, cite('Aug 2026'), dir).why, /date mismatch/)
  assert.equal(verify(it, cite('May 2024'), dir).mechanicalPass, true) // the doc itself carries 2024-05-06
  assert.equal(verify(it, 'Q: The fact.\nSource: Doc Title · doc.md:3\nQuote: The fact since 2024-05-06 is here.', dir).mechanicalPass, true) // date omitted: tolerated
})

test('parseCite keeps title clean of date parens in every form', () => {
  assert.equal(parseCite('Doc Title (Sep 2026) · a.md:1').title, 'Doc Title')
  assert.equal(parseCite('Doc Title (2026-09-19) · a.md:1').title, 'Doc Title')
  assert.equal(parseCite('Doc Title (2026) · a.md:1').title, 'Doc Title')
  rmSync(dir, { recursive: true, force: true })
})
