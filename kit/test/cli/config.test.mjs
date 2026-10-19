// `config`: seal once in the working directory (recording the corpus path), show,
// reset — and refuse to store a literal key (RN-G12).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runConfig } from '../../lib/cli/config.mjs'
import { findWorkspace, corpusOf } from '../../lib/cli/workspace.mjs'

test('config: seal in the cwd (corpus recorded), show it, reset it; a literal key is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'cfg-'))
  const corpus = join(root, 'docs')
  mkdirSync(corpus)
  try {
    assert.throws(() => runConfig({ flags: { corpus: 'docs', apiKey: 'sk-literal' }, cwd: root }), /literal key/)

    const w = runConfig({ flags: { corpus: 'docs', model: 'qwen3.5:4b', apiKeyEnv: 'OPENAI_API_KEY' }, cwd: root })
    assert.equal(w.action, 'write')
    assert.ok(existsSync(w.file))
    assert.ok(w.file.startsWith(root), 'the seat is written where you ran config')
    assert.ok(!w.file.startsWith(corpus), 'not at the corpus root')

    const ws = findWorkspace(root)
    assert.equal(corpusOf(ws), corpus) // the recorded corpus resolves

    const show = runConfig({ flags: { show: true }, cwd: root })
    assert.equal(show.action, 'show')
    assert.match(show.output, /qwen3\.5:4b/)
    assert.match(show.output, /docs/)

    // discovery walks up from inside the corpus too
    assert.equal(findWorkspace(corpus).dir, root)

    const reset = runConfig({ flags: { reset: true }, cwd: root })
    assert.equal(reset.action, 'reset')
    assert.equal(findWorkspace(root), null)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
