// Dense selection (layer 0, the default retriever) — ranking, the index cache,
// BM25+RRF fusion and the union. The embedder is stubbed, so this is offline
// and deterministic (epic retrieval-kit-refactor Iteration 1, HK-3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { denseIndex, selectByDense, selectFuse, selectUnion } from '../../lib/retrieval/dense.mjs'

// Deterministic bag-of-words embedder over three feature words: cosine ranking
// is then predictable without a model.
const FEATURES = ['alpha', 'beta', 'gamma']
const embed = async (texts) =>
  texts.map((t) => {
    const w = String(t).toLowerCase()
    return FEATURES.map((f) => (w.match(new RegExp(`\\b${f}\\b`, 'g')) ?? []).length)
  })

function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dense-'))
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
  return dir
}

test('selectByDense ranks by cosine to the embedded question and honors k', async () => {
  const dir = corpus({ 'alpha.md': 'alpha alpha alpha', 'beta.md': 'beta beta', 'gamma.md': 'gamma' })
  try {
    const r = await selectByDense(dir, 'alpha', { _embed: embed, k: 2 })
    assert.equal(r.method, 'dense')
    assert.equal(r.candidates.length, 2)
    assert.equal(r.candidates[0].rel, 'alpha.md') // the question's own word wins
    assert.equal(r.matches[0].rel, 'alpha.md')
    assert.ok(r.matches[0].snippet.length > 0)
    const one = await selectByDense(dir, 'alpha', { _embed: embed, k: 1 })
    assert.equal(one.candidates.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the dense index is cached by file identity and reused (no second doc embed)', async () => {
  const dir = corpus({ 'a.md': 'alpha', 'b.md': 'beta' })
  try {
    let calls = 0
    const counted = async (t) => { calls++; return embed(t) }
    await selectByDense(dir, 'alpha', { _embed: counted })
    const first = calls
    assert.equal(first, 2) // one document batch + one query
    await selectByDense(dir, 'alpha', { _embed: counted })
    assert.equal(calls - first, 1) // cached: the query only
    assert.ok(existsSync(join(dir, '.retrieval-index')))
    assert.equal(readdirSync(join(dir, '.retrieval-index')).length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a changed corpus re-embeds — the index key moves with the files', async () => {
  const dir = corpus({ 'a.md': 'alpha' })
  try {
    let calls = 0
    const counted = async (t) => { calls++; return embed(t) }
    await selectByDense(dir, 'alpha', { _embed: counted })
    const first = calls
    writeFileSync(join(dir, 'a.md'), 'alpha plus a change that alters the size')
    await selectByDense(dir, 'alpha', { _embed: counted })
    assert.equal(calls - first, 2) // re-embed documents + query
    assert.equal(readdirSync(join(dir, '.retrieval-index')).length, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectFuse fuses BM25 and dense with RRF; the exact-term doc leads', async () => {
  const dir = corpus({ 'p1.md': 'nothing relevant here', 'p2.md': 'alpha alpha alpha alpha', 'p3.md': 'gamma' })
  try {
    const r = await selectFuse(dir, 'alpha', { _embed: embed, k: 2 })
    assert.equal(r.method, 'fuse')
    assert.equal(r.candidates.length, 2)
    assert.equal(r.candidates[0].rel, 'p2.md') // top in both BM25 and dense
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('selectUnion interleaves reference and dense, deduped, capped at k', async () => {
  const dir = corpus({
    'Service_Onboarding_API.md': '# Service Onboarding API\nalpha goal',
    'Service_Onboarding_Guide.md': '# Service Onboarding Guide\nbeta guide',
    'Unrelated.md': '# Unrelated\ngamma',
  })
  try {
    const corpusList = ['Service_Onboarding_API.md', 'Service_Onboarding_Guide.md', 'Unrelated.md']
    const r = await selectUnion(dir, 'Service Onboarding API alpha', { corpus: corpusList, _embed: embed, k: 2 })
    assert.equal(r.method, 'union')
    assert.equal(r.candidates.length, 2)
    assert.equal(new Set(r.candidates.map((c) => c.rel)).size, 2) // deduped
    assert.ok(r.candidates.some((c) => c.rel === 'Service_Onboarding_API.md'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('denseIndex reports its model and a per-stem document frequency', async () => {
  const dir = corpus({ 'a.md': 'alpha beta', 'b.md': 'beta gamma' })
  try {
    const idx = await denseIndex(dir, ['a.md', 'b.md'], { _embed: embed })
    assert.equal(idx.files.length, 2)
    assert.equal(idx.vectors.length, 2)
    assert.ok(idx.df && Object.keys(idx.df).length > 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
