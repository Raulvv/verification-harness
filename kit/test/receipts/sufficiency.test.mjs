// The sufficiency judge: verdict parsing and the judge call (stubbed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVerdict, judgeSufficiency, SUFFICIENCY_PROMPT, isMinicheck, parseMinicheck, minicheckPrompt, judgeByCommand, judgeGrade, GRADE_SCHEMA } from '../../lib/receipts/sufficiency.mjs'

test('parseVerdict: INSUFFICIENT is not shadowed by the substring "sufficient"', () => {
  assert.equal(parseVerdict('INSUFFICIENT'), 'INSUFFICIENT')
  assert.equal(parseVerdict('The evidence is sufficient.'), 'SUFFICIENT')
  assert.equal(parseVerdict(''), '?')
})

test('judgeSufficiency reads the verdict from the judge output', async () => {
  const _chat = async (msgs) => { assert.match(msgs[0].content, /EVIDENCE:/); return { content: 'INSUFFICIENT' } }
  assert.equal(await judgeSufficiency({}, 'q', 'ev', 'a', { _chat }), 'INSUFFICIENT')
})

test('SUFFICIENCY_PROMPT carries the question, evidence and answer', () => {
  const p = SUFFICIENCY_PROMPT('Who?', 'EVIDENCE', 'Bob')
  assert.match(p, /Who\?/)
  assert.match(p, /EVIDENCE/)
  assert.match(p, /Bob/)
})

test('minicheck flavor: detected by model id, Yes/No parsed, Document/Claim prompt', async () => {
  assert.ok(isMinicheck('bespoke-minicheck'))
  assert.ok(!isMinicheck('qwen3.5:9b'))
  assert.equal(parseMinicheck('Yes'), 'SUFFICIENT')
  assert.equal(parseMinicheck('No'), 'INSUFFICIENT')
  assert.equal(minicheckPrompt('doc', 'claim'), 'Document: doc\nClaim: claim')
  // judgeSufficiency routes a minicheck judge through the Document/Claim prompt
  let seen = ''
  const _chat = async (msgs) => { seen = msgs[0].content; return { content: 'No' } }
  const v = await judgeSufficiency({ model: 'bespoke-minicheck' }, 'q?', 'the evidence', 'the claim', { _chat })
  assert.equal(v, 'INSUFFICIENT')
  assert.match(seen, /^Document: the evidence\nClaim: the claim$/)
})

test('judgeByCommand runs an external detector and parses its verdict', () => {
  assert.equal(judgeByCommand("printf 'INSUFFICIENT'", 'q', 'ev', 'a'), 'INSUFFICIENT')
  assert.equal(judgeByCommand("printf 'SUFFICIENT'", 'q', 'ev', 'a'), 'SUFFICIENT')
})

test('judgeGrade: the schema-constrained 1-5 verdict is parsed; junk is null', async () => {
  assert.equal(GRADE_SCHEMA.properties.score.minimum, 1)
  assert.equal(GRADE_SCHEMA.properties.score.maximum, 5)
  const ok = await judgeGrade({ model: 'glm-5.3-flash' }, 'q', 'ev', 'a', { _chat: async () => ({ content: '{"score": 4}' }) })
  assert.equal(ok, 4)
  const junk = await judgeGrade({ model: 'glm-5.3-flash' }, 'q', 'ev', 'a', { _chat: async () => ({ content: 'not json' }) })
  assert.equal(junk, null)
  const out = await judgeGrade({ model: 'glm-5.3-flash' }, 'q', 'ev', 'a', { _chat: async () => ({ content: '{"score": 9}' }) })
  assert.equal(out, null)
})
