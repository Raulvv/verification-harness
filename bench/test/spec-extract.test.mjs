import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSpec, extractSpec, buildPrompt } from '../lib/spec-extract.mjs'

const TITLES = ['Top Executives', 'Registered Nurses', 'Software Developers, Quality Assurance Analysts, and Testers']

test('spec extract: valid multi-filter spec passes with grounding', () => {
  const r = validateSpec({
    status: 'answerable', candidateSet: 'paid', op: 'count', field: 'annual',
    filters: [
      { field: 'outlook_pct', op: '>', value: '5%' },
      { field: 'annual', op: '>', value: '$80,000' },
    ],
    grounding: { annual: 'pay above $80,000', outlook_pct: 'projected growth above 5%' },
  }, TITLES, 'How many occupations have projected growth above 5% and pay above $80,000?')
  assert.equal(r.ok, true)
  assert.equal(r.spec.filters[0].value, 5)
  assert.equal(r.spec.filters[1].value, 80000)
})

test('spec extract: grounding is mandatory and must name the field', () => {
  const q = 'How many jobs would beat inflation at 4%?'
  const raw = {
    status: 'answerable', candidateSet: 'paid', op: 'count', field: 'outlook_pct',
    filters: [{ field: 'outlook_pct', op: '>', value: 4 }],
  }
  assert.match(validateSpec(raw, TITLES, q).error, /grounding is required/)
  assert.match(validateSpec({ ...raw, grounding: { outlook_pct: 'beat inflation' } }, TITLES, q).error, /does not name that field/)
  assert.match(validateSpec({ ...raw, grounding: { outlook_pct: 'projected growth' } }, TITLES, q).error, /not in the question/)
})

test('spec extract: a filter value must appear in the question', () => {
  const q = 'How many occupations have projected growth above 5% and pay above $80,000?'
  const raw = {
    status: 'answerable', candidateSet: 'paid', op: 'count', field: 'annual',
    filters: [{ field: 'outlook_pct', op: '>', value: 6 }, { field: 'annual', op: '>', value: 80000 }],
    grounding: { annual: 'pay above $80,000', outlook_pct: 'projected growth above 5%' },
  }
  assert.match(validateSpec(raw, TITLES, q).error, /value 6/)
})

test('spec extract: shorthand money and education synonyms ground correctly', () => {
  const q1 = "What's the worst job based on annual openings under 100k earnings per year?"
  const r1 = validateSpec({
    status: 'answerable', candidateSet: 'paid', op: 'min', field: 'annual_openings',
    filters: [{ field: 'annual', op: '<', value: 100000 }],
    grounding: { annual_openings: 'annual openings', annual: 'earnings' },
  }, TITLES, q1)
  assert.equal(r1.ok, true)
  const q2 = 'Which job needs only my high school degree and pays most?'
  const r2 = validateSpec({
    status: 'answerable', candidateSet: 'paid', op: 'max', field: 'annual',
    filters: [{ field: 'education', op: '=', value: 'High school diploma or equivalent' }],
    grounding: { annual: 'pays most', education: 'high school degree' },
  }, TITLES, q2)
  assert.equal(r2.ok, true)
})

test('spec extract: worst needs ascending order', () => {
  const q = 'Give me the 2 worst jobs based on projected growth'
  const raw = {
    status: 'answerable', candidateSet: 'paid', op: 'topk', k: 2, field: 'outlook_pct',
    order: 'desc', grounding: { outlook_pct: 'projected growth' },
  }
  assert.match(validateSpec(raw, TITLES, q).error, /needs order asc/)
  assert.equal(validateSpec({ ...raw, order: 'asc' }, TITLES, q).ok, true)
})

test('spec extract: topk needs an integer k in range and a grounded k', () => {
  const q = 'Which three occupations have the highest pay?'
  const base = {
    status: 'answerable', candidateSet: 'paid', op: 'topk', field: 'annual',
    order: 'desc', grounding: { annual: 'pay' },
  }
  assert.equal(validateSpec({ ...base, k: 3 }, TITLES, q).ok, true)
  assert.match(validateSpec({ ...base, k: 0 }, TITLES, q).error, /positive integer|between 1 and 10/)
  assert.match(validateSpec({ ...base, k: 11 }, TITLES, q).error, /between 1 and 10/)
  assert.match(validateSpec({ ...base }, TITLES, q).error, /between 1 and 10/)
  assert.match(validateSpec({ ...base, k: 5 }, TITLES, q).error, /top-k 5 is not in the question/)
})

test('spec extract: diff needs two known grounded titles and select', () => {
  const q = 'How many more annual openings does Top Executives have than Registered Nurses?'
  const ok = validateSpec({
    status: 'answerable', candidateSet: 'select', op: 'diff', field: 'annual_openings',
    select: ['Top Executives', 'Registered Nurses'], grounding: { annual_openings: 'annual openings' },
  }, TITLES, q)
  assert.equal(ok.ok, true)
  const unknown = validateSpec({
    status: 'answerable', candidateSet: 'select', op: 'diff', field: 'annual_openings',
    select: ['Top Executives', 'Astronauts'], grounding: { annual_openings: 'annual openings' },
  }, TITLES, q)
  assert.match(unknown.error, /unknown occupation/)
  const noSelect = validateSpec({ status: 'answerable', candidateSet: 'paid', op: 'diff', field: 'annual_openings' }, TITLES, q)
  assert.equal(noSelect.ok, false)
})

test('spec extract: bad fields, ops, statuses, filter ops are rejected', () => {
  assert.match(validateSpec({ status: 'answerable', op: 'max', field: 'salary' }, TITLES, 'q').error, /bad field/)
  assert.match(validateSpec({ status: 'answerable', op: 'median', field: 'annual' }, TITLES, 'q').error, /bad op/)
  assert.match(validateSpec({ status: 'maybe', reason: 'x' }, TITLES, 'q').error, /bad status/)
  assert.match(validateSpec({ status: 'answerable', op: 'max', field: 'annual', filters: [{ field: 'annual', op: '~', value: 1 }], grounding: { annual: 'pay' } }, TITLES, 'pay').error, /bad filter op/)
  assert.match(validateSpec({ status: 'answerable', op: 'max', field: 'annual', filters: [{ field: 'annual', op: '>', value: 1 }, { field: 'annual', op: '<', value: 5 }], grounding: { annual: 'pay' } }, TITLES, 'pay').error, /duplicate/)
})

test('spec extract: refusals pass through with a reason', () => {
  const r = validateSpec({ status: 'needs_specification', reason: '2026 is outside the snapshot' }, TITLES, 'q')
  assert.equal(r.ok, true)
  assert.equal(r.spec.status, 'needs_specification')
  assert.match(r.spec.reason, /2026/)
})

test('spec extract: prompt contains the schema but no row values', () => {
  const p = buildPrompt({ question: 'How many?', titles: TITLES })
  assert.match(p, /candidateSet/)
  assert.match(p, /annual_openings/)
  assert.match(p, /grounding/)
  assert.match(p, /Top Executives/)
  assert.doesNotMatch(p, /239,200|\$61,590/)
})

test('spec extract: model JSON is parsed, grounded, and tagged', async () => {
  let seen = []
  let opts = null
  const chat = async (msgs, o) => {
    seen = msgs
    opts = o
    return {
      content: '```json\n{"status":"answerable","candidateSet":"paid","op":"max","field":"annual","filters":[{"field":"outlook_pct","op":">","value":5}],"grounding":{"annual":"pay","outlook_pct":"growth above 5%"}}\n```',
      usage: { total_tokens: 10 },
    }
  }
  const r = await extractSpec({ question: 'Which pays most with growth above 5%?', chat, titles: TITLES })
  assert.equal(seen[0].role, 'system')
  assert.match(seen[0].content, /never answer/i)
  assert.equal(opts.format, 'json')
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
