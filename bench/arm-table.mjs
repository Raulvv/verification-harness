import { readFileSync } from 'node:fs'

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
  'DeepSeek V4.1 Flash': {
    A: `${R}/arm-compare-flash-pilot-v2.jsonl`,
    Q: `${R}/arm-compare-flash-citation-pilot-v2.jsonl`,
    D: `${R}/arm-compare-flash-absence2-pilot-v2.jsonl`,
    DA: `${R}/arm-compare-flash-absence2-pilot-v2.jsonl`,
  },
}

function rows(file, arm) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.arm === arm)
}

function stats(list) {
  const n = list.length
  const count = (fn) => list.filter(fn).length
  const sum = (fn) => list.reduce((a, r) => a + (Number(fn(r)) || 0), 0)
  const ms = list.map((r) => Number(r.ms) || 0).sort((a, b) => a - b)
  const costs = list.map((r) => r.cost ?? r.usage?.cost).filter((c) => typeof c === 'number')
  const citations = list.filter((r) => r.shown && r.citationShown).map((r) => r.citationShown)
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
console.log('\n* local reader: API cost 0; hardware/electricity not included.')
