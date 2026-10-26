// Mechanical traceability scoring: path (source cited) / quote (byte-verbatim),
// multi-receipt groups, file-side quotes, the not-found shapes. Correctness is
// judged elsewhere — no substring verdict here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scoreItem, scoreAll } from '../../lib/receipts/score.mjs'
import { norm } from '../../lib/receipts/text.mjs'

const dir = mkdtempSync(join(tmpdir(), 'score-'))
writeFileSync(join(dir, 'doc.md'), 'The Rasengan was invented by Minato Namikaze.\n')
writeFileSync(join(dir, 'other.md'), 'A completely different line about ramen.\n')
const it = (o) => ({ id: 't', question: 'q', not_found: false, candidates: [], ...o })

test('scoreItem: path is the source-citation check (any-of homes, all-of groups)', () => {
  const one = it({ candidates: [{ path: 'doc.md', quote: 'Minato Namikaze' }] })
  assert.equal(scoreItem(one, 'Q: x\nSource: D · doc.md\nQuote: The Rasengan was invented by Minato Namikaze.', dir).path, true)
  assert.equal(scoreItem(one, 'Q: x\nSource: D · other.md\nQuote: A completely different line about ramen.', dir).path, false)
  const legs = it({ candidates_groups: [[{ path: 'doc.md', quote: 'Minato Namikaze' }], [{ path: 'other.md', quote: 'ramen' }]] })
  assert.equal(scoreItem(legs, 'Q: x\nSource: o · doc.md | p · other.md\nQuote: The Rasengan was invented by Minato Namikaze. | A completely different line about ramen.', dir).path, true)
  assert.equal(scoreItem(legs, 'Q: x\nSource: o · doc.md\nQuote: The Rasengan was invented by Minato Namikaze.', dir).path, false) // second group's home un-named
})

test('scoreItem: quote is byte-verbatim at the file it names (file-side truth)', () => {
  const item = it({ candidates: [{ path: 'doc.md', quote: 'a fixture favorite that appears nowhere' }] })
  const s = scoreItem(item, 'Q: The Rasengan.\nSource: D · doc.md:1\nQuote: The Rasengan was invented by Minato Namikaze.', dir)
  assert.equal(s.quote, true) // file-side: the answer's own quote byte-verifies against doc.md
  assert.equal(scoreItem(item, 'Q: The Rasengan.\nSource: D · doc.md\nQuote: a line that exists nowhere at all', dir).quote, false) // fabrication fails
})

test('scoreItem: an empty answer scores nothing', () => {
  assert.equal(scoreItem(it({}), '', dir).points, 0)
})

test('scoreItem: the abstention is the whole answer — a NOT FOUND traces by construction', () => {
  const bare = it({ not_found: true, candidates: [] })
  assert.deepEqual(scoreItem(bare, 'Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND', dir), { path: true, quote: true, points: 2 })
  // answering instead of abstaining is a claim never stated — 0
  assert.equal(scoreItem(bare, 'Q: 42\nSource: doc.md\nQuote: The Rasengan was invented by Minato Namikaze.', dir).points, 0)
  // a stale golden's candidates never gate the abstention
  const stale = it({ not_found: true, candidates: [{ path: 'doc.md', quote: 'Minato Namikaze' }] })
  assert.equal(scoreItem(stale, 'Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND', dir).points, 2)
  // an abstention with a STRAY citation traces only if the receipt verifies
  const stray = scoreItem(bare, 'Q: NOT FOUND — checked the docs.\nSource: D · doc.md:1\nQuote: The Rasengan was invented by Minato Namikaze.', dir)
  assert.deepEqual(stray, { path: true, quote: true, points: 2 })
  const fake = scoreItem(bare, 'Q: NOT FOUND — checked the docs.\nSource: D · doc.md:1\nQuote: this line exists nowhere at all', dir)
  assert.deepEqual(fake, { path: false, quote: false, points: 0 })
})

test('scoreAll groups by asked_by and totals honestly', () => {
  const items = [it({ id: 'a', asked_by: 'user', candidates: [{ path: 'doc.md', quote: 'Minato Namikaze' }] }), it({ id: 'b', asked_by: 'seed' })]
  const s = scoreAll(items, [{ id: 'a', text: 'Q: Minato.\nSource: D · doc.md\nQuote: The Rasengan was invented by Minato Namikaze.', ms: 10 }, { id: 'b', text: 'Q: wrong.', ms: 20 }], dir)
  assert.equal(s.points, 2)
  assert.equal(s.max, 4)
  assert.ok(s.groups.user.includes('2/2'))
  rmSync(dir, { recursive: true, force: true })
})

test('norm is shared with the gate (quotes and emphasis stripped)', () => {
  assert.equal(norm('**`X`**'), 'x')
})

test('the abstain vocabulary speaks plain English — the f-9 shape', () => {
  const f9 = it({ not_found: true })
  const s = scoreItem(f9, 'Q: The provided documents do not contain information regarding the release date of Fastify v99. The table does not mention version 99.\nSource: NOT FOUND\nQuote: NOT FOUND', dir)
  assert.equal(s.points, 2) // "do not contain" / "does not mention" ARE abstentions
  const shaped = scoreItem(f9, 'Q: The corpus does not state the release date of Fastify v99.\nSource: NOT FOUND\nQuote: NOT FOUND', dir)
  assert.equal(shaped.points, 2)
})
