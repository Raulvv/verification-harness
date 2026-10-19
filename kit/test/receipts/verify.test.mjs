// The gate's full surface: parsing, evidence matching, citation integrity —
// the happy paths, the sad paths, the edge cases.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verify } from '../../lib/receipts/gate.mjs'
import { parseAnswer, evidenceMatches, norm } from '../../lib/receipts/text.mjs'
import { parseCite } from '../../lib/receipts/cite.mjs'

function corpus() {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'))
  writeFileSync(join(dir, 'doc.md'), '# Doc Title\n\nThe Rasengan was invented by Minato Namikaze.\n')
  writeFileSync(join(dir, 'doc.md.meta.json'), JSON.stringify({ title: 'Doc Title', updated: '2024-02-02' }))
  writeFileSync(join(dir, 'plain.md'), '# Plain\n\nA line with table pipes | like | this | end.\n')
  return dir
}
const it = (o) => ({ id: 't', question: 'q', expect: [], not_found: false, candidates: [], ...o })

// ---------- parseAnswer ----------
test('parseAnswer extracts every key and stops continuations at the next key', () => {
  const p = parseAnswer('Q: the answer\ncontinued line\nSource: T · a.md:1\nQuote: the quote\nmore quote\nDerived: 3 = 1 + 2\nStatus: open')
  assert.equal(p.proposed, 'the answer\ncontinued line')
  assert.equal(p.source, 'T · a.md:1')
  assert.equal(p.quote, 'the quote\nmore quote')
  assert.equal(p.status, 'open')
})
test('parseAnswer: legacy Path alias, empty when absent, quote does not swallow Derived', () => {
  const p = parseAnswer('Q: x\nPath: a.md:1\nQuote: q\nDerived: 2 = 1 + 1')
  assert.equal(p.path, 'a.md:1')
  assert.equal(p.quote, 'q')
  const p2 = parseAnswer('nothing formatted here')
  assert.equal(p2.proposed, '')
  assert.equal(p2.source, '')
})

// ---------- evidenceMatches ----------
test('evidenceMatches: exact, whitespace, emphasis, quotes, joins, segments, per-line', () => {
  const content = 'The **Rasengan** was invented by\nMinato Namikaze.\nOther text.'
  assert.ok(evidenceMatches(content, 'The **Rasengan** was invented by'))
  assert.ok(evidenceMatches(content, 'The Rasengan was invented by')) // emphasis
  assert.ok(evidenceMatches(content, '  The Rasengan   was invented by  ')) // whitespace
  assert.ok(evidenceMatches(content, '"The Rasengan was invented by"')) // quote chars
  assert.ok(evidenceMatches(content, 'The Rasengan was invented by / Minato Namikaze.')) // squash join
  assert.ok(evidenceMatches(content, 'The Rasengan was invented by / Other text.')) // elision: each segment verbatim
  assert.ok(!evidenceMatches(content, 'The Rasengan was invented by / entirely elsewhere')) // a claimed segment must exist
  assert.ok(evidenceMatches(content, 'The Rasengan was invented by\nNOT FOUND\nMinato Namikaze.')) // per-line, marker skipped
  assert.ok(!evidenceMatches(content, 'The Rasengan was invented by someone else'))
  assert.ok(!evidenceMatches('', 'anything'))
})

test('evidenceMatches: invisible orthography is not content (zero-width spaces)', () => {
  // the artifact seen in Confluence dumps: U+200B glued to a line end
  // (the fixture text here is synthetic)
  const content = 'Goal\n- provide stable & well-scoped capabilities for fixture onboarding\u200b\n\n- keep the demo path short and reviewable\n'
  assert.ok(evidenceMatches(content, 'provide stable & well-scoped capabilities for fixture onboarding'))
  assert.ok(evidenceMatches(content, 'provide stable & well-scoped capabilities for fixture onboarding - keep the demo path short and reviewable'))
})

// ---------- parseCite ----------
test('parseCite: any separator, titles with punctuation, bare paths', () => {
  const r0 = parseCite('The Rule (2023-01-15) · rule.md:1')
  assert.equal(r0.title, 'The Rule')
  assert.equal(r0.date, '2023-01-15')
  assert.equal(r0.dateNorm, '2023-01')
  assert.equal(r0.path, 'rule.md:1')
  const weird = parseCite('A title: with colons — and dashes · docs/x-y/page.md:12')
  assert.equal(weird.path, 'docs/x-y/page.md:12')
  assert.equal(weird.date, '')
  assert.ok(weird.title.includes('colons'))
  assert.equal(parseCite('bare.md:3').path, 'bare.md:3')
  assert.equal(parseCite('A title mentioning file.md inside · docs/real.md:1').path, 'docs/real.md:1') // last locator wins
})

// ---------- verify() matrix ----------
test('verify: receipt integrity — pass, reject, and the judge boundary', () => {
  const dir = corpus()
  const item = it({ expect: ['Minato'], candidates: [{ path: 'doc.md', quote: 'The Rasengan was invented by Minato Namikaze.' }] })
  assert.equal(verify(item, 'Q: Minato.\nSource: Doc Title (2024-02-02) · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true)
  assert.equal(verify(item, 'Q: Minato.\nSource: Doc Title · missing.md\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, false) // wrong path
  assert.equal(verify(item, 'Q: Minato.\nSource: Doc Title · doc.md:3\nQuote: this appears nowhere at all', dir).mechanicalPass, false) // fabricated
  assert.equal(verify(item, 'Q: Someone else entirely.\nSource: Doc Title · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true) // verdict class = judge's
  assert.equal(verify(item, 'Q: x\nSource: Doc Title · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.\nStatus: open', dir).mechanicalPass, true) // headerless file: claim ignored
  assert.equal(verify(item, 'Q: x\nSource: Doc Title · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.\nStatus: 2020-01-01', dir).mechanicalPass, true)
  rmSync(dir, { recursive: true, force: true })
})

test('verify: lying citations reject; honest variants pass', () => {
  const dir = corpus()
  const item = it({ expect: ['Minato'], candidates: [{ path: 'doc.md', quote: 'invented by Minato Namikaze' }] })
  const withCite = (title, date) => `Q: Minato.\nSource: ${title} (${date}) · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.`
  assert.equal(verify(item, withCite('Doc Title', '2024-02-02'), dir).mechanicalPass, true) // exact date
  assert.equal(verify(item, withCite('Doc Title', '2020-01-01'), dir).mechanicalPass, false) // lying date
  const dateInContent = it({ expect: ['Minato'], candidates: [{ path: 'doc.md', quote: 'invented by Minato' }] })
  writeFileSync(join(dir, 'doc.md'), '# Doc Title\n\nSince 2020-01-01 the Rasengan was invented by Minato Namikaze.\n')
  assert.equal(verify(dateInContent, withCite('Doc Title', '2020-01-01'), dir).mechanicalPass, true) // date the doc itself carries
  assert.equal(verify(item, withCite('Completely Wrong Title', '2024-02-02'), dir).mechanicalPass, false) // fabricated title
  assert.equal(verify(item, 'Q: Minato.\nSource: doc · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true) // descriptive title (head word real)
  rmSync(dir, { recursive: true, force: true })
})

test('verify: multi-leg all-of, path-shape tolerance, table-pipe quotes', () => {
  const dir = corpus()
  const two = it({ expect: ['x'], candidates_groups: [[{ path: 'doc.md', quote: 'invented by Minato Namikaze' }], [{ path: 'plain.md', quote: 'A line with table pipes' }]] })
  assert.equal(verify(two, 'Q: x\nSource: Doc Title (2024-02-02) · doc.md:3 and Plain · plain.md:3\nQuote: The Rasengan was invented by Minato Namikaze. | A line with table pipes | like | this | end.', dir).mechanicalPass, true)
  // the gate verifies the ANSWER's receipt; golden completeness is the scorer's job
  assert.equal(verify(two, 'Q: x\nSource: Doc Title · doc.md:3 and Plain · plain.md:3\nQuote: The Rasengan was invented by Minato Namikaze. | this appears nowhere at all', dir).mechanicalPass, false) // one leg fabricated
  // suffix / bare basename paths (citations carry the agent's working view)
  assert.equal(verify(it({ expect: ['Minato'], candidates: [{ path: 'doc.md', quote: 'invented by Minato Namikaze' }] }), 'Q: x\nSource: Doc · some/other/prefix/doc.md:1\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true)
  assert.equal(verify(it({ expect: ['Minato'], candidates: [{ path: 'doc.md', quote: 'invented by Minato Namikaze' }] }), 'Q: x\nSource: Doc · doc.md\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true)
  rmSync(dir, { recursive: true, force: true })
})

test('verify: abstention semantics — claims only, never absences', () => {
  const dir = corpus()
  const nf = it({ not_found: true, candidates: [] })
  assert.equal(verify(nf, 'Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND', dir).why, 'correct abstention')
  assert.equal(verify(nf, 'Q: NOT FOUND — nothing records this.\nSource: Doc Title · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true) // abstain + stray citation that traces
  assert.equal(verify(nf, 'Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND', dir).mechanicalPass, true)
  assert.equal(verify(nf, 'Q: Minato invented it.\nSource: Doc Title · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.', dir).why, 'should have abstained')
  // prose answer with no receipt lines is NOT an abstention (the bare class)
  assert.equal(verify(it({ expect: ['Minato'] }), 'Minato invented the Rasengan.', dir).mechanicalPass, false)
  // answerable item + abstention = failure
  assert.equal(verify(it({ expect: ['Minato'] }), 'Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND', dir).why, 'abstained on an answerable item')
  // a stray citation an abstention claims must verify (anti-fabrication) —
  // with or without candidates on the golden
  const nb = it({ not_found: true, expect: [], candidates: [{ path: 'doc.md', quote: 'invented by Minato Namikaze' }] })
  assert.equal(verify(nb, 'Q: NOT FOUND — nothing records this.\nSource: Doc Title · doc.md:3\nQuote: The Rasengan was invented by Minato Namikaze.', dir).mechanicalPass, true)
  assert.equal(verify(nb, 'Q: NOT FOUND — nothing records this.\nSource: Doc Title · doc.md:3\nQuote: this appears nowhere', dir).mechanicalPass, false)
  rmSync(dir, { recursive: true, force: true })
})

test('verify: empty and marker answers', () => {
  const dir = corpus()
  assert.equal(verify(it({ expect: [] }), '', dir).mechanicalPass, false)
  assert.match(verify(it({ expect: [] }), '', dir).why, /no answer|no source/)
  rmSync(dir, { recursive: true, force: true })
})

test('norm strips the noise but keeps the words', () => {
  assert.equal(norm('**`Foo`** Bar_baz  '), 'foo barbaz')
  assert.equal(norm('"Quoted"'), 'quoted')
})

test('the corpus-title check is memoized but invalidates on a changed corpus (HK-11)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'title-'))
  try {
    writeFileSync(join(dir, 'doc.md'), '# Doc A\nthe fact')
    writeFileSync(join(dir, 'other.md'), '# Other\nZephyr is a project here')
    const item = { id: 't', question: 'q', not_found: false, candidates: [{ path: 'doc.md', quote: 'the fact' }] }
    const text = 'Q: x\nSource: Zephyr · doc.md\nQuote: the fact'
    assert.equal(verify(item, text, dir).mechanicalPass, true) // 'Zephyr' exists elsewhere in the corpus
    rmSync(join(dir, 'other.md'))
    assert.equal(verify(item, text, dir).mechanicalPass, false) // gone — and the memo did not serve a stale vocab
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
