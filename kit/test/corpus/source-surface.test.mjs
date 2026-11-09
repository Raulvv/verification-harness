// Surface guard: the adapter registry is frozen on purpose. An accidental
// edit is red here, not silent. Adding an adapter is a deliberate edit of
// this test — that is the point (RN-S01).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { ADAPTERS, normalizeSource } from '../../lib/corpus/source.mjs'

test('adapter registry: exactly the known kinds, each a list/fetch pair', () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), ['flat', 'mediawiki'])
  for (const [kind, adapter] of Object.entries(ADAPTERS)) {
    assert.equal(typeof adapter.list, 'function', `${kind}.list`)
    assert.equal(typeof adapter.fetch, 'function', `${kind}.fetch`)
  }
})

test('normalizeSource: url sources keep their knobs and defaults', () => {
  const src = normalizeSource({ source: { type: 'url', url: 'https://example.fandom.com' } }, '/cfg')
  assert.equal(src.type, 'url')
  assert.equal(src.limit, 300)
  assert.equal(src.delayMs, 350)
  assert.equal(src.adapter, 'auto')
  assert.ok(src.corpusRoot.endsWith(join('.retrieval-mirror', 'example.fandom.com')))
})
