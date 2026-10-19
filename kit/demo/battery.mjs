#!/usr/bin/env node
// Adversarial traceability battery — the receipt machine under attack.
//
// Drives the REAL pipeline (parseOneShot → rehomeLegs → assembleOneShot →
// verify) over the demo corpus with recorded model outputs. Offline,
// deterministic, no model, no network. The positive cases must resolve; the
// negative cases MUST be rejected — which makes the battery non-vacuous: a
// verifier that always passed would fail every negative case.
//
//   node kit/demo/battery.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOneShot } from '../lib/answer/parse.mjs'
import { rehomeLegs, assembleOneShot } from '../lib/answer/assemble.mjs'
import { verify } from '../lib/receipts/gate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORPUS = join(HERE, 'corpus')
const DOCS = ['team-handbook.md', 'incident-policy.md'].map((rel) => ({ rel, content: readFileSync(join(CORPUS, rel), 'utf8') }))
const FULL_LINE = 'The account escalation SLA is 48 hours from first contact.'

function pipeline(question, item, output) {
  const parsed = parseOneShot(output)
  const { kept, dropped } = rehomeLegs(DOCS, parsed.quotes)
  const receipt = assembleOneShot(CORPUS, question, DOCS, parsed)
  const verdict = verify(item, receipt.text, CORPUS)
  return { parsed, kept, dropped, receipt, verdict }
}
const out = (answer, quotes, not_found = false) => JSON.stringify({ answer, quotes, not_found })
const gate = (item, text) => verify(item, text, CORPUS)

const CASES = [
  {
    label: 'honest quote resolves byte-for-byte',
    run() {
      const r = pipeline('What is the account escalation SLA?', { not_found: false }, out('The account escalation SLA is 48 hours.', [{ doc: 1, quote: 'The account escalation SLA is 48 hours' }]))
      const ok = r.dropped.length === 0 && r.kept.length === 1 && !r.verdict.abstained && r.verdict.mechanicalPass && /Team Handbook/.test(r.receipt.text)
      return { ok, detail: r.verdict.why }
    },
  },
  {
    label: 'a short anchor is LIFTED to the full line (verbatim-by-construction)',
    run() {
      const r = pipeline('What is the account escalation SLA?', { not_found: false }, out('48 hours.', [{ doc: 1, quote: 'account escalation SLA' }]))
      const ok = r.kept.length === 1 && r.receipt.text.includes(FULL_LINE) && r.verdict.mechanicalPass
      return { ok, detail: `receipt quote = ${JSON.stringify(r.kept[0]?.quote ?? null)}` }
    },
  },
  {
    label: 'a mislocated leg is RE-HOMED to the file whose bytes contain it',
    run() {
      const r = pipeline('What is the account escalation SLA?', { not_found: false }, out('48 hours.', [{ doc: 2, quote: FULL_LINE }]))
      const ok = r.kept.length === 1 && r.kept[0].rehomed === true && r.kept[0].doc === 1 && /Team Handbook/.test(r.receipt.text) && r.verdict.mechanicalPass
      return { ok, detail: `re-homed to ${r.receipt.legs[0]?.rel ?? '(none)'}` }
    },
  },
  {
    label: 'a fabricated quote is DROPPED and never carried',
    run() {
      const r = pipeline('How fast do Sev-1 incidents page?', { not_found: false }, out('Within 2 minutes.', [{ doc: 2, quote: 'Sev-1 incidents page the on-call engineer within 2 minutes' }]))
      const ok = r.receipt.dropped.length === 1 && r.receipt.legs.length === 0 && /Quote: NOT FOUND/.test(r.receipt.text) && r.verdict.mechanicalPass === false
      return { ok, detail: `dropped ${r.receipt.dropped.length}; legs=${r.receipt.legs.length}; gate=${r.verdict.mechanicalPass}` }
    },
  },
  {
    label: 'a poisoned receipt (hand-written lie) is REJECTED at the gate',
    run() {
      const text = ['Q: Sev-1 incidents page the on-call engineer within 2 minutes.', 'Source: Incident Policy (Mar 2026) · incident-policy.md', 'Quote: Sev-1 incidents page the on-call engineer within 2 minutes.'].join('\n')
      const v = gate({ not_found: false }, text)
      return { ok: v.mechanicalPass === false, detail: v.why }
    },
  },
  {
    label: 'a fabricated title is REJECTED (title mismatch)',
    run() {
      const text = ['Q: 48 hours.', 'Source: Zephyr Benefits (Feb 2026) · team-handbook.md', `Quote: ${FULL_LINE}`].join('\n')
      const v = gate({ not_found: false }, text)
      return { ok: v.mechanicalPass === false && /title mismatch/.test(v.why), detail: v.why }
    },
  },
  {
    label: 'an implausible date is REJECTED (date mismatch)',
    run() {
      const text = ['Q: 48 hours.', 'Source: Team Handbook (Jan 1999) · team-handbook.md', `Quote: ${FULL_LINE}`].join('\n')
      const v = gate({ not_found: false }, text)
      return { ok: v.mechanicalPass === false && /date mismatch/.test(v.why), detail: v.why }
    },
  },
  {
    label: 'an abstention carries NO receipts (stray legs are dropped)',
    run() {
      const r = pipeline('What is the parental leave policy?', { not_found: true }, out('NOT FOUND', [{ doc: 1, quote: FULL_LINE }], true))
      const ok = r.receipt.legs.length === 0 && r.receipt.dropped.length === 1 && !r.receipt.text.includes(FULL_LINE) && r.verdict.mechanicalPass === true
      return { ok, detail: `legs=${r.receipt.legs.length}; dropped=${r.receipt.dropped.length}; gate=${r.verdict.why}` }
    },
  },
  {
    label: 'an uncited answer does NOT pass (unproven ≠ proven)',
    run() {
      const r = pipeline('What is the account escalation SLA?', { not_found: false }, out('48 hours.', []))
      return { ok: r.verdict.mechanicalPass === false, detail: r.verdict.why }
    },
  },
]

const results = CASES.map((c) => {
  try { return { label: c.label, ...c.run() } } catch (e) { return { label: c.label, ok: false, detail: 'threw: ' + e.message } }
})

console.log('adversarial traceability battery — the receipt machine under attack')
console.log('offline · deterministic · no model. must-reject cases make it non-vacuous.\n')
let pass = 0
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.label}`)
  if (!r.ok) console.log(`    → ${r.detail}`)
  if (r.ok) pass++
}
console.log(`\n${pass}/${results.length} cases hold`)
if (pass !== results.length) { console.error('\nbattery FAILED — the receipt machine did not hold'); process.exit(1) }
console.log('the machine holds: every honest citation resolves; every fabricated one is rejected.')
