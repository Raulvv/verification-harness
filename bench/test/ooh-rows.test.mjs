import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askAggregate } from '../../kit/lib/answer/aggregate.mjs'
import {
  loadRows, isGlobalItem, globalSpec, baseFor, expectedFor,
  formatField, receiptLine, legsFor,
} from '../lib/ooh-rows.mjs'
import { windowDocs } from '../lib/doc-window.mjs'

const CORPUS = 'bench/corpus/ooh-v1'
const DATA = 'bench/ooh-data.json'
const TABLE = loadRows({ source: 'table', dataPath: DATA, corpusRoot: CORPUS })
const PAGES = loadRows({ source: 'pages', dataPath: DATA, corpusRoot: CORPUS })

test('ooh rows: table and page materialization both yield 48 rows and 46 paid', () => {
  for (const source of [TABLE, PAGES]) {
    assert.equal(source.rows.length, 48)
    assert.equal(source.paid.length, 46)
    assert.equal(source.rows.filter((r) => r.annual_openings == null).length, 0)
  }
  assert.equal(TABLE.rows.find((r) => r.title === 'Graphic Designers').annual_openings, 21100)
  assert.equal(PAGES.rows.find((r) => r.title === 'Graphic Designers').annual_openings, 21100)
})

test('doc window: full docs expose annual openings that the 6k slice drops', () => {
  const q = 'How many more annual openings does Graphic Designers have than Waiters and Waitresses?'
  const short = windowDocs(CORPUS, q, { k: 3, docChars: 6000 })
  const full = windowDocs(CORPUS, q, { k: 3, docChars: 20000 })
  assert.equal(short.some((d) => /21,100 openings/.test(d.content)), false)
  assert.equal(full.some((d) => /21,100 openings/.test(d.content)), true)
})

test('ooh rows: global questions are detected from labels and formula', () => {
  assert.equal(isGlobalItem({ notes: 'Global aggregation over 46 occupations.' }), true)
  assert.equal(isGlobalItem({ formula: 'filter(2023–33 growth > 4%) → max(2023 median annual pay)' }), true)
  assert.equal(isGlobalItem({ notes: 'Local page question.' }), false)
  assert.deepEqual(globalSpec('Among occupations projected to grow faster than 4% from 2023 to 2033, which has the highest median annual pay, and what is that pay?'), {
    candidateSet: 'paid', op: 'max', field: 'annual', filter: { field: 'outlook_pct', op: '>', value: 4 },
  })
})

test('ooh aggregate: table and page contexts agree on both global answers', () => {
  const qs = {
    'test-095': 'Among all 46 occupations in this snapshot that report a median annual pay, which has the highest median annual pay, and what is that pay?',
    'test-100': 'Among occupations projected to grow faster than 4% from 2023 to 2033, which has the highest median annual pay, and what is that pay?',
  }
  for (const source of [TABLE, PAGES]) {
    const results = {}
    for (const [id, question] of Object.entries(qs)) {
      const spec = globalSpec(question)
      const r = askAggregate({
        expected: expectedFor(source, spec),
        rows: baseFor(source, spec),
        spec,
        question,
        formatField,
        receiptLine,
        legsFor,
      })
      results[id] = r
      assert.equal(r.coverage.complete, true)
      assert.equal(r.coverage.candidates, 46)
    }
    assert.equal(results['test-095'].aggregate.winner, 'Physicians and Surgeons')
    assert.equal(results['test-095'].aggregate.value, 239200)
    assert.equal(results['test-100'].aggregate.winner, 'Airline and Commercial Pilots')
    assert.equal(results['test-100'].aggregate.value, 171210)
  }
})
