// Local embeddings — batched calls, vector math and loud failures. `fetch` is
// stubbed, so no network and no Ollama (It. 1, HK-3).
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { embedTexts, normalize, dot, EMBED_MODEL } from '../../lib/retrieval/embed.mjs'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

test('embedTexts batches and returns embeddings in order', async () => {
  const calls = []
  globalThis.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body)
    calls.push(b)
    assert.match(String(url), /\/api\/embed$/)
    return { ok: true, json: async () => ({ embeddings: b.input.map(() => [1, 2, 3]) }) }
  }
  const v = await embedTexts(['a', 'b', 'c'], { batch: 2 })
  assert.equal(calls.length, 2) // 2 + 1
  assert.deepEqual(calls[0].input, ['a', 'b'])
  assert.deepEqual(calls[1].input, ['c'])
  assert.equal(calls[0].model, EMBED_MODEL)
  assert.equal(v.length, 3)
})

test('embedTexts is loud on a bad response', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => 'down' })
  await assert.rejects(embedTexts(['a']), /embed: HTTP 503/)
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
  await assert.rejects(embedTexts(['a']), /no embeddings/)
})

test('normalize is unit-length; dot is the inner product', () => {
  assert.deepEqual(normalize([3, 4]), [0.6, 0.8])
  assert.equal(dot([1, 2], [3, 4]), 11)
  assert.deepEqual(normalize([0, 0]), [0, 0]) // zero vector guarded
})
