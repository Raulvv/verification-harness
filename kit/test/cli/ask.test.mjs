// `ask`: one question → answer + machine-checked receipt + verdict, offline
// (the model boundary is injected). Default tier is `v45` + absence; `--source`
// opts into the lighter Source receipt; `--no-absence` is the gate-only stage.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAsk, formatAsk } from '../../lib/cli/ask.mjs'
import { runConfig } from '../../lib/cli/config.mjs'

const stubChat = (json) => async () => ({ content: JSON.stringify(json), usage: { prompt_tokens: 5, completion_tokens: 5 } })
const withCorpus = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-'))
  writeFileSync(join(dir, 'a.md'), '# Doc A\nthe fact is 42\n')
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }))
}

test('ask: default v45 — a quoted receipt, verified; --source is the lighter opt-in', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?',       flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', quotes: [{ doc: 1, quote: 'the fact is 42' }], not_found: false }),
    })
    assert.equal(res.tier, 'v45')
    assert.match(res.receipt, /Q: The fact is 42\./)
    assert.match(res.receipt, /Quote: the fact is 42/)
    assert.equal(res.gate.passed, true)
    assert.equal(typeof res.ms, 'number')
    assert.match(formatAsk(res), /[\d.]+ s\)/) // … tok · 12.3 s)
  })
})

test('ask --source: the Source receipt, no Quote line', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?',       flags: { corpus: dir, source: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }),
    })
    assert.equal(res.tier, 'source-v45')
    assert.ok(!/^Quote:/m.test(res.receipt), 'source-v45 carries no Quote line')
    assert.equal(res.gate.passed, true)
  })
})

test('ask --no-absence: the gate-only stage', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the secret?',       flags: { corpus: dir, noAbsence: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'NOT FOUND', quotes: [], not_found: true }),
    })
    assert.equal(res.absence, null)
    assert.equal(res.gate.passed, true)
  })
})

test('ask --quote: the full verbatim quote, verified', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?',       flags: { corpus: dir, quote: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', quotes: [{ doc: 1, quote: 'the fact is 42' }], not_found: false }),
    })
    assert.equal(res.tier, 'v45')
    assert.match(res.receipt, /Quote: the fact is 42/)
    assert.equal(res.gate.passed, true)
  })
})

test('ask: an honest NOT FOUND passes as an abstention', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the secret?',       flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'NOT FOUND', sources: [], not_found: true }),
    })
    assert.equal(res.abstained, true)
    assert.equal(res.gate.passed, true)
  })
})

test('ask: a refusal phrased with the refusal vocabulary passes', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the secret?',       flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The documents do not state the secret.', sources: [], not_found: true }),
    })
    assert.equal(res.abstained, true)
    assert.equal(res.gate.passed, true)
  })
})

test('ask: a model that flags not_found but writes a claim is rejected, not certified', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?',       flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'A completely different claim.', sources: [], not_found: true }),
    })
    assert.equal(res.abstained, false)
    assert.equal(res.gate.passed, false)
    assert.match(formatAsk(res), /rejected/)
  })
})

test('ask: a fabricated quote (--quote tier) is rejected', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?', flags: { corpus: dir, quote: true, retriever: 'reference', noGrounding: true }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 7.', quotes: [{ doc: 1, quote: 'the fact is 7' }], not_found: false }),
    })
    assert.equal(res.gate.passed, false)
  })
})

test('ask: a lexical grounding hint is non-authoritative (never a pass/fail)', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?', flags: { corpus: dir, source: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'Brock used Charmander.', sources: [1], not_found: false }),
    })
    assert.equal(res.abstained, false) // the hint never forces an abstention
    assert.ok(res.grounding.missing.includes('Brock'))
    assert.equal(res.gate.passed, true)
    assert.ok(!/NOT FOUND/.test(res.receipt))
  })
})

test('ask --sufficient: an INSUFFICIENT verdict abstains; SUFFICIENT keeps the answer', async () => {
  await withCorpus(async (dir) => {
    const base = {
      question: 'what is the fact?', flags: { corpus: dir, source: true, retriever: 'reference', sufficient: true }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }),
    }
    const insufficient = await runAsk({ ...base, judgeFn: async () => 'INSUFFICIENT' })
    assert.equal(insufficient.abstained, true)
    assert.equal(insufficient.sufficiency.verdict, 'INSUFFICIENT')
    assert.match(insufficient.receipt, /NOT FOUND/)
    assert.equal(insufficient.gate.passed, true)

    const sufficient = await runAsk({ ...base, judgeFn: async () => 'SUFFICIENT' })
    assert.equal(sufficient.abstained, false)
    assert.match(sufficient.receipt, /The fact is 42/)
  })
})

test('ask --sufficient --unverified: an INSUFFICIENT verdict keeps the answer, flagged unverified', async () => {
  await withCorpus(async (dir) => {
    const base = {
      question: 'what is the fact?', flags: { corpus: dir, source: true, retriever: 'reference', sufficient: true, unverified: true }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }),
    }
    const res = await runAsk({ ...base, judgeFn: async () => 'INSUFFICIENT' })
    assert.equal(res.abstained, false)
    assert.equal(res.state, 'unverified')
    assert.match(res.receipt, /The fact is 42/) // the answer is shown, flagged
    assert.equal(res.sufficiency.verdict, 'INSUFFICIENT')

    const ok = await runAsk({ ...base, judgeFn: async () => 'SUFFICIENT' })
    assert.equal(ok.state, 'verified')
  })
})

test('ask --json emits the receipt, the verdict and the timing', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?', flags: { corpus: dir, source: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }),
    })
    const j = JSON.parse(formatAsk(res, { json: true }))
    assert.equal(j.gate.passed, true)
    assert.equal(j.tier, 'source-v45')
    assert.equal(typeof j.ms, 'number')
  })
})

test('ask --sufficient graded gate: score bands -> verified / unverified / not_found', async () => {
  await withCorpus(async (dir) => {
    const base = { question: 'what is the fact?', flags: { corpus: dir, source: true, retriever: 'reference', sufficient: true }, env: {}, cwd: dir, chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }) }
    assert.equal((await runAsk({ ...base, gradeFn: async () => 5 })).state, 'verified')
    assert.equal((await runAsk({ ...base, gradeFn: async () => 2 })).state, 'unverified')
    const nf = await runAsk({ ...base, gradeFn: async () => 1 })
    assert.equal(nf.state, 'not_found')
    assert.equal(nf.abstained, true)
    const nul = await runAsk({ ...base, gradeFn: async () => null }) // reader answered, judge gave no score
    assert.equal(nul.state, 'unverified')
    assert.equal(nul.fail_reason, 'judge_no_score')
    assert.equal(nul.abstained, false)
  })
})

test('ask: an unknown or valued flag fails loud — a `--quote.` typo never runs the wrong tier silently', async () => {
  await withCorpus(async (dir) => {
    const base = { env: {}, cwd: dir, chat: stubChat({ answer: 'x', sources: [1], not_found: false }) }
    await assert.rejects(
      runAsk({ question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference', 'quote.': true }, ...base }),
      /unknown flag: --quote\./,
    )
    // a bare-only flag with a value means the parser swallowed the next token
    await assert.rejects(
      runAsk({ question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference', quote: 'maybe' }, ...base }),
      /--quote is a bare flag/,
    )
  })
})

test('ask --minimal-receipt: the shipped default receipt shrinks to the minimal contract', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-'))
  writeFileSync(join(dir, 'a.md'), '# Doc A\nThe fact is 42. The next sentence covers unrelated filler that need not ship.\n')
  try {
    const base = {
      question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference', quote: true }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', quotes: [{ doc: 1, quote: 'The fact is 42\nThe next sentence covers unrelated filler that need not ship.' }], not_found: false }),
    }
    const full = await runAsk(base)
    const min = await runAsk({ ...base, flags: { ...base.flags, minimalReceipt: true } })
    assert.ok(min.receipt.length < full.receipt.length, 'the minimal receipt is strictly shorter')
    assert.match(min.receipt, /The fact is 42/)
    assert.equal(min.gate.passed, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('ask: a failed reader call is an error, never a verified abstention', async () => {
  await withCorpus(async (dir) => {
    const boom = async () => { throw new Error('no API key for reader (set OPENCODE_API_KEY)') }
    const res = await runAsk({
      question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir, chat: boom,
    })
    assert.equal(res.state, 'error')
    assert.ok(res.reader_error, 'the failure reason is surfaced')
    assert.match(res.reader_error, /no API key/)
    assert.equal(res.gate.passed, false)
    const out = formatAsk(res)
    assert.match(out, /gate: not checked/)
    assert.doesNotMatch(out, /gate: verified/)
    assert.match(out, /reader failed: .*no API key/)
    const j = JSON.parse(formatAsk(res, { json: true }))
    assert.equal(j.state, 'error')
    assert.match(j.reader_error, /no API key/)
  })
})

test('ask --quote --json: citations carry source ids and byte offsets', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?', flags: { corpus: dir, quote: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', quotes: [{ doc: 1, quote: 'the fact is 42' }], not_found: false }),
    })
    const c = res.citations[0]
    assert.equal(c.document_index, 1)
    assert.equal(c.rel, 'a.md')
    assert.equal(c.exact, true)
    assert.equal(c.quote, 'the fact is 42')
    const j = JSON.parse(formatAsk(res, { json: true }))
    assert.equal(j.citations.length, 1)
    assert.equal(j.citations[0].quote, 'the fact is 42')
  })
})

test('ask --quote: the human receipt groups evidence by source (no flat quote line)', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?', flags: { corpus: dir, quote: true, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', quotes: [{ doc: 1, quote: 'the fact is 42' }], not_found: false }),
    })
    const out = formatAsk(res)
    assert.match(out, /^Q: The fact is 42\./m)
    assert.match(out, /Sources:\n {2}\[1\] Doc A .* · a\.md/)
    assert.match(out, /Evidence:\n {2}\[1\] \(/)
    assert.match(out, /gate: verified/)
    assert.doesNotMatch(out, /^Quote:/m, 'the flat Quote line is replaced by grouped evidence')
  })
})

test('ask --formal: deterministic answer with assumptions and quotes, no model call', async () => {
  let called = false
  const formal = {
    question: 'best stability',
    answer: 'The top-ranked occupation under the default definition `stability = 1×projected growth` is Software Developers.',
    verdict: 'ENTAILED_UNDER_ASSUMPTIONS',
    assumptions: [
      { key: 'metric:stability', human: 'stability = 1×projected growth', source: 'default' },
    ],
    citations: [
      { title: 'Software Developers', slug: 'computer__software', field: 'outlook_pct', quote: 'Job Outlook, 2023-33 | 17% (Much faster than average)' },
    ],
    spec_version: 'spec-v1',
    spec_id: 'abc123',
    unresolved: [],
    route: { action: 'show', reason: 'the claim follows from the premises' },
  }
  const res = await runAsk({
    question: 'best stability',
    flags: { formal: true },
    env: {},
    cwd: process.cwd(),
    chat: async () => { called = true },
    formalFn: async ({ question }) => ({ question, formal, ms: 1 }),
  })
  assert.equal(called, false, 'the formal path never calls the reader')
  assert.equal(res.formal.verdict, 'ENTAILED_UNDER_ASSUMPTIONS')
  const out = formatAsk(res)
  assert.match(out, /^A: The top-ranked occupation/m)
  assert.match(out, /Assumptions:\n {2}- stability = 1×projected growth \[default\]/)
  assert.match(out, /Evidence:\n {2}\[1\] Software Developers · computer__software · outlook_pct/)
  assert.match(out, /Job Outlook, 2023-33 \| 17%/)
  assert.match(out, /formal: ENTAILED_UNDER_ASSUMPTIONS · spec spec-v1 · abc123/)
  assert.match(out, /route: show — the claim follows from the premises/)
  const j = JSON.parse(formatAsk(res, { json: true }))
  assert.equal(j.formal.spec_id, 'abc123')
  assert.equal(j.formal.assumptions[0].human, 'stability = 1×projected growth')
  assert.equal(j.formal.route.action, 'show')
})

test('ask --formal: citations are gate-verified when --corpus is supplied', async () => {
  await withCorpus(async (dir) => {
    const formal = {
      answer: 'The fact is 42.', verdict: 'ENTAILED_UNDER_ASSUMPTIONS',
      assumptions: [], citations: [{ title: 'Doc A', slug: 'a', field: 'fact', quote: 'the fact is 42' }],
      spec_version: 'spec-v1', spec_id: 'x',
    }
    const res = await runAsk({
      question: 'what is the fact?', flags: { formal: true, corpus: dir }, env: {}, cwd: dir,
      formalFn: async () => ({ formal, ms: 1 }),
    })
    assert.equal(res.formal.citations[0].gate.passed, true)
    assert.match(formatAsk(res), /\(gate: verified\)/)
  })
})

test('ask --formal: a fabricated quote is rejected by the gate', async () => {
  await withCorpus(async (dir) => {
    const formal = {
      answer: 'The fact is 7.', verdict: 'ENTAILED_UNDER_ASSUMPTIONS',
      assumptions: [], citations: [{ title: 'Doc A', slug: 'a', field: 'fact', quote: 'the fact is 7' }],
      spec_version: 'spec-v1', spec_id: 'x',
    }
    const res = await runAsk({
      question: 'what is the fact?', flags: { formal: true, corpus: dir }, env: {}, cwd: dir,
      formalFn: async () => ({ formal, ms: 1 }),
    })
    assert.equal(res.formal.citations[0].gate.passed, false)
    assert.match(formatAsk(res), /gate: REJECTED/)
  })
})

test('ask --formal: without a corpus the quote is labeled ungated', async () => {
  const formal = {
    answer: 'The fact is 42.', verdict: 'ENTAILED_UNDER_ASSUMPTIONS',
    assumptions: [], citations: [{ title: 'Doc A', slug: 'a', field: 'fact', quote: 'the fact is 42' }],
    spec_version: 'spec-v1', spec_id: 'x',
  }
  const res = await runAsk({
    question: 'what is the fact?', flags: { formal: true }, env: {}, cwd: process.cwd(),
    formalFn: async () => ({ formal, ms: 1 }),
  })
  assert.equal(res.formal.citations[0].gate.passed, null)
  assert.match(formatAsk(res), /gate: ungated/)
})

test('ask --formal: a sealed workspace can carry the formal command', async () => {
  const root = mkdtempSync(join(tmpdir(), 'formal-cfg-'))
  try {
    writeFileSync(join(root, 'docs.md'), '# Doc\n')
    const stub = join(root, 'stub.mjs')
    writeFileSync(
      stub,
      "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{console.log(JSON.stringify({answer:'stub answer',verdict:'ENTAILED',assumptions:[],citations:[],spec_version:'spec-v1',spec_id:'x'}))})\n",
    )
    runConfig({ flags: { corpus: '.', formalCmd: `${process.execPath} ${stub}` }, cwd: root })
    const res = await runAsk({ question: 'q', flags: { formal: true }, env: {}, cwd: root })
    assert.equal(res.formal.verdict, 'ENTAILED')
    assert.equal(res.formal.answer, 'stub answer')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ask --formal: a missing formal command fails loud', async () => {
  await assert.rejects(
    runAsk({ question: 'x', flags: { formal: true }, env: {}, cwd: process.cwd() }),
    /--formal needs --formal-cmd/,
  )
})

test('ask --formal: --no-defaults is forwarded to the formal command', async () => {
  let seen = null
  const formal = {
    question: 'x', answer: 'I need a definition.', verdict: 'NEEDS_SPECIFICATION',
    assumptions: [], citations: [], spec_version: null, spec_id: null,
    unresolved: [{ kind: 'quantifier', symbol: 'most', allowed: ['majority'] }],
  }
  const res = await runAsk({
    question: 'x',
    flags: { formal: true, noDefaults: true },
    env: {},
    cwd: process.cwd(),
    formalFn: async ({ flags }) => { seen = flags.noDefaults; return { formal, ms: 1 } },
  })
  assert.equal(seen, true)
  assert.match(formatAsk(res), /Unresolved:\n {2}- quantifier:most allowed=majority/)
})

test('ask --max-quotes-per-doc: caps quotes per document and rejects non-positive values', async () => {
  await withCorpus(async (dir) => {
    // withCorpus writes one line; add a second quotable line for the cap
    const fs = await import('node:fs')
    fs.writeFileSync(`${dir}/a.md`, '# Doc A\nthe fact is 42\nthe other fact is 7\n')
    const res = await runAsk({
      question: 'what are the facts?', flags: { corpus: dir, quote: true, retriever: 'reference', maxQuotesPerDoc: 1 }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The facts are 42 and 7.', quotes: [{ doc: 1, quote: 'the fact is 42' }, { doc: 1, quote: 'the other fact is 7' }], not_found: false }),
    })
    assert.equal(res.citations.length, 1)
    assert.equal(res.citations[0].quote, 'the fact is 42')
    await assert.rejects(
      runAsk({ question: 'q', flags: { corpus: dir, retriever: 'reference', maxQuotesPerDoc: 0 }, env: {}, cwd: dir, chat: stubChat({}) }),
      /positive integer/,
    )
  })
})
