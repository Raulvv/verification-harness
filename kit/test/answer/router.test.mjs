// The `router` retriever — dense first, the NOT FOUND is the router signal —
// driven end-to-end through askOneShot with stubbed chat/embed, then re-checked
// by the gate. This is the gate HK-16 said did not exist (epic retrieval It. 1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askOneShot } from '../../lib/answer/oneshot.mjs'
import { verify } from '../../lib/receipts/gate.mjs'

// All documents rank equally under this stub; the tests assert ROUTING, not
// ranking, so a flat embedder is exactly right.
const flatEmbed = async (texts) => texts.map(() => [1, 0, 0])
const j = (o) => JSON.stringify(o)

function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'router-'))
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text)
  return dir
}

test('router: a first-read abstention takes the second hop and re-reads', async () => {
  const dir = corpus({ 'base.md': '# Base\nthe base fact is that nothing secret sits here', 'hop.md': '# Hop\nthe hidden hop fact is 42' })
  try {
    let n = 0
    const prompts = []
    const _chat = async (msgs) => {
      n++
      const p = msgs[0].content
      prompts.push(p)
      if (p.includes('SHORT search query')) return { content: 'hidden hop', usage: {} }
      if (n === 1) return { content: j({ answer: 'NOT FOUND', quotes: [], not_found: true }), usage: {} }
      return { content: j({ answer: 'the secret is 42', quotes: [{ doc: 1, quote: 'the hidden hop fact is 42' }], not_found: false }), usage: {} }
    }
    const r = await askOneShot({}, dir, 'what is the secret?', { retriever: 'router', _chat, _embed: flatEmbed })
    assert.ok(prompts.some((p) => p.includes('SHORT search query')), 'the bridge prompt must fire')
    assert.equal(n, 3) // abstain read → bridge query → answering read
    assert.match(r.final.text, /the secret is 42/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('router: a confident first read never escalates — and its receipt verifies', async () => {
  const dir = corpus({ 'a.md': '# Doc A\nalpha the answer is x' })
  try {
    let n = 0
    const _chat = async () => {
      n++
      return { content: j({ answer: 'x', quotes: [{ doc: 1, quote: 'alpha the answer is x' }], not_found: false }), usage: {} }
    }
    const r = await askOneShot({}, dir, 'what is x?', { retriever: 'router', _chat, _embed: flatEmbed })
    assert.equal(n, 1) // no bridge call
    assert.match(r.final.text, /Q: x/)
    const item = { id: 't', question: 'what is x?', not_found: false, candidates: [{ path: 'a.md', quote: 'alpha the answer is x' }] }
    assert.equal(verify(item, r.final.text, dir).mechanicalPass, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
