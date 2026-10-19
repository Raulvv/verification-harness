// `ask`: one question → answer + machine-checked receipt + verdict, offline
// (the model boundary is injected). Default tier is the shipped `source-v45`
// (Source, no quote); `--quote` switches to the full-quote `v45` tier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAsk, formatAsk } from '../../lib/cli/ask.mjs'

const stubChat = (json) => async () => ({ content: JSON.stringify(json), usage: { prompt_tokens: 5, completion_tokens: 5 } })
const withCorpus = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-'))
  writeFileSync(join(dir, 'a.md'), '# Doc A\nthe fact is 42\n')
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }))
}

test('ask: default source-v45 — a Source receipt, verified', async () => {
  await withCorpus(async (dir) => {
    const res = await runAsk({
      question: 'what is the fact?',       flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
      chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }),
    })
    assert.equal(res.tier, 'source-v45')
    assert.match(res.receipt, /Q: The fact is 42\./)
    assert.match(res.receipt, /Source: Doc A .* · a\.md/)
    assert.ok(!/^Quote:/m.test(res.receipt), 'source-v45 carries no Quote line')
    assert.equal(res.gate.passed, true)
    assert.equal(typeof res.ms, 'number')
    assert.match(formatAsk(res), /[\d.]+ s\)/) // … tok · 12.3 s)
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
      question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
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
      question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference', sufficient: true }, env: {}, cwd: dir,
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
      question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference', sufficient: true, unverified: true }, env: {}, cwd: dir,
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
      question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir,
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
    const base = { question: 'what is the fact?', flags: { corpus: dir, retriever: 'reference', sufficient: true }, env: {}, cwd: dir, chat: stubChat({ answer: 'The fact is 42.', sources: [1], not_found: false }) }
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
