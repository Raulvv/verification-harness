#!/usr/bin/env node
// Add the kit's REAL selector (`selectByReference`) as a retrieval arm next to
// BM25/dense/hybrid, on the small per-question corpora the bench uses.
// selectByReference reads FILES on disk, so each question's candidate docs are
// materialized as markdown (H1 = title) in an OS temp dir and removed after.
//
//   node bench/run-selectarm.mjs [n] [hotpot|qasper]
//
// Reports both-gold recall@k: does the window contain ALL of the gold
// evidence docs (HotpotQA: both supporting paragraphs; Qasper: the gold
// section)? Arms: selector (as returned) vs hybrid top-5 / top-6.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectByReference } from '../kit/index.mjs'
import { hybridRank } from './lib/rank.mjs'
import { hotpotRows } from './ingest-hotpot.mjs'
import { qasperQuestions } from './ingest-qasper.mjs'

const N = Number(process.argv[2] ?? 60)
const DATASET = process.argv[3] ?? 'hotpot'
const HERE = dirname(fileURLToPath(import.meta.url))
const RESULTS = join(HERE, 'results')
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const flat = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

// run selectByReference over a question's candidate docs (files in a temp dir)
function runSelector(docs, question) {
  const dir = mkdtempSync(join(tmpdir(), 'selarm-'))
  const map = new Map()
  docs.forEach((d, i) => {
    const base = d.title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `doc${i}`
    let rel = `${base}.md`, k = 1
    while (map.has(rel)) rel = `${base}_${k++}.md`
    writeFileSync(join(dir, rel), `# ${d.title}\n${d.text}`)
    map.set(rel, i)
  })
  try {
    const r = selectByReference(dir, question, { corpus: [...map.keys()] })
    return { indices: r.candidates.map((c) => map.get(c.rel)).filter((x) => x !== undefined), method: r.method, size: r.candidates.length }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// gold section indices for Qasper (section carrying a gold evidence paragraph)
function goldSections(secs, evidence) {
  const g = new Set()
  for (let i = 0; i < secs.length; i++) {
    const t = flat(secs[i].text)
    for (const ev of evidence) {
      const e = flat(ev); if (!e) continue
      const probe = e.length > 120 ? e.slice(0, 120) : e
      if (t.includes(probe) || (e.length > 40 && e.includes(t.slice(0, Math.min(t.length, 120))))) { g.add(i); break }
    }
  }
  return g
}

async function main() {
  const items = DATASET === 'qasper'
    ? (await qasperQuestions(100)).slice(0, N).map((q) => ({
        question: q.question,
        docs: q.doc.map((s) => ({ title: s.section, text: s.text })),
        gold: goldSections(q.doc, q.evidence),
      }))
    : (await hotpotRows(N)).map((row) => ({
        question: row.question,
        docs: row.context.title.map((t, i) => ({ title: t, text: (row.context.sentences[i] ?? []).join(' ') })),
        gold: new Set([...new Set(row.supporting_facts.title.map((t) => t.toLowerCase()))].map((t) => row.context.title.findIndex((x) => x.toLowerCase() === t)).filter((i) => i >= 0)),
      }))

  const arms = { selector: [], hybrid5: [], hybrid6: [] }
  const methods = { reference: 0, fallback: 0 }
  const sizes = []
  console.log(`selectarm: ${DATASET}, ${items.length} items`)
  for (let n = 0; n < items.length; n++) {
    const { question, docs, gold } = items[n]
    const sel = runSelector(docs, question)
    methods[sel.method] = (methods[sel.method] ?? 0) + 1
    sizes.push(sel.size)
    const hy = await hybridRank(docs.map((d) => `${d.title} ${d.text}`), question)
    const hit = (order, k) => [...gold].every((gi) => order.slice(0, k).includes(gi))
    arms.selector.push([...gold].length && [...gold].every((gi) => sel.indices.includes(gi)) ? 1 : 0)
    arms.hybrid5.push(hit(hy, 5) ? 1 : 0)
    arms.hybrid6.push(hit(hy, 6) ? 1 : 0)
    if (n % 5 === 0) process.stdout.write(`  ${n + 1}/${items.length}\r`)
  }
  process.stdout.write('\n')
  // selector "both-gold in window" = all gold in the returned set (order-independent already above)
  const pct = (a) => ((mean(a)) * 100).toFixed(1)
  const md = [
    `# selectByReference as a retrieval arm — ${DATASET} (${items.length} items)`, '',
    'Both-gold recall: the window contains **all** gold evidence docs.',
    '',
    '| arm | both-gold recall | window |',
    '|---|---|---|',
    `| **selector (` + '`selectByReference`' + `)** | **${pct(arms.selector)}%** | returned ${mean(sizes).toFixed(1)} (cap 6) |`,
    `| hybrid top-5 | ${pct(arms.hybrid5)}% | 5 |`,
    `| hybrid top-6 | ${pct(arms.hybrid6)}% | 6 |`,
    '',
    `selector method: reference ${methods.reference ?? 0} · fallback ${methods.fallback ?? 0}`,
  ].join('\n')
  writeFileSync(join(RESULTS, `selectarm-${DATASET}-${N}.md`), md)
  process.stdout.write(md + '\n')
}
main()
