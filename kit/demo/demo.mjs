#!/usr/bin/env node
// Hero demo — the receipt machine, offline and deterministic.
//
// No model, no network, no API key. The model's answers are RECORDED
// fixtures; the REAL machinery runs on them:
//   parseOneShot → rehomeLegs → assembleOneShot → verify.
// The star is the machine: an honest citation resolves byte-for-byte, a
// fabricated one is dropped and rejected, and a question the corpus cannot
// answer abstains with no receipt.
//
//   node kit/demo/demo.mjs
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOneShot } from '../lib/answer/parse.mjs'
import { rehomeLegs, assembleOneShot } from '../lib/answer/assemble.mjs'
import { verify } from '../lib/receipts/gate.mjs'

// The demo ships with its corpus, so paths are resolved relative to this file
// on purpose (the corpus is part of the demo, not of the caller's cwd).
export const HERE = dirname(fileURLToPath(import.meta.url))
export const CORPUS = join(HERE, 'corpus')
export const DOCS = ['team-handbook.md', 'incident-policy.md'].map((rel) => ({ rel, content: readFileSync(join(CORPUS, rel), 'utf8') }))
export const FIXTURES = JSON.parse(readFileSync(join(HERE, 'model-outputs.json'), 'utf8'))

// The real machine on one recorded model answer.
export function runFixture(fx) {
  const parsed = parseOneShot(fx.output)
  const { kept, dropped } = rehomeLegs(DOCS, parsed.quotes)
  const receipt = assembleOneShot(CORPUS, fx.question, DOCS, parsed)
  const verdict = verify(fx.item, receipt.text, CORPUS)
  return { parsed, kept, dropped, receipt, verdict }
}

// A lying citation presented directly to the gate (as if hand-written).
export function poisonedReceipt() {
  return [
    'Q: Sev-1 incidents page the on-call engineer within 2 minutes.',
    'Source: Incident Policy (Mar 2026) · incident-policy.md',
    'Quote: Sev-1 incidents page the on-call engineer within 2 minutes.',
  ].join('\n')
}

const indent = (t) => t.split('\n').map((l) => '    ' + l).join('\n')
const banner = (t) => ['', '─'.repeat(72), t, '─'.repeat(72)].join('\n')

function main() {
  const by = Object.fromEntries(FIXTURES.map((f) => [f.label, f]))
  const honest = runFixture(by['honest'])
  const lie = runFixture(by['fabricated quote'])
  const nf = runFixture(by['not found'])
  const poisoned = verify({ not_found: false }, poisonedReceipt(), CORPUS)

  console.log('Receipt-grounded retrieval — the machine, offline.')
  console.log("No model, no network, no API key. The model's answers are recorded")
  console.log('fixtures; everything below is the real machinery:')
  console.log('parse → rehome → assemble → verify.')

  console.log(banner('ACT 1 — an honest citation resolves'))
  console.log('Q: ' + by['honest'].question)
  console.log(indent(honest.receipt.text))
  console.log(`gate: ✓ ${honest.verdict.why}`)
  console.log('      the quote is byte-verbatim in the file it names')

  console.log(banner('ACT 2 — a fabricated citation is rejected'))
  console.log('The model claims: "Sev-1 incidents page the on-call engineer within 2 minutes."')
  console.log('No file contains that sentence.')
  console.log(`machine: dropped ${lie.dropped.length} invented leg → it never enters a receipt`)
  console.log(indent(lie.receipt.text))
  console.log('If that citation is presented anyway (as a hand-written receipt):')
  console.log(`gate: ✗ ${poisoned.why}`)

  console.log(banner('ACT 3 — the honest refusal'))
  console.log('Q: ' + by['not found'].question)
  console.log(indent(nf.receipt.text))
  console.log(`gate: ✓ ${nf.verdict.why}`)
  console.log('      no receipt is invented to cover the gap')
  console.log('')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
