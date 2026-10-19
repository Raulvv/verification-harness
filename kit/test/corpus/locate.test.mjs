// LOCATE: the deterministic candidate room — the one stage the one-shot
// path still uses (the fallback when no phrase reference is found).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locate } from '../../lib/retrieval/locate.mjs'

function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'locate-test-'))
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
  return dir
}

test('locate: the candidate room stays small — the coverage window caps it at 5', () => {
  const dir = corpus(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`doc${i}.md`, 'alpha beta gamma delta question words here'])))
  try {
    assert.equal(locate(dir, 'alpha beta gamma question', 8).candidates.length, 5) // the known-good room
    assert.equal(locate(dir, 'alpha beta gamma question').candidates.length, 5)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('locate re-indexes a changed corpus — the cache is keyed on files, not the root (HK-10)', () => {
  const dir = corpus({ 'a.md': 'alpha only' })
  try {
    assert.equal(locate(dir, 'zebra', 5).candidates.length, 0) // not present yet
    writeFileSync(join(dir, 'a.md'), 'alpha zebra appears now')
    assert.ok(locate(dir, 'zebra', 5).candidates.some((c) => c.rel === 'a.md'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
