#!/usr/bin/env node
// Aggregate spike: deterministic aggregation + complete candidate receipt.
// Table mode uses ooh-data.json; PAGES=1 parses all 48 corpus pages.
// DEV=1 runs the public dev aggregation set; otherwise the two private globals.
//
//   node bench/ooh-aggregate-spike.mjs
//   PAGES=1 node bench/ooh-aggregate-spike.mjs
//   DEV=1 node bench/ooh-aggregate-spike.mjs
//   DEV=1 PAGES=1 node bench/ooh-aggregate-spike.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { askAggregate } from '../kit/lib/answer/aggregate.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = process.env.DATA ?? join(ROOT, 'bench/ooh-data.json')
const TEST = process.env.TEST ?? join(ROOT, 'bench/results/ooh-test-private.jsonl')
const DEV_FILE = process.env.DEV_FILE ?? join(ROOT, 'bench/ooh-dev-aggregation.jsonl')
const CORPUS = join(ROOT, 'bench/corpus/ooh-v1')
const PAGES = process.env.PAGES === '1'
const DEV = process.env.DEV === '1'
const OUT = process.env.OUT ?? join(ROOT, `bench/results/ooh-${PAGES ? 'pages' : 'table'}-deepseek-aggregate-${DEV ? 'dev' : 'globals'}.jsonl`)
const money = (n) => '$' + Number(n).toLocaleString('en-US')

function tableRows() {
  const data = JSON.parse(readFileSync(DATA, 'utf8'))
  return {
    rows: data.map((x) => ({
      title: x.title,
      slug: x.slug,
      annual: Number.isFinite(x.annual) ? x.annual : null,
      outlook_pct: x.outlook_pct,
      jobs: x.jobs,
      change: x.change,
      jobs2033: x.jobs + x.change,
      annual_openings: x.annual_openings,
      education: x.education,
      payQuote: x.quick_facts['2023 Median Pay'],
      growthQuote: x.quick_facts['Job Outlook, 2023-33'],
      jobsQuote: x.quick_facts['Number of Jobs, 2023'],
      changeQuote: x.quick_facts['Employment Change, 2023-33'],
      educationQuote: x.quick_facts['Typical Entry-Level Education']
    })),
    meta: { source: 'table', pages: null, parsed: data.length }
  }
}

function pageRows() {
  const files = readdirSync(CORPUS).filter((f) => f.endsWith('.md') && f !== 'SOURCE.md')
  const rows = []
  for (const f of files) {
    const text = readFileSync(join(CORPUS, f), 'utf8')
    const line = (prefix) => text.split('\n').find((l) => l.startsWith(prefix))
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const payLine = line('2023 Median Pay')
    const growthLine = line('Job Outlook, 2023-33 |')
    const jobsLine = line('Number of Jobs, 2023 |')
    const changeLine = line('Employment Change, 2023-33 |')
    const educationLine = line('Typical Entry-Level Education |')
    if (!title || !payLine || !growthLine || !jobsLine || !changeLine || !educationLine) {
      throw new Error(`parse failure: ${f}`)
    }
    const pay = payLine.match(/\$([\d,]+)\s+per year/)
    const growth = growthLine.match(/(-?\d+(?:\.\d+)?)%/)
    const jobs = jobsLine.split('|').pop().match(/-?[\d,]+/)
    const change = changeLine.split('|').pop().match(/-?[\d,]+/)
    if (!growth || !jobs || !change) throw new Error(`number parse failure: ${f}`)
    const n = (v) => Number(String(v).replace(/[^0-9.-]/g, ''))
    rows.push({
      title,
      slug: f.replace(/\.md$/, ''),
      annual: pay ? n(pay[1]) : null,
      outlook_pct: n(growth[1]),
      jobs: n(jobs[0]),
      change: n(change[0]),
      jobs2033: n(jobs[0]) + n(change[0]),
      annual_openings: null,
      education: educationLine.split('|').slice(1).join('|').trim(),
      payQuote: payLine,
      growthQuote: growthLine,
      jobsQuote: jobsLine,
      changeQuote: changeLine,
      educationQuote: educationLine
    })
  }
  return { rows, meta: { source: 'pages', pages: files.length, parsed: rows.length } }
}

const source = PAGES ? pageRows() : tableRows()
const paid = source.rows.filter((x) => Number.isFinite(x.annual))
if (source.rows.length !== 48) throw new Error(`expected 48 source rows, got ${source.rows.length}`)
if (paid.length !== 46) throw new Error(`expected 46 paid rows, got ${paid.length}`)
if (PAGES && source.meta.pages !== 48) throw new Error(`expected 48 pages, got ${source.meta.pages}`)

const specFromQuestion = (q) => {
  const m = q.match(/grow(?:th)?\s+faster\s+than\s+(\d+(?:\.\d+)?)\s*%/i)
  return { candidateSet: 'paid', op: 'max', field: 'annual', filter: m ? { field: 'outlook_pct', op: '>', value: Number(m[1]) } : null }
}
const items = DEV
  ? readFileSync(DEV_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  : readFileSync(TEST, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((t) => t.global).map((t) => ({ ...t, spec: specFromQuestion(t.question) }))

const fmt = (field, v) => field === 'outlook_pct' ? `${v}%` : (field === 'education' ? String(v) : money(v))
const baseFor = (spec) => {
  if (spec.candidateSet === 'all') return source.rows
  if (spec.candidateSet === 'paid') return paid
  if (spec.candidateSet === 'select') {
    return spec.select.map((title) => {
      const row = source.rows.find((x) => x.title === title)
      if (!row) throw new Error(`selected title missing: ${title}`)
      return row
    })
  }
  throw new Error(`bad candidateSet ${spec.candidateSet}`)
}
const out = []

for (const t of items) {
  const spec = t.spec
  const base = baseFor(spec)
  const expected = spec.candidateSet === 'paid' ? paid.length : spec.candidateSet === 'all' ? source.rows.length : spec.select.length
  const result = askAggregate({
    expected,
    rows: base,
    spec,
    question: t.question,
    formatField: fmt,
    receiptLine: (x) =>
      `${x.title} | pay ${x.annual == null ? 'N/A' : money(x.annual)} | growth ${x.outlook_pct}% | 2033 jobs ${money(x.jobs2033)} | ${x.qualifies ? 'qualifies' : 'excluded'}`,
    legsFor: (x, sp) => {
      const legs = [
        { title: x.title, doc: x.slug + '.md', kind: 'pay', quote: x.payQuote },
        { title: x.title, doc: x.slug + '.md', kind: 'growth', quote: x.growthQuote }
      ]
      if (sp.op === 'sum' && sp.field === 'jobs2033') {
        legs.push({ title: x.title, doc: x.slug + '.md', kind: 'jobs', quote: x.jobsQuote })
        legs.push({ title: x.title, doc: x.slug + '.md', kind: 'change', quote: x.changeQuote })
      }
      return legs
    }
  })
  const winner = result.aggregate.winner
  const value = result.aggregate.value
  if (t.gold?.winner && winner !== t.gold.winner) throw new Error(`${t.id}: winner ${winner} != gold ${t.gold.winner}`)
  if (t.gold?.value !== undefined && Number(value) !== Number(t.gold.value)) throw new Error(`${t.id}: value ${value} != gold ${t.gold.value}`)
  const f = result.aggregate.filter
  const filterText = f ? `${f.field} ${f.op} ${f.value}` : 'none'
  out.push({
    id: t.id,
    condition: t.condition ?? 'answerable',
    global: t.global === true,
    question: t.question,
    gold: t.gold,
    answer: result.answer,
    notFound: false,
    abstained: false,
    model: 'none (deterministic)',
    arm: 'aggregate',
    proxy: false,
    mode: `aggregate-${source.meta.source}${DEV ? '-dev' : ''}`,
    window: null,
    coverage: {
      source: source.meta.source,
      pages: source.meta.pages,
      parsed: source.meta.parsed,
      paid: paid.length,
      candidates: result.coverage.candidates,
      expected: result.coverage.expected,
      complete: result.coverage.complete
    },
    aggregate: { ...result.aggregate, filter: filterText },
    citation_breadth: result.citation_breadth,
    quote: result.quote,
    legs: result.legs,
    final: result.final.text,
    tokens: 0,
    seconds: 0
  })
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, out.map((x) => JSON.stringify(x)).join('\n') + '\n')
for (const x of out) console.log(`${x.id} ${x.answer} | candidates ${x.coverage.candidates}/${x.coverage.expected} | ${x.aggregate.op} ${x.aggregate.filter} | winner ${x.aggregate.winner ?? '-'}`)
console.log(`wrote ${out.length} rows -> ${OUT}`)
