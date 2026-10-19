// The mechanical grounding floor for honest abstention.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { salientTerms, ungroundedTerms } from '../../lib/receipts/grounding.mjs'

test('grounding: an answer grounded in the window has no missing terms', () => {
  const ev = '# Pikachu\nType: Electric\nEvolves from: Pichu\n'
  assert.deepEqual(ungroundedTerms('Pikachu is an Electric-type Pokémon.', ev), [])
  assert.deepEqual(ungroundedTerms('The pre-evolution of Pikachu is Pichu.', ev), [])
})

test('grounding: a memory leak names an entity absent from the window', () => {
  const ev = '# Charmander\nType: Fire\nEvolves into: Charmeleon\n'
  const missing = ungroundedTerms('The first gym is led by Brock, who uses Charmander (Fire-type).', ev)
  assert.ok(missing.includes('Brock'), 'Brock is not in the window')
  assert.ok(!missing.includes('Charmander'), 'Charmander IS in the window')
})

test('grounding: function/generic words never trigger, proper nouns and numbers do', () => {
  const t = salientTerms('According to the documents, Rock Lee appears in Episode 47.')
  assert.ok(!t.includes('According') && !t.includes('Documents') && !t.includes('Episode'))
  assert.ok(t.includes('Rock') && t.includes('Lee') && t.includes('47'))
})
