import { readFileSync } from 'node:fs'
import { verify } from '../kit/lib/receipts/gate.mjs'
import { parseAnswer } from '../kit/lib/receipts/text.mjs'
import { score } from './lib/arm-score.mjs'

const CORPUS = 'bench/corpus/ooh-v1'
const ITEMS = new Map(
  readFileSync('bench/ooh-pilot-v2.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => {
    const item = JSON.parse(l)
    return [item.id, item]
  }),
)

const R = 'bench/results'
const FILES = {
  '4B qwen3.5': {
    A: `${R}/arm-compare-qwen35-4b-aq-pilot-v2.jsonl`,
    Q: `${R}/arm-compare-qwen35-4b-aq-pilot-v2.jsonl`,
    D: `${R}/arm-compare-qwen35-4b-absence-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-qwen35-4b-absence-pilot-v2.jsonl`,
  },
  'Sonnet 5.5': {
    A: `${R}/arm-compare-sonnet55-a-pilot-v2.jsonl`,
    Q: `${R}/arm-compare-sonnet55-citation-pilot-v2.jsonl`,
    D: `${R}/arm-compare-sonnet55-absence2-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-sonnet55-absence2-pilot-v2.jsonl`,
  },
  'GLM-5.3': {
    A: `${R}/arm-compare-glm53-aq-pilot-v2.jsonl`,
    Q: `${R}/arm-compare-glm53-aq-pilot-v2.jsonl`,
    D: `${R}/arm-compare-glm53-absence-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-glm53-absence-pilot-v2.jsonl`,
  },
  'GLM-5.3-Flash': {
    A: `${R}/arm-compare-glm53flash-aq-pilot-v2.jsonl`,
    Q: `${R}/arm-compare-glm53flash-aq-pilot-v2.jsonl`,
    D: `${R}/arm-compare-glm53flash-absence-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-glm53flash-absence-pilot-v2.jsonl`,
  },
  'DeepSeek V4.1 Flash': {
    A: `${R}/arm-compare-flash-pilot-v2.jsonl`,
    Q: `${R}/arm-compare-flash-citation-pilot-v2.jsonl`,
    D: `${R}/arm-compare-flash-absence2-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-flash-absence2-pilot-v2.jsonl`,
  },
}

const LOCAL = {
  '27B qwen3.8 (local)': {
    Q: `${R}/arm-compare-qwen38-27b-qd-pilot-v2.jsonl`,
    D: `${R}/arm-compare-qwen38-27b-qd-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-qwen38-27b-da-pilot-v2.jsonl`,
  },
}

function rescore(r) {
  if (!['D', 'DA'].includes(r.arm) || !r.receipt) return r
  const item = ITEMS.get(r.id)
  if (!item) return r
  const gateItem = { id: r.id, question: item.question, not_found: r.gate?.abstained ?? false }
  const gate = verify(gateItem, r.receipt, CORPUS, { citations: r.citations ?? [] })
  const text = gate.mechanicalPass
    ? (parseAnswer(r.receipt).proposed || r.receipt)
    : 'NOT FOUND (gate rejected: ' + gate.why + ')'
  return { ...r, text, gate, ...score(item, text) }
}

function rows(file, arm) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.arm === arm).map(rescore)
}

function stats(list) {
  const n = list.length
  const count = (fn) => list.filter(fn).length
  const sum = (fn) => list.reduce((a, r) => a + (Number(fn(r)) || 0), 0)
  const ms = list.map((r) => Number(r.ms) || 0).sort((a, b) => a - b)
  const costs = list.map((r) => r.cost ?? r.usage?.cost).filter((c) => typeof c === 'number')
  const citations = list.filter((r) => r.shown).map((r) => {
    const cites = Array.isArray(r.citations) ? r.citations : null
    if ((r.arm === 'D' || r.arm === 'DA') && cites?.length) {
      return { quotes: cites.length, exact: cites.filter((c) => c.exact).length, coverage: r.citationShown?.coverage }
    }
    return r.citationShown
  }).filter(Boolean)
  const required = citations.reduce((a, c) => a + (c.coverage?.required ?? 0), 0)
  const covered = citations.reduce((a, c) => a + (c.coverage?.covered ?? 0), 0)
  const quotes = citations.reduce((a, c) => a + (c.quotes ?? 0), 0)
  const exact = citations.reduce((a, c) => a + (c.exact ?? 0), 0)
  const cited = citations.length
  const complete = citations.filter((c) => c.coverage?.complete).length
  return {
    n,
    answerable: count((r) => r.condition === 'answerable' && r.correct),
    answerableN: count((r) => r.condition === 'answerable'),
    total: count((r) => r.correct),
    partial: count((r) => r.condition === 'partial' && r.correct),
    partialN: count((r) => r.condition === 'partial'),
    unanswerable: count((r) => r.condition === 'unanswerable' && r.correct),
    unanswerableN: count((r) => r.condition === 'unanswerable'),
    wrong: count((r) => r.falseAccept),
    shown: count((r) => r.shown),
    required,
    covered,
    cited,
    complete,
    quotes,
    exact,
    tokens: n ? sum((r) => r.tokens) / n : 0,
    latency: ms.length ? ms[Math.floor(ms.length / 2)] / 1000 : 0,
    cost: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    costN: costs.length,
  }
}

const pct = (k, n) => (n ? `${Math.round((100 * k) / n)}%` : '—')
const cite = (k, n) => (n ? `${k}/${n} (${pct(k, n)})` : '—')
const money = (x) => (x == null ? '—' : `$${x.toFixed(4)}`)
const total = (x) => (x == null ? '—' : `$${x.toFixed(2)}`)

function table(reader, arm, s) {
  return `| ${reader} | ${arm} | ${s.answerable}/${s.answerableN} | ${s.partial}/${s.partialN} | ${s.unanswerable}/${s.unanswerableN} | ${s.wrong}/${s.n} | ${s.shown}/${s.n} | ${cite(s.complete, s.cited)} | ${cite(s.exact, s.quotes)} |`
}

console.log('## Quality (pilot-v2, 3 seeds, 60 rows/arm)\n')
console.log('| Reader | Arm | Answerable | Partial | Unanswerable | Wrong shown | Shown | Citation coverage | Exact |')
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
for (const reader of Object.keys(FILES)) {
  for (const arm of ['A', 'Q', 'DA']) {
    console.log(table(reader, arm, stats(rows(FILES[reader][arm], arm))))
  }
}

console.log('\n## Operations (median latency; provider-metered cost)\n')
console.log('| Reader | Arm | tok/q | s/q | $/q | $/60 |')
console.log('|---|---|---:|---:|---:|---:|')
for (const reader of Object.keys(FILES)) {
  for (const arm of ['A', 'Q', 'DA']) {
    const s = stats(rows(FILES[reader][arm], arm))
    const local = s.cost == null
    console.log(`| ${reader} | ${arm} | ${Math.round(s.tokens)} | ${s.latency.toFixed(1)} | ${local ? '0*' : money(s.cost / s.n)} | ${local ? '0*' : total(s.cost)} |`)
  }
}

console.log('\n## D footnote — gate only (pilot-v2, 3 seeds, 60 rows/arm)\n')
console.log('| Reader | Answerable | Partial | Unanswerable | Wrong shown | Shown | Citation coverage | Exact | tok/q | s/q | $/60 |')
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for (const reader of Object.keys(FILES)) {
  const s = stats(rows(FILES[reader].D, 'D'))
  const local = s.cost == null
  console.log(`| ${reader} | ${s.answerable}/${s.answerableN} | ${s.partial}/${s.partialN} | ${s.unanswerable}/${s.unanswerableN} | ${s.wrong}/${s.n} | ${s.shown}/${s.n} | ${cite(s.complete, s.cited)} | ${cite(s.exact, s.quotes)} | ${Math.round(s.tokens)} | ${s.latency.toFixed(1)} | ${local ? '0*' : total(s.cost)} |`)
}
console.log('\n## Local 27B (pilot-v2, 3 seeds, 60 rows/arm)\n')
console.log('| Reader | Arm | Answerable | Partial | Unanswerable | Total | Wrong shown | Shown | Citation coverage | Exact | tok/q | s/q | $/60 |')
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for (const reader of Object.keys(LOCAL)) {
  for (const arm of ['Q', 'D', 'DA']) {
    const s = stats(rows(LOCAL[reader][arm], arm))
    const local = s.cost == null
    const label = arm === 'D' ? 'D (gate-only)' : arm === 'DA' ? 'DA (current)' : 'Q'
    console.log(`| ${reader} | ${label} | ${s.answerable}/${s.answerableN} | ${s.partial}/${s.partialN} | ${s.unanswerable}/${s.unanswerableN} | ${s.total}/60 | ${s.wrong}/${s.n} | ${s.shown}/${s.n} | ${cite(s.complete, s.cited)} | ${cite(s.exact, s.quotes)} | ${Math.round(s.tokens)} | ${s.latency.toFixed(1)} | ${local ? '0*' : total(s.cost)} |`)
  }
}

const RANKED = []
for (const reader of Object.keys(FILES)) {
  for (const arm of ['A', 'Q', 'DA', 'D']) {
    RANKED.push({ reader, arm: arm === 'D' ? 'D*' : arm, s: stats(rows(FILES[reader][arm], arm)) })
  }
}
for (const reader of Object.keys(LOCAL)) {
  for (const arm of ['Q', 'D', 'DA']) {
    RANKED.push({ reader, arm: arm === 'D' ? 'D*' : arm, s: stats(rows(LOCAL[reader][arm], arm)) })
  }
}
RANKED.sort((a, b) => b.s.total - a.s.total
  || a.s.wrong - b.s.wrong
  || (b.s.complete / Math.max(1, b.s.cited)) - (a.s.complete / Math.max(1, a.s.cited))
  || (b.s.exact / Math.max(1, b.s.quotes)) - (a.s.exact / Math.max(1, a.s.quotes))
  || a.reader.localeCompare(b.reader) || a.arm.localeCompare(b.arm))

console.log('\n## Ranked — all arms (quality, pilot-v2, 3 seeds)\n')
console.log('Ranking: total correct, then fewer false accepts, then citation coverage, then exact. `D*` = gate-only ablation; 27B rows local.\n')
console.log('| # | Reader | Arm | Ans | Part | Unans | Total | Wrong | Shown | Cov | Exact |')
console.log('|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
RANKED.forEach((e, i) => {
  const s = e.s
  console.log(`| ${i + 1} | ${e.reader} | ${e.arm} | ${s.answerable}/${s.answerableN} | ${s.partial}/${s.partialN} | ${s.unanswerable}/${s.unanswerableN} | ${s.total}/60 | ${s.wrong}/${s.n} | ${s.shown}/${s.n} | ${cite(s.complete, s.cited)} | ${cite(s.exact, s.quotes)} |`)
})

console.log('\n## Ranked — all arms (operations, median latency; API cost)\n')
console.log('| # | Reader | Arm | tok/q | s/q | $/q | $/60 |')
console.log('|---:|---|---|---:|---:|---:|---:|')
RANKED.forEach((e, i) => {
  const s = e.s
  const local = s.cost == null
  console.log(`| ${i + 1} | ${e.reader} | ${e.arm} | ${Math.round(s.tokens)} | ${s.latency.toFixed(1)} | ${local ? '0*' : money(s.cost / s.n)} | ${local ? '0*' : total(s.cost)} |`)
})

console.log('\n* local reader: API cost 0; hardware/electricity not included.')
