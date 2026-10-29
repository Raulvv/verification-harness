import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAbsence, shouldRunAbsence, ABSENCE_RE } from '../../lib/answer/absence.mjs'

const corpus = () => {
  const dir = mkdtempSync(join(tmpdir(), 'abs-'))
  writeFileSync(join(dir, 'a.md'), '# Registered Nurses\nThe median pay is 86,070.\n')
  writeFileSync(join(dir, 'b.md'), '# Carpenters\nThe median pay is 56,350.\n')
  return dir
}
const factsChat = (facts) => async () => ({ content: JSON.stringify({ facts }), usage: { prompt_tokens: 3, completion_tokens: 3, total_tokens: 6 } })

test('absence: a counter-document found by the fact search re-reads and fixes the answer', async () => {
  const dir = corpus()
  try {
    const docs = [{ rel: 'a.md', content: 'Registered Nurses 86,070' }]
    const fixed = { text: 'The median pay is 56,350.', gate: { mechanicalPass: true }, tokens: 10, usage: { total_tokens: 10 }, ms: 1 }
    const out = await runAbsence({
      question: 'What is the carpenter median pay?', docs, corpusRoot: dir,
      chat: factsChat([{ entity: 'carpenter', attribute: 'median pay' }]),
      read: async () => fixed,
    })
    assert.equal(out.absence.fixed, true)
    assert.deepEqual(out.absence.candidates, ['b.md'])
    assert.equal(out.fixed, fixed)
    assert.equal(out.usage.total_tokens, 6)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('absence: no counter-document leaves the first answer and records the miss', async () => {
  const dir = corpus()
  try {
    const out = await runAbsence({
      question: 'What is the pilot median pay?', docs: [], corpusRoot: dir,
      chat: factsChat([{ entity: 'pilot', attribute: 'median pay' }]),
      read: async () => { throw new Error('must not read') },
    })
    assert.equal(out.absence.fixed, false)
    assert.deepEqual(out.absence.candidates, [])
    assert.equal(out.fixed, null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('absence: the trigger recognises the abstention shapes and the absence sentences', () => {
  assert.equal(shouldRunAbsence('NOT FOUND'), true)
  assert.equal(shouldRunAbsence('The documents do not state the California pay.'), true)
  assert.equal(shouldRunAbsence('The median pay is 86,070.'), false)
  assert.equal(ABSENCE_RE.test('The figure is not stated.'), true)
})
