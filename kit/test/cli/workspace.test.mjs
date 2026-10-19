// The sealed workspace (RN-G11): `.retrieval/config.json`, discovered upward,
// relocatable, and never holding a secret (RN-G12).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeWorkspace, findWorkspace, clearWorkspace, formatWorkspace, corpusOf } from '../../lib/cli/workspace.mjs'

test('workspace: write, walk-up discovery, relocatable corpus, no secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'))
  try {
    const file = writeWorkspace(dir, { model: 'qwen3.5:4b', apiKeyEnv: 'OPENAI_API_KEY' })
    assert.ok(existsSync(file))
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(raw.model, 'qwen3.5:4b')
    assert.equal(raw.corpus, '.') // relocatable
    assert.ok(!('apiKey' in raw)) // RN-G12

    const nested = join(dir, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    const ws = findWorkspace(nested) // discovered from a subdirectory
    assert.equal(ws.dir, dir)
    assert.equal(corpusOf(ws), dir)
    assert.match(formatWorkspace(ws), /model\s+qwen3\.5:4b/)

    assert.equal(clearWorkspace(dir), true)
    assert.equal(findWorkspace(nested), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
