// Config: the one-line source switch, path resolution, env overrides.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../lib/config.mjs'

test('loadConfig: source string vs object, corpus-relative paths, env overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
  writeFileSync(join(dir, 'c.json'), JSON.stringify({
    source: 'local', docsDir: 'docs', indexPath: 'docs/INDEX.md', goldenPath: 'golden.json',
    models: { retriever: { baseUrl: 'http://x', apiKeyEnv: 'CFG_TEST_KEY', model: 'm1', label: 'l' } },
  }))
  const cfg = loadConfig(join(dir, 'c.json'))
  assert.equal(cfg.source.type, 'local')
  assert.equal(cfg.corpusRoot, dir)
  assert.equal(cfg.docsDir, join(dir, 'docs'))
  assert.equal(cfg.goldenPath, join(dir, 'golden.json'))
  assert.equal(cfg.models.retriever.model, 'm1')
  process.env.CFG_TEST_KEY = 'k'
  process.env.RETRIEVAL_MODEL = 'overridden'
  const cfg2 = loadConfig(join(dir, 'c.json'))
  assert.equal(cfg2.models.retriever.model, 'overridden')
  delete process.env.RETRIEVAL_MODEL
  delete process.env.CFG_TEST_KEY
  rmSync(dir, { recursive: true, force: true })
})

test('loadConfig: url source maps the corpus at the mirror and demands a key story', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg2-'))
  writeFileSync(join(dir, 'c.json'), JSON.stringify({
    source: { type: 'url', url: 'https://wiki.example' }, goldenPath: 'g.json',
    models: { retriever: { baseUrl: 'http://x', model: 'm', apiKeyEnv: 'CFG_TEST_KEY2' } },
  }))
  process.env.CFG_TEST_KEY2 = 'k'
  const cfg = loadConfig(join(dir, 'c.json'))
  assert.ok(cfg.corpusRoot.endsWith(join('.retrieval-mirror', 'wiki.example')))
  assert.equal(cfg.goldenPath, join(dir, 'g.json'))
  delete process.env.CFG_TEST_KEY2
  // no apiKeyEnv and no RETRIEVAL_API_KEY → refused, loudly
  writeFileSync(join(dir, 'keyless.json'), JSON.stringify({
    source: { type: 'url', url: 'https://wiki.example' }, goldenPath: 'g.json',
    models: { retriever: { baseUrl: 'http://x', model: 'm' } },
  }))
  delete process.env.RETRIEVAL_API_KEY
  assert.throws(() => loadConfig(join(dir, 'keyless.json')), /apiKeyEnv|RETRIEVAL_API_KEY/)
  rmSync(dir, { recursive: true, force: true })
})

test('a model with inline auth (no apiKeyEnv) is accepted (HK-12)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg3-'))
  writeFileSync(join(dir, 'c.json'), JSON.stringify({
    source: 'local',
    models: { retriever: { baseUrl: 'http://x', model: 'm', auth: 'Basic z' } },
  }))
  const cfg = loadConfig(join(dir, 'c.json'))
  assert.equal(cfg.models.retriever.auth, 'Basic z')
  rmSync(dir, { recursive: true, force: true })
})
