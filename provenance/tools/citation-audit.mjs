#!/usr/bin/env node
// Deterministic citation/verbosity audit of the AbstentionBench cells.
// No model calls: reads the arm rows, the items, and the SQuAD 2.0 audit TSV.
//
//   node bench/citation-audit.mjs
//
// "Answer supported" = at least 70% of the answer's content words appear in
// the rail's quote. "Gold supported" = at least 80% of the benchmark reference
// (or SQuAD 2.0 plausible answer) appears in the quote. Quoted rows only.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CELLS = {
  squad: { suffix: '', items: 'data/abstentionbench-items.jsonl', arms: 'data/abstentionbench-arms.jsonl' },
  musique: { suffix: '-musique', items: 'data/abstentionbench-items-musique.jsonl', arms: 'data/abstentionbench-arms-musique.jsonl' }
}
const STOP = new Set('a an the and or but if then than that this these those of for to in on at by with from as is are was were be been being it its their his her they he she we you i not no do does did can could may might will would should about into over under which who whom whose what when where why how all any some more most other such only own same so too very s t don now'.split(' '))
const words = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
const content = (s) => words(s).filter((w) => !STOP.has(w))
const lines = (p) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-')
const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : '-')

const plausible = new Map()
for (const line of lines(join(ROOT, 'data/squad54-audit.tsv'))) {
  const f = line.split('\t')
  if (f[0] === 'idx') continue
  plausible.set(Number(f[0]), f[3].split(' | ').map((s) => s.trim()).filter(Boolean))
}

function metrics (rows, items) {
  const quoted = rows.filter((r) => r.quote)
  const segs = quoted.map((r) => String(r.quote).split(' | ').map((s) => s.trim()).filter(Boolean))
  const multi = segs.filter((s) => s.length > 1).length
  const dup = segs.filter((s) => s.length !== new Set(s).size).length
  let answerOk = 0
  let goldN = 0
  let goldOk = 0
  for (const r of quoted) {
    const ans = content(r.answer)
    const qt = new Set(content(r.quote))
    if (ans.length && ans.filter((w) => qt.has(w)).length / ans.length >= 0.7) answerOk++
    const it = items.get(r.id)
    const gold = !it.should_abstain
      ? (it.reference_answers ?? [])
      : (plausible.get(it.idx) ?? [])
    if (gold.length) {
      goldN++
      const gt = new Set(content(gold.join(' ')))
      if (gt.size && [...gt].filter((w) => qt.has(w)).length / gt.size >= 0.8) goldOk++
    }
  }
  return {
    n: rows.length,
    quoted: quoted.length,
    avgQuoteWords: avg(quoted.map((r) => String(r.quote).split(/\s+/).length)),
    multi,
    dup,
    avgAnswerWords: avg(rows.map((r) => String(r.answer ?? '').split(/\s+/).length)),
    answerOk,
    goldN,
    goldOk,
    unanchored: rows.filter((r) => (Array.isArray(r.unanchored) ? r.unanchored.length > 0 : !!r.unanchored)).length
  }
}

for (const subset of ['all', 'answerable']) {
  console.log(`\n## ${subset === 'all' ? 'Answered rows (all)' : 'Answered answerable rows'}`)
  console.log('| cell | arm | n | quote | avg quote words | multi-seg | dup rows | avg answer words | answer supported | gold supported | unanchored |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const [cell, cfg] of Object.entries(CELLS)) {
    const items = new Map(lines(join(ROOT, cfg.items)).map((l) => { const x = JSON.parse(l); return [x.id, x] }))
    const rows = lines(join(ROOT, cfg.arms)).map((l) => JSON.parse(l))
    for (const arm of ['rail', 'naive']) {
      const rs = rows.filter((r) => r.arm === arm && !r.reader_abstained && r.state !== 'error' && (subset === 'all' || !items.get(r.id).should_abstain))
      const m = metrics(rs, items)
      const hasQuote = m.quoted > 0
      console.log(`| ${cell} | ${arm} | ${m.n} | ${m.quoted}/${m.n} (${pct(m.quoted, m.n)}) | ${hasQuote ? m.avgQuoteWords : '-'} | ${hasQuote ? m.multi : '-'} | ${hasQuote ? m.dup : '-'} | ${m.avgAnswerWords} | ${hasQuote ? `${m.answerOk}/${m.quoted} (${pct(m.answerOk, m.quoted)})` : '-'} | ${hasQuote && m.goldN ? `${m.goldOk}/${m.goldN} (${pct(m.goldOk, m.goldN)})` : '-'} | ${m.unanchored} |`)
    }
  }
}
