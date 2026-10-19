#!/usr/bin/env node
// Validate the accuracy oracle against the OFFICIAL HotpotQA token-F1: on the 4B
// reader's answered-answerable items, does the oracle (reader_correct) agree with
// token-F1 >= 0.5 (and with EM)? Reports agreement + Cohen's kappa.
import { readFileSync } from 'node:fs'
import { hotpotRows } from './ingest-hotpot.mjs'

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/g
const norm = (s) => String(s ?? '').toLowerCase().replace(PUNCT, '').replace(/\b(a|an|the)\b/g, ' ').replace(/\s+/g, ' ').trim()
const toks = (s) => norm(s).split(' ').filter(Boolean)
function f1(pred, gold) {
  const p = toks(pred), g = toks(gold)
  if (!p.length || !g.length) return 0
  const gc = new Map(); for (const t of g) gc.set(t, (gc.get(t) ?? 0) + 1)
  let c = 0; for (const t of p) if (gc.get(t) > 0) { c++; gc.set(t, gc.get(t) - 1) }
  if (!c) return 0
  const pr = c / p.length, rc = c / g.length
  return (2 * pr * rc) / (pr + rc)
}
const em = (pred, gold) => (norm(pred) === norm(gold) ? 1 : 0)

function kappa(pairs) {
  const n = pairs.length
  let po = 0, a1 = 0, b1 = 0
  for (const [a, b] of pairs) { if (a === b) po++; a1 += a; b1 += b }
  po /= n
  const pe = (a1 / n) * (b1 / n) + (1 - a1 / n) * (1 - b1 / n)
  return { agreement: po, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe), n }
}

const r = readFileSync(process.argv[2] ?? 'bench/results/hotpot-fresh-301-600.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
const ans = r.filter((x) => x.condition === 'answerable' && x.reader_abstained === 0)
const pct = (x) => (100 * x).toFixed(1)
for (const [label, decide] of [['token-F1 >= 0.5', (a, g) => (f1(a, g) >= 0.5 ? 1 : 0)], ['EM', (a, g) => em(a, g)]]) {
  const pairs = ans.map((x) => { const row = byId.get(x.id); return [x.reader_correct, decide(x.answer, row.answer)] })
  const k = kappa(pairs)
  console.log(`oracle vs ${label}: n=${k.n} agreement ${pct(k.agreement)}% · Cohen's kappa ${k.kappa.toFixed(3)}`)
}
// where they disagree, by F1 band
const dis = ans.map((x) => { const row = byId.get(x.id); return { f1: f1(x.answer, row.answer), oracle: x.reader_correct, ans: x.answer, gold: row.answer } }).filter((d) => (d.f1 >= 0.5 ? 1 : 0) !== d.oracle)
console.log(`\ndisagreements (oracle vs F1>=0.5): ${dis.length}`)
for (const d of dis.slice(0, 12)) console.log(`  oracle=${d.oracle} f1=${d.f1.toFixed(2)} gold=${JSON.stringify(String(d.gold).slice(0, 40))} ans=${JSON.stringify(String(d.ans).slice(0, 70))}`)
