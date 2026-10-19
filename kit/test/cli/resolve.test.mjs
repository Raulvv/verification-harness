// The resolution ladder (RN-G02): flags → env → nearest workspace → defaults.
// The default retriever is `router` and needs an embedder — no silent fallback
// (RN-G03, revised). No network: the probe is injected.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAsk } from '../../lib/cli/resolve.mjs'
import { writeWorkspace } from '../../lib/cli/workspace.mjs'

const noEmbedder = async () => false
const hasEmbedder = async () => true

test('resolve: flags beat env beat workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-'))
  try {
    writeWorkspace(dir, { model: 'ws-model', baseUrl: 'http://localhost:11434/v1', retriever: 'reference' })
    const fromWs = await resolveAsk({ flags: {}, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(fromWs.corpusRoot, dir)
    assert.equal(fromWs.modelId, 'ws-model')
    assert.equal(fromWs.retriever, 'reference')
    const fromEnv = await resolveAsk({ flags: {}, env: { RETRIEVAL_MODEL: 'env-model' }, cwd: dir, probe: noEmbedder })
    assert.equal(fromEnv.modelId, 'env-model')
    const fromFlag = await resolveAsk({ flags: { model: 'flag-model' }, env: { RETRIEVAL_MODEL: 'env-model' }, cwd: dir, probe: noEmbedder })
    assert.equal(fromFlag.modelId, 'flag-model')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolve: the tier defaults to source-v45; --quote switches to v45', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs3-'))
  try {
    const def = await resolveAsk({ flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(def.tier, 'source-v45')
    const quoted = await resolveAsk({ flags: { corpus: dir, retriever: 'reference', quote: true }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(quoted.tier, 'v45')
    const explicit = await resolveAsk({ flags: { corpus: dir, retriever: 'reference', tier: 'full' }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(explicit.tier, 'full')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolve: no corpus / no model fail loud; router is the default and needs an embedder', async () => {
  await assert.rejects(resolveAsk({ flags: {}, env: {}, cwd: tmpdir(), probe: noEmbedder }), /no corpus/)
  const dir = mkdtempSync(join(tmpdir(), 'rs2-'))
  try {
    await assert.rejects(
      resolveAsk({ flags: { corpus: dir, baseUrl: 'https://api.example/v1' }, env: {}, cwd: dir, probe: noEmbedder }),
      /no chat model/,
    )
    // default retriever is router; with no embedder it fails loud — no fallback
    await assert.rejects(
      resolveAsk({ flags: { corpus: dir }, env: {}, cwd: dir, probe: noEmbedder }),
      /embedder/,
    )
    const withEmbedder = await resolveAsk({ flags: { corpus: dir }, env: {}, cwd: dir, probe: hasEmbedder })
    assert.equal(withEmbedder.retriever, 'router')
    const ref = await resolveAsk({ flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(ref.retriever, 'reference')
    assert.equal(ref.modelId, 'qwen3.5:4b') // safe local default
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolve: judge-evidence defaults to window, --judge-evidence receipt|union opts in', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs4-'))
  try {
    const def = await resolveAsk({ flags: { corpus: dir, retriever: 'reference' }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(def.judgeEvidence, 'window')
    const flag = await resolveAsk({ flags: { corpus: dir, retriever: 'reference', judgeEvidence: 'union' }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(flag.judgeEvidence, 'union')
    const env2 = await resolveAsk({ flags: { corpus: dir, retriever: 'reference' }, env: { RETRIEVAL_JUDGE_EVIDENCE: 'receipt' }, cwd: dir, probe: noEmbedder })
    assert.equal(env2.judgeEvidence, 'receipt')
    // frozen graded bands
    assert.equal(def.gateLo, 2)
    assert.equal(def.gateHi, 5)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
