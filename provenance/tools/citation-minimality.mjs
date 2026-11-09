#!/usr/bin/env node
// Citation minimality audit on answerable, answered rail rows. No model calls.
// Question: how much of the raw quote is actually needed to support the gold?
//
//   node bench/citation-minimality.mjs
//
// "best sentence" = the single quote sentence covering the most gold tokens.
// "minimal set" = greedy sentences until >=90% of the gold tokens are covered.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CELLS = {
  squad: { items: 'data/abstentionbench-items.jsonl', arms: 'data/abstentionbench-arms.jsonl' },
  musique: { items: 'data/abstentionbench-items-musique.jsonl', arms: 'data/abstentionbench-arms-musique.jsonl' }
}
const STOP = new Set('a an the and or but if then than that this these those of for to in on at by with from as is are was were be been being it its their his her they he she we you i not no do does did can could may might will would should about into over under which who whom whose what when where why how all any some more most other such only own same so too very s t don now'.split(' '))
const words = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
const content = (s) => words(s).filter((w) => !STOP.has(w))
const lines = (p) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const fmt = (x) => x.toFixed(0)
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-')

function sentences (quote) {
  return String(quote).replace(/\s*\|\s*/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 3)
}

function analyse (quote, refs) {
  const target = new Set(content(refs.join(' ')))
  if (!target.size) return null
  const raw = sentences(quote)
  if (!raw.length) return null
  const seen = new Set()
  const uniq = []
  for (const s of raw) {
    const key = s.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!seen.has(key)) { seen.add(key); uniq.push(s) }
  }
  const scored = uniq.map((s) => {
    const t = new Set(content(s))
    const hit = [...target].filter((w) => t.has(w)).length
    return { s, words: s.split(/\s+/).length, hit, cov: hit / target.size }
  })
  const best = scored.slice().sort((a, b) => (b.cov - a.cov) || (a.words - b.words))[0]
  const covered = new Set()
  const chosen = []
  while (covered.size / target.size < 0.9) {
    let pick = null
    let gain = 0
    for (const x of scored) {
      if (chosen.includes(x.s)) continue
      const t = new Set(content(x.s))
      const g = [...target].filter((w) => t.has(w) && !covered.has(w)).length
      if (g > gain) { gain = g; pick = x }
    }
    if (!pick || gain === 0) break
    chosen.push(pick.s)
    for (const w of target) if (new Set(content(pick.s)).has(w)) covered.add(w)
  }
  const quoteWords = String(quote).split(/\s+/).length
  const dedupWords = uniq.reduce((a, s) => a + s.split(/\s+/).length, 0)
  const minWords = chosen.reduce((a, s) => a + s.split(/\s+/).length, 0)
  return {
    quoteWords,
    bestWords: best.words,
    bestCov: best.cov,
    dupSentences: raw.length - uniq.length,
    dedupWords,
    minWords,
    minCov: target.size ? covered.size / target.size : 0
  }
}

console.log('| cell | answerable answered | avg quote words | avg best sentence words | best / quote | avg best coverage | best ≥ 0.8 | dup sentences | avg dedup words | avg minimal-set words | minimal ≥ 0.9 |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|')
for (const [cell, cfg] of Object.entries(CELLS)) {
  const items = new Map(lines(join(ROOT, cfg.items)).map((l) => { const x = JSON.parse(l); return [x.id, x] }))
  const rows = lines(join(ROOT, cfg.arms)).map((l) => JSON.parse(l))
  const rs = rows.filter((r) => r.arm === 'rail' && !r.reader_abstained && r.state !== 'error' && !items.get(r.id).should_abstain && r.quote)
  const ms = []
  for (const r of rs) {
    const m = analyse(r.quote, items.get(r.id).reference_answers ?? [])
    if (m) ms.push(m)
  }
  const q = avg(ms.map((m) => m.quoteWords))
  const b = avg(ms.map((m) => m.bestWords))
  console.log(`| ${cell} | ${ms.length} | ${fmt(q)} | ${fmt(b)} | ${q ? (100 * b / q).toFixed(1) + '%' : '-'} | ${ms.length ? (100 * avg(ms.map((m) => m.bestCov))).toFixed(1) + '%' : '-'} | ${pct(ms.filter((m) => m.bestCov >= 0.8).length, ms.length)} | ${fmt(avg(ms.map((m) => m.dupSentences)))} | ${fmt(avg(ms.map((m) => m.dedupWords)))} | ${fmt(avg(ms.map((m) => m.minWords)))} | ${pct(ms.filter((m) => m.minCov >= 0.9).length, ms.length)} |`)
}
