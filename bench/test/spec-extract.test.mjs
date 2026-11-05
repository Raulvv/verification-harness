import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSpec, extractSpec, buildPrompt } from '../lib/spec-extract.mjs'

const TITLES = ['Top Executives', 'Registered Nurses', 'Software Developers, Quality Assurance Analysts, and Testers']

test('spec extract: valid multi-filter spec passes', () => {
  const r = validateSpec({
    status: 'answerable', candidateSet: 'paid', op: 'count', field: 'annual',
    filters: [
      { field: 'outlook_pct', op: '>', value: '5%' },
      { field: 'annual', op: '>', value: '$80,000' },
    ],
  }, TITLES)
  assert.equal(r.ok, true)
  assert.equal(r.spec.filters[0].value, 5)
  assert.equal(r.spec.filters[1].value, 80000)
})

test('spec extract: topk needs an integer k in range', () => {
  const base = { status: 'answerable', candidateSet: 'paid', op: 'topk', field: 'annual' }
  assert.equal(validateSpec({ ...base, k: 3 }, TITLES).ok, true)
  assert.equal(validateSpec({ ...base, k: 0 }, TITLES).ok, false)
  assert.equal(validateSpec({ ...base, k: 11 }, TITLES).ok, false)
  assert.equal(validateSpec({ ...base }, TITLES).ok, false)
})

test('spec extract: diff needs two known titles and select', () => {
  const ok = validateSpec({
    status: 'answerable', candidateSet: 'select', op: 'diff', field: 'annual_openings',
    select: ['Top Executives', 'Registered Nurses'],
  }, TITLES)
  assert.equal(ok.ok, true)
  const unknown = validateSpec({
    status: 'answerable', candidateSet: 'select', op: 'diff', field: 'annual_openings',
    select: ['Top Executives', 'Astronauts'],
  }, TITLES)
  assert.match(unknown.error, /unknown occupation/)
  const noSelect = validateSpec({ status: 'answerable', candidateSet: 'paid', op: 'diff', field: 'annual_openings' }, TITLES)
  assert.equal(noSelect.ok, false)
})

test('spec extract: bad fields, ops, and statuses are rejected', () => {
  assert.match(validateSpec({ status: 'answerable', op: 'max', field: 'salary' }, TITLES).error, /bad field/)
  assert.match(validateSpec({ status: 'answerable', op: 'median', field: 'annual' }, TITLES).error, /bad op/)
  assert.match(validateSpec({ status: 'maybe', reason: 'x' }, TITLES).error, /bad status/)
  assert.match(validateSpec({ status: 'answerable', op: 'max', field: 'annual', filters: [{ field: 'annual', op: '~', value: 1 }] }, TITLES).error, /bad filter op/)
  assert.match(validateSpec({ status: 'answerable', op: 'max', field: 'annual', filters: [{ field: 'annual', op: '>', value: 1 }, { field: 'annual', op: '<', value: 5 }] }, TITLES).error, /duplicate/)
})

test('spec extract: refusals pass through with a reason', () => {
  const r = validateSpec({ status: 'needs_specification', reason: '2026 is outside the snapshot' }, TITLES)
  assert.equal(r.ok, true)
  assert.equal(r.spec.status, 'needs_specification')
  assert.match(r.spec.reason, /2026/)
})

test('spec extract: prompt contains the schema but no row values', () => {
  const p = buildPrompt({ question: 'How many?', titles: TITLES })
  assert.match(p, /candidateSet/)
  assert.match(p, /annual_openings/)
  assert.match(p, /Top Executives/)
  assert.doesNotMatch(p, /239,200|\$61,590/)
})

test('spec extract: model JSON is parsed and tagged', async () => {
  const chat = async () => ({
    content: '```json\n{"status":"answerable","candidateSet":"paid","op":"max","field":"annual","filters":[{"field":"outlook_pct","op":">","value":5}]}\n```',
    usage: { total_tokens: 10 },
  })
  const r = await extractSpec({ question: 'q', chat, titles: TITLES })
  assert.equal(r.status, 'answerable')
  assert.equal(r.source, 'extractor')
  assert.equal(r.field, 'annual')
  assert.equal(r.filters[0].value, 5)
})

test('spec extract: invalid JSON retries, then refuses rather than guesses', async () => {
  let calls = 0
  const chat = async () => {
    calls += 1
    return { content: calls === 1 ? 'I think the answer is 5.' : '{"status":"answerable","op":"max","field":"salary"}', usage: {} }
  }
  const r = await extractSpec({ question: 'q', chat, titles: TITLES })
  assert.equal(calls, 2)
  assert.equal(r.status, 'needs_specification')
  assert.match(r.error, /bad field/)
})

test('spec extract: a reader classification falls through', async () => {
  const chat = async () => ({ content: '{"status":"reader","reason":"single occupation fact"}', usage: {} })
  const r = await extractSpec({ question: 'q', chat, titles: TITLES })
  assert.equal(r.status, 'reader')
})
