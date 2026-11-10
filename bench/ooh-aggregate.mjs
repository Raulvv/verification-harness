#!/usr/bin/env node
// Aggregate spike: deterministic aggregation + complete candidate receipt.
// Table mode uses ooh-data.json; PAGES=1 parses all 48 corpus pages.
// DEV=1 runs the public dev aggregation set; otherwise the two private globals.
//
//   node bench/ooh-aggregate-spike.mjs
//   PAGES=1 node bench/ooh-aggregate-spike.mjs
//   DEV=1 node bench/ooh-aggregate-spike.mjs
//   DEV=1 PAGES=1 node bench/ooh-aggregate-spike.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { askAggregate } from '../kit/lib/answer/aggregate.mjs'
import { loadRows, globalSpec, baseFor, expectedFor, formatField, receiptLine, legsFor, isGlobalItem } from './lib/ooh-rows.mjs'
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
const source = loadRows({ source: PAGES ? 'pages' : 'table', dataPath: DATA, corpusRoot: CORPUS })
const paid = source.paid

const items = DEV
  ? readFileSync(DEV_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  : readFileSync(TEST, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter(isGlobalItem).map((t) => ({ ...t, spec: globalSpec(t.question) }))

const out = []

for (const t of items) {
  const spec = t.spec
  const base = baseFor(source, spec)
  const expected = expectedFor(source, spec)
  const result = askAggregate({
    expected,
    rows: base,
    spec,
    question: t.question,
    formatField,
    receiptLine,
    legsFor,
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
    global: isGlobalItem(t),
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
