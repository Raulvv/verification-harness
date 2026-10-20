// One-shot answering — the speech-free/evidence-mechanical split. The
// model boundary is stubbed; assembly from file metadata is pure truth.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askOneShot } from '../../lib/answer/oneshot.mjs'
import { assembleOneShot, rehomeLegs } from '../../lib/answer/assemble.mjs'
import { selectByReference } from '../../lib/retrieval/window.mjs'
import { pruneByRelevance } from '../../lib/retrieval/vet.mjs'
import { liftEvidence } from '../../lib/receipts/text.mjs'

function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'oneshot-'))
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
  return dir
}

test('assembleOneShot: the receipt is mechanical — titles and dates from the files, quotes as given', () => {
  const dir = corpus({ 'a.md': '# Doc A\ncontent here', 'b.md': '# Doc B\nmore content' })
  try {
    const docs = [{ rel: 'a.md', content: '# Doc A\ncontent here' }, { rel: 'b.md', content: '# Doc B\nmore content' }]
    const a = assembleOneShot(dir, 'q', docs, { answer: 'The answer spans both.', quotes: [{ doc: 1, quote: 'content here' }, { doc: 2, quote: 'more content' }], notFound: false })
    assert.match(a.text, /^Q: The answer spans both\./)
    assert.match(a.text, /Source: Doc A \(\w{3} \d{4}\) · a\.md \| Doc B \(\w{3} \d{4}\) · b\.md/)
    assert.match(a.text, /Quote: content here \| more content/)
    assert.equal(a.legs.length, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('assembleOneShot: a NOT FOUND carries no legs — supplied quotes are dropped, never surfaced', () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe neighbor mentions x' })
  try {
    const a = assembleOneShot(dir, 'q', [{ rel: 'a.md', content: '# Doc A\nthe neighbor mentions x' }], { answer: 'NOT FOUND', quotes: [{ doc: 1, quote: 'the neighbor mentions x' }], notFound: true })
    assert.match(a.text, /Q: NOT FOUND/)
    assert.match(a.text, /Source: NOT FOUND/)
    assert.match(a.text, /Quote: NOT FOUND/)
    assert.ok(!a.text.includes('the neighbor mentions x'), 'an abstention must never surface a receipt')
    assert.deepEqual(a.legs, [])
    assert.deepEqual(a.dropped, ['the neighbor mentions x'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('assembleOneShot: a tangent clause on an abstention is cut at the receipt (the f-10 leak)', () => {
  const dir = corpus({ 'a.md': '# Doc A\n@fastify/view supports templates' })
  try {
    const a = assembleOneShot(dir, 'q', [{ rel: 'a.md', content: '# Doc A\n@fastify/view supports templates' }], {
      answer: 'The provided documents do not state whether Fastify ships a built-in template engine. While DOC 2 mentions the @fastify/view plugin supports templates, it does not confirm a native engine.',
      quotes: [], notFound: true,
    })
    assert.equal(a.text, 'Q: The provided documents do not state whether Fastify ships a built-in template engine.\nSource: NOT FOUND\nQuote: NOT FOUND')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: one model call reads every candidate and the receipt lands', async () => {
  const dir = corpus({ 'a.md': 'alpha answer lives here', 'b.md': 'beta detail lives here too' })
  try {
    let calls = 0
    let prompt = ''
    const _chat = async (msgs) => {
      calls++
      prompt = msgs[0].content
      return { content: '{"answer":"Alpha and beta together.","quotes":[{"doc":1,"quote":"alpha answer lives here"},{"doc":2,"quote":"beta detail lives here too"}],"not_found":false}', usage: { prompt_tokens: 10, completion_tokens: 5 } }
    }
    const r = await askOneShot({}, dir, 'what lives here?', { _chat })
    assert.equal(calls, 1) // ONE context, ONE call — the wall is gone
    assert.match(prompt, /=== DOC 1: a\.md ===/)
    assert.match(prompt, /=== DOC 2: b\.md ===/) // both documents in the same window
    assert.match(prompt, /alpha answer lives here/)
    assert.match(r.final.text, /Q: Alpha and beta together\./)
    assert.match(r.final.text, /· a\.md \| b \([A-Z][a-z]{2} \d{4}\) · b\.md/) // date shape, not the calendar month
    assert.equal(r.tokens, 15)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: a parse failure is loud — an honest NOT FOUND receipt, never silence', async () => {
  const dir = corpus({ 'a.md': 'content' })
  try {
    const r = await askOneShot({}, dir, 'q?', { _chat: async () => ({ content: 'not json at all', usage: {} }) })
    assert.match(r.parseFailures[0], /oneshot parse/)
    assert.match(r.final.text, /Q: NOT FOUND/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// the f-3 truncation class: a constrained decode stalls mid-JSON string
// (measured: cut mid-identifier at 2k bytes — not the token cap)
const TRUNCATED = '{"answer": "The `onProtoPoisoning` option controls what act'

test('askOneShot: truncated JSON gets one tight-budget retry — and it lands', async () => {
  const dir = corpus({ 'a.md': 'onProtoPoisoning controls prototype poisoning attempts' })
  try {
    const prompts = []
    const opts = []
    let calls = 0
    const _chat = async (msgs, o) => {
      calls++
      prompts.push(msgs[0].content)
      opts.push(o)
      return calls === 1
        ? { content: TRUNCATED, usage: {} }
        : { content: '{"answer":"It controls prototype poisoning attempts.","quotes":[{"doc":1,"quote":"onProtoPoisoning controls prototype poisoning attempts"}],"not_found":false}', usage: { prompt_tokens: 3, completion_tokens: 4 } }
    }
    const r = await askOneShot({}, dir, 'what does onProtoPoisoning control?', { _chat })
    assert.equal(calls, 2) // one compact retry — bounded, never a loop
    assert.match(prompts[0], /at most 3 lines each/) // the normal budget
    assert.match(prompts[1], /KEEP IT SHORT/) // the tight budget
    assert.equal(opts[0].maxTokens, 4000)
    assert.deepEqual(r.parseFailures, []) // the retry recovered — no residue
    assert.match(r.final.text, /Q: It controls prototype poisoning attempts\./)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: both attempts truncated — loud failure, two recorded, honest receipt', async () => {
  const dir = corpus({ 'a.md': 'content' })
  try {
    let calls = 0
    const r = await askOneShot({}, dir, 'q?', { _chat: async () => { calls++; return { content: TRUNCATED, usage: {} } } })
    assert.equal(calls, 2) // exactly two attempts — the class can never loop
    assert.equal(r.parseFailures.length, 2)
    assert.match(r.parseFailures[1], /oneshot parse/)
    assert.match(r.final.text, /Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('rehomeLegs: bytes decide the home — a misattributed leg is re-homed (the M4 shape)', () => {
  const docs = [
    { rel: 'a.md', content: 'Revenue line here.\nDocumentation assumes insider knowledge — cold integrators struggle.' },
    { rel: 'b.md', content: 'Auth is the stumble: users cannot find the URL.' },
  ]
  const { kept, dropped } = rehomeLegs(docs, [
    { doc: 1, quote: 'Revenue line here.' },
    { doc: 2, quote: 'Documentation assumes insider knowledge — cold integrators struggle.' }, // lives in a.md, claimed b.md
  ])
  assert.equal(dropped.length, 0)
  assert.equal(kept[0].doc, 1) // correct leg untouched
  assert.equal(kept[1].doc, 1) // re-homed to the true home
  assert.equal(kept[1].rehomed, true)
})

test('rehomeLegs: a leg no document contains is dropped, never carried', () => {
  const docs = [{ rel: 'a.md', content: 'real content only' }]
  const { kept, dropped } = rehomeLegs(docs, [{ doc: 1, quote: 'fabricated passage entirely' }])
  assert.equal(kept.length, 0)
  assert.equal(dropped.length, 1)
  assert.match(dropped[0], /fabricated passage/)
})

test('liftEvidence: a short anchor lifts to the full verbatim line (the pointer-receipt lift)', () => {
  const content = '# Roles\nThe TAM owns the long-term technical relationship with a partner.\nA later line about something else.'
  assert.equal(liftEvidence(content, 'long-term technical relationship'), 'The TAM owns the long-term technical relationship with a partner.')
  assert.equal(liftEvidence(content, 'owns the long-term'), 'The TAM owns the long-term technical relationship with a partner.')
})

test('liftEvidence: a wrapped anchor spans the line pair', () => {
  const content = 'The TAM owns the long-term technical relationship\nwith a partner.'
  assert.equal(liftEvidence(content, 'technical relationship with'), 'The TAM owns the long-term technical relationship with a partner.')
})

test('liftEvidence: an anchor no line carries returns null (dropped downstream)', () => {
  assert.equal(liftEvidence('real content only', 'fabricated passage'), null)
  assert.equal(liftEvidence('', 'anything'), null)
})

test('rehomeLegs: a short anchor is LIFTED to the full verbatim line, not carried verbatim-as-given', () => {
  const docs = [{ rel: 'a.md', content: '# Roles\nThe TAM owns the long-term technical relationship with a partner.' }]
  const { kept, dropped } = rehomeLegs(docs, [{ doc: 1, quote: 'long-term technical relationship' }])
  assert.equal(dropped.length, 0)
  assert.equal(kept[0].quote, 'The TAM owns the long-term technical relationship with a partner.')
})

test('assembleOneShot: the receipt names the TRUE home after re-homing', () => {
  const dir = corpus({ 'a.md': '# Doc A\nDocumentation assumes insider knowledge.', 'b.md': '# Doc B\nAuth is the stumble.' })
  try {
    const docs = [{ rel: 'a.md', content: '# Doc A\nDocumentation assumes insider knowledge.' }, { rel: 'b.md', content: '# Doc B\nAuth is the stumble.' }]
    const a = assembleOneShot(dir, 'q', docs, {
      answer: 'The docs assume insider knowledge.',
      quotes: [{ doc: 2, quote: 'Documentation assumes insider knowledge.' }], // claimed b.md
      notFound: false,
    })
    assert.match(a.text, /Source: Doc A \(\w{3} \d{4}\) · a\.md/) // bytes say a.md
    assert.ok(!a.text.includes('b.md'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: the question names the docs — small window, non-named excluded (the M5 shape)', () => {
  const dir = corpus({
    'Service_Onboarding_API.md': '# Service Onboarding API\nIn-scope: initial setup on staging.',
    'Service_Onboarding_Experience.md': '# Service Onboarding Experience\n## Product Mission\nOnboard progressively.',
    'Service_Onboarding_Service.md': '# Service Onboarding Service\n## Vision\nFrictionless.',
  })
  try {
    const r = selectByReference(dir, 'How does the API initial focus and the product mission agree?')
    assert.equal(r.method, 'reference')
    assert.deepEqual(r.candidates.map((c) => c.rel).sort(), ['Service_Onboarding_API.md', 'Service_Onboarding_Experience.md'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: plurals match their stems (the M3 shape)', () => {
  const dir = corpus({
    'Vendor_Code_Request.md': '# Vendor Code Request\nThe process.',
    'Unrelated.md': '# Unrelated\nNothing here.',
  })
  try {
    const r = selectByReference(dir, 'Who creates vendor codes today?')
    assert.equal(r.method, 'reference') // a REFERENCE match — not a fallback rescue
    assert.deepEqual(r.candidates.map((c) => c.rel), ['Vendor_Code_Request.md'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: a ubiquitous phrase selects nothing — the ranked fallback is the only judgment', () => {
  const dir = corpus(Object.fromEntries([1, 2, 3, 4].map((i) => [`Service_Onboarding_Doc${i}.md`, `# Service Onboarding Doc${i}\nbody`])))
  try {
    const r = selectByReference(dir, 'What about service onboarding?')
    assert.equal(r.method, 'fallback') // the stoplist emptied the reference layer
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: the corpus boundary comes first — outside files never enter', () => {
  const dir = corpus({
    'Service_Onboarding_API.md': '# Service Onboarding API\ngoal line',
    'Outside_Audit.md': '# Outside Audit\n## API usage\nnoise',
  })
  try {
    const r = selectByReference(dir, 'What is the API goal?', { corpus: ['Service_Onboarding_API.md'] })
    assert.deepEqual(r.candidates.map((c) => c.rel), ['Service_Onboarding_API.md'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: a corpus-ubiquitous acronym is not a reference', () => {
  const dir = corpus(Object.fromEntries([1, 2, 3, 4].map((i) => [`Doc${i}.md`, `# Doc${i} API\nbody`])))
  try {
    const r = selectByReference(dir, 'What is the API goal?', { corpus: [1, 2, 3, 4].map((i) => `Doc${i}.md`) })
    assert.equal(r.method, 'fallback') // 'api' touches every title — stoplisted
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('double pass: the matcher selects, reasoning discards — irrelevant matches leave the window', async () => {
  const dir = corpus({
    'Service_Onboarding_API.md': '# Service Onboarding API\ngoal line here',
    'Outside_Audit.md': '# Outside Audit\n## API usage\nquarterly audit noise',
    'Unrelated_A.md': '# Unrelated A\nstuff',
    'Unrelated_B.md': '# Unrelated B\nstuff',
  })
  try {
    // readdir order: Outside_Audit (doc 1), Service_Onboarding_API (doc 2)
    const _chat = async () => ({ content: '{"verdicts":[{"doc":1,"relevant":false},{"doc":2,"relevant":true}]}', usage: {} })
    // both files match lexically (API in titles); pass 2 vetts the question fit
    const sel = selectByReference(dir, 'What is the API goal?', { corpus: ['Service_Onboarding_API.md', 'Outside_Audit.md', 'Unrelated_A.md', 'Unrelated_B.md'] })
    assert.equal(sel.candidates.length, 2) // pass 1: both match the words
    const { kept, dropped } = await pruneByRelevance({}, 'What is the API goal?', sel.matches, { _chat })
    assert.deepEqual(kept.map((x) => x.rel), ['Service_Onboarding_API.md'])
    assert.deepEqual(dropped, ['Outside_Audit.md']) // words matched, context did not
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('double pass: a broken vet never starves the window (fail-open)', async () => {
  const dir = corpus({ 'Service_Onboarding_API.md': '# Service Onboarding API\ngoal line here' })
  try {
    const sel = selectByReference(dir, 'What is the API goal?', { corpus: ['Service_Onboarding_API.md'] })
    const { kept, dropped } = await pruneByRelevance({}, 'q?', sel.matches, { _chat: async () => { throw new Error('boom') } })
    assert.equal(kept.length, 1)
    assert.deepEqual(dropped, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: the double pass shrinks the window before composition', async () => {
  const dir = corpus({
    'Service_Onboarding_API.md': '# Service Onboarding API\nuse-case capabilities',
    'Outside_Audit.md': '# Outside Audit\n## API usage\nquarterly audit noise',
    'Unrelated_A.md': '# Unrelated A\nstuff',
    'Unrelated_B.md': '# Unrelated B\nstuff',
  })
  try {
    const prompts = []
    const _chat = async (msgs) => {
      prompts.push(msgs[0].content)
      return { content: '{"answer":"Use-case capabilities.","quotes":[{"doc":1,"quote":"use-case capabilities"}],"not_found":false}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What is the API goal?', {
      corpus: ['Service_Onboarding_API.md', 'Outside_Audit.md', 'Unrelated_A.md', 'Unrelated_B.md'], _chat,
      _vet: async () => ({ content: '{"verdicts":[{"doc":1,"relevant":false},{"doc":2,"relevant":true}]}', usage: {} }),
      limit: 12,
    })
    // the vet (separate stub) discarded the audit; composition sees only the survivor
    assert.deepEqual(r.window, ['Service_Onboarding_API.md'])
    assert.deepEqual(r.windowDropped, ['Outside_Audit.md'])
    assert.match(prompts[0], /DOC 1: Service_Onboarding_API\.md/)
    assert.ok(!prompts[0].includes('Outside_Audit')) // discarded before composition
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: the fallback is corpus-bound and body-aware (the M3 shape)', () => {
  const dir = corpus({
    'Roles.md': '# Roles\nOPS: previously creation of the vendor codes to OPS.',
    'Outside_Vendor.md': '# Outside\nvendor codes created here too',
    'Noise.md': '# Noise\nnothing at all',
  })
  try {
    const r = selectByReference(dir, 'Who creates vendor codes today?', { corpus: ['Roles.md', 'Noise.md'] })
    assert.equal(r.method, 'fallback') // titles name nothing — body terms rank
    assert.deepEqual(r.candidates.map((c) => c.rel), ['Roles.md']) // corpus-bound: Outside never enters
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: nested corpora are visible — the docs/ tree never hides again', () => {
  const dir = corpus({ 'README.md': '# Readme\ncreate instance boilerplate' })
  mkdirSync(join(dir, 'docs', 'Reference'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'Reference', 'Logging.md'), '# Logging for the fastify instance\nEnable it by passing logger true.')
  try {
    const r = selectByReference(dir, 'How do you enable logging on the Fastify instance?', { corpus: ['README.md', 'docs/Reference/Logging.md'] })
    assert.equal(r.method, 'reference')
    assert.deepEqual(r.candidates.map((c) => c.rel), ['docs/Reference/Logging.md'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: camelCase titles are reachable — orthography, not meaning (the f-2 shape)', () => {
  const dir = corpus({
    'ContentTypeParser.md': '# ContentTypeParser\naddContentTypeParser details.',
    'Migration_Guide.md': '# Migration Guide\ncontent type changes here',
  })
  try {
    const r = selectByReference(dir, 'How do you add a custom content type parser?', { corpus: ['ContentTypeParser.md', 'Migration_Guide.md'] })
    assert.equal(r.method, 'reference') // reached by REFERENCE — not rescued by the fallback
    assert.ok(r.candidates.some((c) => c.rel === 'ContentTypeParser.md'), 'the camelCase home never entered the window')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: the vet runs over FALLBACK windows too (the f-3 shape)', async () => {
  const dir = corpus({
    'Server.md': '# Server\nonProtoPoisoning controls prototype parsing.',
    'Errors.md': '# Errors\nThe default error handler serializes errors into JSON.',
    'Boiler_A.md': '# Boiler A\noption control words shared',
    'Boiler_B.md': '# Boiler B\noption control words shared',
  })
  try {
    const prompts = []
    const _chat = async (msgs) => {
      prompts.push(msgs[0].content)
      return { content: '{"answer":"It controls prototype parsing.","quotes":[{"doc":1,"quote":"onProtoPoisoning controls prototype parsing"}],"not_found":false}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What does the onProtoPoisoning option control?', {
      corpus: ['Server.md', 'Errors.md', 'Boiler_A.md', 'Boiler_B.md'], _chat,
      _vet: async (msgs) => {
        const lines = msgs[0].content.split('\n').filter((l) => /^\d+:/.test(l))
        const verdicts = lines.map((l) => ({ doc: Number(/^(\d+):/.exec(l)[1]), relevant: /onProtoPoisoning/.test(l) }))
        return { content: JSON.stringify({ verdicts }), usage: {} }
      },
      limit: 12,
    })
    assert.deepEqual(r.window, ['Server.md']) // the distractor was vetted out of a FALLBACK window
    assert.ok(r.windowDropped.length >= 1) // the vet discarded the non-matching candidates
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: a confident single-file reference skips the vet (the speed gate)', async () => {
  const dir = corpus({
    'Service_Onboarding_API.md': '# Service Onboarding API\nuse-case capabilities',
    'Noise.md': '# Noise\nunrelated body',
  })
  try {
    let vetCalls = 0
    const _chat = async () => ({ content: '{"answer":"Use-case capabilities.","quotes":[{"doc":1,"quote":"use-case capabilities"}],"not_found":false}', usage: {} })
    const _vet = async () => { vetCalls++; return { content: '{"verdicts":[{"doc":1,"relevant":true}]}', usage: {} } }
    const r = await askOneShot({}, dir, 'How does the Service Onboarding API help consumers?', { corpus: ['Service_Onboarding_API.md', 'Noise.md'], _chat, _vet })
    assert.equal(r.window.length, 1)
    assert.deepEqual(r.window, ['Service_Onboarding_API.md'])
    assert.equal(vetCalls, 0) // named to ONE file — the second call is skipped
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot noquote: the same answer contract minus the quote demand — answer lands, no receipts', async () => {
  const dir = corpus({ 'a.md': 'The account escalation SLA is 48 hours.' })
  try {
    let prompt = ''
    const _chat = async (msgs) => { prompt = msgs[0].content; return { content: '{"answer":"The SLA is 48 hours.","not_found":false}', usage: { prompt_tokens: 5, completion_tokens: 3 } } }
    const r = await askOneShot({}, dir, 'What is the SLA?', { corpus: ['a.md'], promptStyle: 'noquote', _chat })
    assert.ok(!prompt.includes('copied VERBATIM'), 'the noquote prompt must not demand quotes')
    assert.ok(!prompt.includes('"quotes"'), 'the noquote prompt must not carry the quotes field')
    assert.ok(prompt.includes('carry BOTH sides'), 'the era rule must stay (answer contract is untouched)')
    assert.match(r.final.text, /The SLA is 48 hours\./)
    assert.deepEqual(r.legs, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot source: answer + named docs, no verbatim quote — the Source line lands, no Quote', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nThe account escalation SLA is 48 hours.' })
  try {
    let prompt = ''
    const _chat = async (msgs) => { prompt = msgs[0].content; return { content: '{"answer":"The SLA is 48 hours.","sources":[1],"not_found":false}', usage: { prompt_tokens: 5, completion_tokens: 4 } } }
    const r = await askOneShot({}, dir, 'What is the SLA?', { corpus: ['a.md'], promptStyle: 'source', _chat })
    assert.ok(!prompt.includes('copied VERBATIM'), 'the source prompt must not demand verbatim quotes')
    assert.ok(prompt.includes('"sources"'), 'the source prompt must ask for the source doc numbers')
    assert.match(r.final.text, /The SLA is 48 hours\./)
    assert.match(r.final.text, /Source: Doc A/)
    assert.ok(!r.final.text.includes('Quote:'), 'the source tier carries no Quote line')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot sentence: answer + doc-anchor, no whole-sentence copy', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nThe account escalation SLA is 48 hours.' })
  try {
    let prompt = ''
    const _chat = async (msgs) => { prompt = msgs[0].content; return { content: '{"answer":"The SLA is 48 hours.","sources":[{"doc":1,"anchor":"escalation SLA is 48 hours"}],"not_found":false}', usage: { prompt_tokens: 5, completion_tokens: 4 } } }
    const r = await askOneShot({}, dir, 'What is the SLA?', { corpus: ['a.md'], promptStyle: 'sentence', _chat })
    assert.ok(prompt.includes('never copy the whole sentence'), 'the sentence prompt must forbid whole-sentence copy')
    assert.ok(prompt.includes('"anchor"'), 'the sentence prompt must ask for a sentence anchor')
    assert.match(r.final.text, /The SLA is 48 hours\./)
    assert.match(r.final.text, /Source: Doc A/)
    assert.match(r.final.text, /Quote: The account escalation SLA is 48 hours\./, 'the anchor is lifted to the full verbatim sentence')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: a single-candidate FALLBACK also skips the vet (broadened speed gate)', async () => {
  const dir = corpus({
    'Roles.md': '# Roles\nvendor codes are created by REP in CRM today',
    'Noise.md': '# Noise\ncompletely unrelated content here',
  })
  try {
    let vetCalls = 0
    const _chat = async () => ({ content: '{"answer":"REP creates them in CRM.","quotes":[{"doc":1,"quote":"vendor codes are created by REP in CRM today"}],"not_found":false}', usage: {} })
    const _vet = async () => { vetCalls++; return { content: '{"verdicts":[{"doc":1,"relevant":true}]}', usage: {} } }
    const r = await askOneShot({}, dir, 'Who creates vendor codes today?', { corpus: ['Roles.md', 'Noise.md'], _chat, _vet })
    assert.equal(vetCalls, 0) // a fallback union that collapses to ONE file — nothing to prune
    assert.deepEqual(r.window, ['Roles.md'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: a named window that abstains gets one wider content pass (the reference trap)', async () => {
  // reference names Distractor.md; the fact lives INSIDE Team_Handbook.md
  const dir = corpus({
    'Account_Escalation.md': '# Account Escalation\nThe escalation matrix lists the roles involved.',
    'Team_Handbook.md': '# Team Handbook\nIncidents: the account escalation SLA is 48 hours.',
  })
  try {
    const calls = []
    const _chat = async (msgs) => {
      calls.push(msgs[0].content)
      const wide = msgs[0].content.includes('Team_Handbook')
      return wide
        ? { content: '{"answer":"The account escalation SLA is 48 hours.","quotes":[{"doc":2,"quote":"the account escalation SLA is 48 hours"}],"not_found":false}', usage: {} }
        : { content: '{"answer":"NOT FOUND — the corpus does not state it","quotes":[],"not_found":true}', usage: {} }
    }
    const _vet = async (msgs) => {
      const lines = msgs[0].content.split('\n').filter((l) => /^\d+:/.test(l))
      const verdicts = lines.map((l) => ({ doc: Number(/^(\d+):/.exec(l)[1]), relevant: /SLA/.test(l) }))
      return { content: JSON.stringify({ verdicts }), usage: {} }
    }
    const r = await askOneShot({}, dir, 'What is the account escalation SLA?', { corpus: ['Account_Escalation.md', 'Team_Handbook.md'], _chat, _vet })
    assert.equal(calls.length, 2) // the wide pass ran exactly once
    assert.ok(r.window.includes('Team_Handbook.md'))
    assert.match(r.final.text, /48 hours/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: a reference window that ANSWERS is not widened (no second call)', async () => {
  const dir = corpus({
    'Account_Escalation.md': '# Account Escalation\nThe account escalation SLA is 48 hours.',
    'Team_Handbook.md': '# Team Handbook\nunrelated body',
  })
  try {
    let calls = 0
    const _chat = async () => { calls++; return { content: '{"answer":"48 hours.","quotes":[{"doc":1,"quote":"The account escalation SLA is 48 hours"}],"not_found":false}', usage: {} } }
    const r = await askOneShot({}, dir, 'What is the account escalation SLA?', { corpus: ['Account_Escalation.md', 'Team_Handbook.md'], _chat })
    assert.equal(calls, 1) // answered by the named window — no wider pass
    assert.match(r.final.text, /48 hours/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the width governor: soft bar first — wide windows alone get focused (measured drift)', async () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ rel: `doc${i}.md`, matched: 'm', snippet: 'snippet about topic ' + i }))
  const prompts = []
  const _chat = async (msgs) => {
    prompts.push(msgs[0].content)
    const tight = msgs[0].content.includes('necessarily contain')
    const verdicts = [...msgs[0].content.matchAll(/^(\d+):/gm)].map((mm, i) => ({
      doc: Number(mm[1]),
      relevant: tight ? i < 2 : true, // soft keeps all; the necessity bar keeps the first two
    }))
    return { content: JSON.stringify({ verdicts }), usage: {} }
  }
  // narrow window → one soft call, no governor
  const narrow = await pruneByRelevance({}, 'q?', mk(2), { _chat })
  assert.equal(narrow.kept.length, 2)
  assert.equal(prompts.length, 1)
  // wide window → soft then the necessity bar focuses it
  prompts.length = 0
  const wide = await pruneByRelevance({}, 'q?', mk(5), { _chat })
  assert.equal(prompts.length, 2)
  assert.ok(prompts[1].includes('necessarily contain'), 'the second pass must be the tight bar')
  assert.equal(wide.kept.length, 2)
  assert.equal(wide.dropped.length, 3)
})

test('selectByReference: the fallback unions both tiers — bounded at 6 for the vet', () => {
  // neutral titles → reference matching finds nothing → the fallback runs;
  // every body carries the question stems, so BOTH tiers contribute
  const dir = corpus(Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [`Thing${i}.md`, `# Thing ${i}\nvendor codes creation creates today old way painful coordinator`]),
  ))
  try {
    const r = selectByReference(dir, 'who creates vendor codes today and what made the old way painful?', { corpus: Array.from({ length: 7 }, (_, i) => `Thing${i}.md`) })
    assert.equal(r.method, 'fallback')
    assert.equal(r.candidates.length, 6) // ranked ∪ body, bounded — the body tier fills past ranked's 3
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectByReference: a lone acronym is a HINT, not a reference — the union still runs (the N1 shape)', () => {
  // measured 2026-09-28 (N1): a client acronym sat in one meeting-notes head, the
  // stoplist dropped "service onboarding" (it touches every title), so
  // the acronym alone returned the reference window — and starved the
  // union that holds the deal-sheet home the answer lives in
  // (the measured acronym is redacted here; the shape is the unit)
  const dir = corpus({
    'Team_Review.md': '# Team Review Service Onboarding Experience ZIRA Business Services\nmeeting notes body',
    'Journey_Map.md': '# Service Onboarding Journey Map\nservice onboarding stages, the deal sheet and integration steps',
    'Noise.md': '# Service Onboarding Noise\nnothing else here at all',
  })
  try {
    const r = selectByReference(dir, 'What does ZIRA charge partners for integrations?')
    assert.equal(r.method, 'fallback') // the lone acronym never pre-empts the union
    assert.equal(r.candidates[0].rel, 'Team_Review.md') // the hint is first in line — never cut
    assert.ok(r.candidates.some((c) => c.rel === 'Journey_Map.md'), 'the body-tier home never entered the window')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot: the composition carries era splits and forbids related-material naming', async () => {
  const dir = corpus({ 'Roles.md': '# Roles\nIdentity: historically created applications, currently those are done by REP.' })
  try {
    const prompts = []
    const _chat = async (msgs) => {
      prompts.push(msgs[0].content)
      return { content: '{"answer":"Historically Identity; currently REP.","quotes":[{"doc":1,"quote":"Identity: historically created applications, currently those are done by REP."}],"not_found":false}', usage: {} }
    }
    await askOneShot({}, dir, 'Who creates applications in Identity?', { corpus: ['Roles.md'], _chat, _vet: async () => ({ content: '{"verdicts":[{"doc":1,"relevant":true}]}', usage: {} }) })
    const p = prompts[0]
    assert.ok(p.includes('change over time'), 'the era-split rule is missing from the composition')
    assert.ok(p.includes('the corpus does not state'), 'the abstention must carry the plain shape template')
    assert.ok(p.includes('Never name, quote, or summarize'), 'the abstention must forbid related-material naming')
    assert.ok(!p.includes('SUBSTANTIVE'), 'the substantive-neighbor rule must be gone')
    assert.ok(!/neighbors/i.test(p), 'the neighbor mechanism must be gone')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot evidenceFirst: pass B sees the quotes, never the documents', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fee is 10 USD\nsecret detail lives here' })
  try {
    const prompts = []
    const _chat = async (msgs) => {
      prompts.push(msgs[0].content)
      return prompts.length === 1
        ? { content: '{"quotes":[{"doc":1,"quote":"the fee is 10 USD"}],"not_found":false}', usage: { prompt_tokens: 10, completion_tokens: 5 } }
        : { content: '{"answer":"The fee is 10 USD.","not_found":false}', usage: { prompt_tokens: 3, completion_tokens: 4 } }
    }
    const r = await askOneShot({}, dir, 'What is the fee?', { corpus: ['a.md'], _chat, evidenceFirst: true })
    assert.equal(prompts.length, 2) // pass A then pass B — not one combined call
    assert.match(prompts[0], /=== DOC 1: a\.md ===/)
    assert.match(prompts[1], /=== EVIDENCE 1 \(DOC 1\) ===/)
    assert.ok(!prompts[1].includes('secret detail lives here'), 'pass B must not see the document')
    assert.match(r.final.text, /Q: The fee is 10 USD\./)
    assert.deepEqual(r.unanchored, [])
    assert.equal(r.tokens, 22) // the two calls' usage is summed, not overwritten
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot evidenceFirst: an answer number absent from the quotes is reported', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fee is 10 USD' })
  try {
    let calls = 0
    const _chat = async () => {
      calls++
      return calls === 1
        ? { content: '{"quotes":[{"doc":1,"quote":"the fee is 10 USD"}],"not_found":false}', usage: {} }
        : { content: '{"answer":"The fee is 12 USD.","not_found":false}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What is the fee?', { corpus: ['a.md'], _chat, evidenceFirst: true })
    assert.deepEqual(r.unanchored, ['12'])
    assert.match(r.final.text, /Q: The fee is 12 USD\./)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot evidenceFirst: an explicit derived value is not unanchored', async () => {
  const dir = corpus({ 'a.md': '# Doc A\neach unit costs 50 USD' })
  try {
    let calls = 0
    const _chat = async () => {
      calls++
      return calls === 1
        ? { content: '{"quotes":[{"doc":1,"quote":"each unit costs 50 USD"}],"not_found":false}', usage: {} }
        : { content: '{"answer":"The total is 150 USD.","not_found":false}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What do three units cost?', { corpus: ['a.md'], _chat, evidenceFirst: true, evidenceAllow: [150] })
    assert.deepEqual(r.unanchored, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot evidenceFirst + evidenceAnchor abstain: an unanchored answer becomes NOT FOUND', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fee is 10 USD' })
  try {
    let calls = 0
    const _chat = async () => {
      calls++
      return calls === 1
        ? { content: '{"quotes":[{"doc":1,"quote":"the fee is 10 USD"}],"not_found":false}', usage: {} }
        : { content: '{"answer":"The fee is 12 USD.","not_found":false}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What is the fee?', { corpus: ['a.md'], _chat, evidenceFirst: true, evidenceAnchor: 'abstain' })
    assert.match(r.final.text, /^Q: NOT FOUND/)
    assert.match(r.final.text, /Quote: NOT FOUND/)
    assert.ok(!r.final.text.includes('12 USD'), 'an unanchored claim must not surface')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot evidenceFirst: a quote-pass abstention falls back to the single pass by default', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fee is 10 USD' })
  try {
    let calls = 0
    const _chat = async () => {
      calls++
      if (calls === 1) return { content: '{"quotes":[],"not_found":true}', usage: {} }
      return { content: '{"answer":"The fee is 10 USD.","quotes":[{"doc":1,"quote":"the fee is 10 USD"}],"not_found":false}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What is the fee?', { corpus: ['a.md'], _chat, evidenceFirst: true })
    assert.equal(calls, 2) // the quote pass abstained; the ordinary read ran once
    assert.match(r.final.text, /Q: The fee is 10 USD\./)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('askOneShot evidenceFirst + evidenceFallback false: the evidence boundary is absolute', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nthe fee is 10 USD' })
  try {
    let calls = 0
    const _chat = async () => {
      calls++
      return { content: '{"quotes":[],"not_found":true}', usage: {} }
    }
    const r = await askOneShot({}, dir, 'What is the fee?', { corpus: ['a.md'], _chat, evidenceFirst: true, evidenceFallback: false })
    assert.equal(calls, 1) // no ordinary read behind the evidence boundary
    assert.match(r.final.text, /Q: NOT FOUND/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('rehomeLegs: the span is minimal while the quote keeps the full line for the receipt', () => {
  const docs = [{ rel: 'a.md', content: 'The facade is frozen. A user-visible change gets a kit/CHANGELOG.md entry.' }]
  const { kept } = rehomeLegs(docs, [{ doc: 1, quote: 'A user-visible change gets a kit/CHANGELOG.md entry.' }])
  assert.equal(kept[0].quote, 'The facade is frozen. A user-visible change gets a kit/CHANGELOG.md entry.')
  assert.equal(kept[0].span, 'A user-visible change gets a kit/CHANGELOG.md entry.')
})
