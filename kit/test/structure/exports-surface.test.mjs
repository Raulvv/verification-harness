// Surface guard (RN-K03, epic retrieval-kit-refactor Iteration 0): the kit's
// public facade `kit/index.mjs` is frozen on purpose. An accidental export
// added, removed or renamed is red here, not silent. Adding a public symbol is
// a deliberate edit of this list — that is the point.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as facade from '../../index.mjs'

// The frozen public surface, alphabetical. Keep it sorted; the test sorts
// Object.keys before comparing, so order here is documentation only.
const EXPECTED = [
  'ABSTAIN_TERMS', 'ADAPTERS', 'EMBED_MODEL',
  'ONESHOT_SCHEMA', 'ONESHOT_SCHEMA_NOQUOTE', 'ONESHOT_SCHEMA_SENTENCE', 'ONESHOT_SCHEMA_SOURCE',
  'PROMPT', 'PROMPT_NOQUOTE', 'PROMPT_SENTENCE', 'PROMPT_SOURCE', 'PROMPT_SOURCE_V45', 'PROMPT_V45',
  'abstainLine', 'askAggregate', 'askOneShot', 'assembleOneShot', 'assembleSource',
  'chatWithUsage', 'citeDate', 'collectPages',
  'denseIndex', 'detectAdapter', 'dot',
  'embedTexts', 'evidenceMatches',
  'htmlToText',
  'liftEvidence', 'loadConfig', 'locate',
  'mdFiles', 'monthYear',
  'norm', 'normalize', 'normalizeSource',
  'parseAnswer', 'parseCite', 'parseOneShot', 'pruneByRelevance',
  'questionTerms',
  'rank', 'rehomeLegs', 'resolveDate', 'resolveMeta', 'resolveTitle', 'runTwg',
  'scoreAll', 'scoreItem', 'selectByDense', 'selectByReference', 'selectFuse', 'selectUnion',
  'snippetFor', 'splitId', 'splitLegs', 'stem', 'syncSource',
  'transcriptish', 'verify',
].sort()

const HERE = dirname(fileURLToPath(import.meta.url))

test('facade: the public export surface is exactly the frozen list', () => {
  assert.deepEqual(Object.keys(facade).sort(), EXPECTED)
})

test('facade: no frozen symbol resolves to undefined', () => {
  const undef = Object.entries(facade).filter(([, v]) => v === undefined).map(([k]) => k)
  assert.deepEqual(undef, [])
})

test('facade: it is a pure re-export — lib/ only, never bin/ or top-level I/O', () => {
  const src = readFileSync(join(HERE, '..', '..', 'index.mjs'), 'utf8')
  const specifiers = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  assert.ok(specifiers.length >= 10, 'unexpectedly few modules re-exported')
  assert.ok(specifiers.every((s) => s.startsWith('./lib/')), 'every specifier must be ./lib/**')
  assert.ok(!specifiers.some((s) => s.includes('/bin/')), 'the facade must never import bin/')
})
