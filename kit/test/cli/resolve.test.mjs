// The resolution ladder (RN-G02): flags → env → nearest workspace → defaults.
// The default retriever is `reference` — deterministic and embedder-free, the
// mode the benchmark numbers were measured under. `dense`/`router` opt into the
// embedder and fail loud when it is unreachable — no silent fallback (RN-G03,
// revised). No network: the probe is injected.
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

test('resolve: no corpus / no model fail loud; the default retriever is reference (no probe)', async () => {
  await assert.rejects(resolveAsk({ flags: {}, env: {}, cwd: tmpdir(), probe: noEmbedder }), /no corpus/)
  const dir = mkdtempSync(join(tmpdir(), 'rs2-'))
  try {
    await assert.rejects(
      resolveAsk({ flags: { corpus: dir, baseUrl: 'https://api.example/v1' }, env: {}, cwd: dir, probe: noEmbedder }),
      /no chat model/,
    )
    // the shipped default needs no embedder — it resolves even when the probe
    // would report none (the probe is simply never called)
    const def = await resolveAsk({ flags: { corpus: dir }, env: {}, cwd: dir, probe: noEmbedder })
    assert.equal(def.retriever, 'reference')
    // dense/router opt into the embedder; unreachable → fail loud with the fix
    await assert.rejects(
      resolveAsk({ flags: { corpus: dir, retriever: 'dense' }, env: {}, cwd: dir, probe: noEmbedder }),
      /the dense retriever needs a local embedder/,
    )
    await assert.rejects(
      resolveAsk({ flags: { corpus: dir, retriever: 'router' }, env: {}, cwd: dir, probe: noEmbedder }),
      /the router retriever needs a local embedder/,
    )
    const dense = await resolveAsk({ flags: { corpus: dir, retriever: 'dense' }, env: {}, cwd: dir, probe: hasEmbedder })
    assert.equal(dense.retriever, 'dense')
    // an unknown retriever is refused, not silently degraded to reference
    await assert.rejects(
      resolveAsk({ flags: { corpus: dir, retriever: 'rotuer' }, env: {}, cwd: dir, probe: hasEmbedder }),
      /unknown retriever/,
    )
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

test('resolve: a workspace that names an unexported key env var fails loud', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs5-'))
  try {
    writeWorkspace(dir, { model: 'hosted-model', baseUrl: 'https://api.example/v1', apiKeyEnv: 'MISSING_OC_KEY' })
    await assert.rejects(
      resolveAsk({ flags: {}, env: {}, cwd: dir, probe: noEmbedder }),
      /MISSING_OC_KEY is not set/,
    )
    const ok = await resolveAsk({ flags: {}, env: { MISSING_OC_KEY: 'x' }, cwd: dir, probe: noEmbedder })
    assert.equal(ok.modelId, 'hosted-model')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
