// Surface guard (It. 0, epic retrieval-confluence-source): the adapter
// registry and the confluence seam are frozen on purpose. An accidental
// edit is red here, not silent. Adding the confluence adapter is a
// deliberate edit of this test — that is the point (RN-S01).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { ADAPTERS, normalizeSource } from '../../lib/corpus/source.mjs'

test('adapter registry: exactly the known kinds, each a list/fetch pair', () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), ['confluence', 'flat', 'mediawiki'])
  for (const [kind, adapter] of Object.entries(ADAPTERS)) {
    assert.equal(typeof adapter.list, 'function', `${kind}.list`)
    assert.equal(typeof adapter.fetch, 'function', `${kind}.fetch`)
  }
})

test('normalizeSource: the confluence seam exists — type accepted, space kept, adapter defaults to confluence', () => {
  const src = normalizeSource({ source: { type: 'confluence', url: 'https://x.atlassian.net/wiki', space: 'DEMO' } }, '/cfg')
  assert.equal(src.type, 'confluence')
  assert.equal(src.space, 'DEMO')
  assert.equal(src.limit, 300)
  assert.equal(src.delayMs, 350)
  assert.equal(src.adapter, 'confluence')
  assert.equal(src.slug, 'x.atlassian.net-wiki')
  assert.ok(src.corpusRoot.endsWith(join('.retrieval-mirror', 'x.atlassian.net-wiki')))
})
