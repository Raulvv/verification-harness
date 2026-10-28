// v4.5 — the structured-reasoning prompt must scaffold reasoning AND keep the
// receipt contract (verbatim quotes). If either half is dropped it is no longer
// v4.5: the reasoning half is the measured lift, the quote half is the
// precision guarantee that removed the regressions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROMPT, PROMPT_SOURCE, PROMPT_SOURCE_V45, PROMPT_V45 } from '../../lib/answer/prompt.mjs'

test('v4.5 prompt: structural reasoning + the verbatim-quote contract', () => {
  const p = PROMPT_V45('What is X?', ['=== DOC 1: a ===\nbody'])
  assert.match(p, /reason structurally/i, 'the structural instruction is present')
  assert.match(p, /quotes/, 'the receipt contract (quotes field) is present')
  assert.match(p, /VERBATIM/i, 'the verbatim demand is present')
  assert.ok(p.includes('What is X?'), 'the question is carried')
  assert.ok(p.includes('=== DOC 1'), 'the window is carried')
})

test('v4.5 prompt is PROMPT (receipt) with the structural line prepended — same contract underneath', () => {
  const q = 'Q?', parts = ['=== DOC 1: a ===\nbody']
  const v45 = PROMPT_V45(q, parts)
  const full = PROMPT(q, parts)
  assert.ok(v45.endsWith(full), 'v4.5 keeps the full receipt prompt intact')
  assert.ok(v45.length > full.length, 'v4.5 adds the structural instruction')
})

test('v4.5 on the source tier: scaffold present, source contract (no quote) underneath', () => {
  const q = 'Q?', parts = ['=== DOC 1: a ===\nbody']
  const sv45 = PROMPT_SOURCE_V45(q, parts)
  const src = PROMPT_SOURCE(q, parts)
  assert.match(sv45, /reason structurally/i, 'the structural instruction is present')
  assert.ok(sv45.endsWith(src), 'the source contract is intact underneath')
  assert.ok(!/quotes/.test(sv45), 'the source tier stays quote-free (no verbatim field)')
})

test('partial rule is default in the receipt and source prompts', () => {
  const q = 'Q?', parts = ['=== DOC 1: a ===\nbody']
  for (const p of [PROMPT_V45(q, parts), PROMPT_SOURCE_V45(q, parts)]) {
    assert.match(p, /multiple parts and only some are stated/i)
    assert.match(p, /explicitly say which parts are not stated/i)
    assert.match(p, /For a question with no stated part, silence is not a negative/i)
  }
})
