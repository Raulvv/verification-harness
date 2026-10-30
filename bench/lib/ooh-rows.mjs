import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const money = (n) => '$' + Number(n).toLocaleString('en-US')

const num = (v) => Number(String(v).replace(/[^0-9.-]/g, ''))
const fieldLine = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix))
const openingsFrom = (text) => {
  const m = text.match(/\babout\s+([\d,]+)\s+openings\b/i)
  if (!m) return { annual_openings: null, annualOpeningsQuote: null }
  const quote = text.split('\n').find((l) => l.includes(m[1]) && /\bopenings\b/i.test(l)) ?? m[0]
  return { annual_openings: num(m[1]), annualOpeningsQuote: quote.trim() }
}

export function tableRows(dataPath = 'bench/ooh-data.json') {
  const data = JSON.parse(readFileSync(resolve(dataPath), 'utf8'))
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
      educationQuote: x.quick_facts['Typical Entry-Level Education'],
      annualOpeningsQuote: x.quick_facts.openings,
    })),
    meta: { source: 'table', pages: null, parsed: data.length },
  }
}

export function pageRows(corpusRoot = 'bench/corpus/ooh-v1') {
  const root = resolve(corpusRoot)
  const files = readdirSync(root).filter((f) => f.endsWith('.md') && f !== 'SOURCE.md')
  const rows = []
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8')
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const payLine = fieldLine(text, '2023 Median Pay')
    const growthLine = fieldLine(text, 'Job Outlook, 2023-33 |')
    const jobsLine = fieldLine(text, 'Number of Jobs, 2023 |')
    const changeLine = fieldLine(text, 'Employment Change, 2023-33 |')
    const educationLine = fieldLine(text, 'Typical Entry-Level Education |')
    if (!title || !payLine || !growthLine || !jobsLine || !changeLine || !educationLine) {
      throw new Error(`parse failure: ${f}`)
    }
    const pay = payLine.match(/\$([\d,]+)\s+per year/)
    const growth = growthLine.match(/(-?\d+(?:\.\d+)?)%/)
    const jobs = jobsLine.split('|').pop().match(/-?[\d,]+/)
    const change = changeLine.split('|').pop().match(/-?[\d,]+/)
    if (!growth || !jobs || !change) throw new Error(`number parse failure: ${f}`)
    rows.push({
      title,
      slug: f.replace(/\.md$/, ''),
      annual: pay ? num(pay[1]) : null,
      outlook_pct: num(growth[1]),
      jobs: num(jobs[0]),
      change: num(change[0]),
      jobs2033: num(jobs[0]) + num(change[0]),
      ...openingsFrom(text),
      education: educationLine.split('|').slice(1).join('|').trim(),
      payQuote: payLine,
      growthQuote: growthLine,
      jobsQuote: jobsLine,
      changeQuote: changeLine,
      educationQuote: educationLine,
    })
  }
  return { rows, meta: { source: 'pages', pages: files.length, parsed: rows.length } }
}

export function loadRows({ source = 'table', dataPath = 'bench/ooh-data.json', corpusRoot = 'bench/corpus/ooh-v1' } = {}) {
  const loaded = source === 'pages' ? pageRows(corpusRoot) : tableRows(dataPath)
  const paid = loaded.rows.filter((x) => Number.isFinite(x.annual))
  if (loaded.rows.length !== 48) throw new Error(`expected 48 source rows, got ${loaded.rows.length}`)
  if (paid.length !== 46) throw new Error(`expected 46 paid rows, got ${paid.length}`)
  if (source === 'pages' && loaded.meta.pages !== 48) throw new Error(`expected 48 pages, got ${loaded.meta.pages}`)
  return { ...loaded, paid }
}

export const isGlobalItem = (item) => {
  const notes = String(item?.notes ?? '')
  const formula = String(item?.formula ?? '')
  return item?.global === true || /global|aggregat/i.test(notes) || /^max\(|^filter\(/i.test(formula)
}

export const globalSpec = (question) => {
  const m = String(question).match(/grow(?:th)?\s+faster\s+than\s+(\d+(?:\.\d+)?)\s*%/i)
  return {
    candidateSet: 'paid',
    op: 'max',
    field: 'annual',
    filter: m ? { field: 'outlook_pct', op: '>', value: Number(m[1]) } : null,
  }
}

export const baseFor = ({ rows, paid }, spec) => {
  if (spec.candidateSet === 'all') return rows
  if (spec.candidateSet === 'paid') return paid
  if (spec.candidateSet === 'select') {
    return spec.select.map((title) => {
      const row = rows.find((x) => x.title === title)
      if (!row) throw new Error(`selected title missing: ${title}`)
      return row
    })
  }
  throw new Error(`bad candidateSet ${spec.candidateSet}`)
}

export const expectedFor = ({ rows, paid }, spec) =>
  spec.candidateSet === 'paid' ? paid.length : spec.candidateSet === 'all' ? rows.length : spec.select.length

export const formatField = (field, v) =>
  field === 'outlook_pct' ? `${v}%` : field === 'education' ? String(v) : money(v)

export const receiptLine = (x) =>
  `${x.title} | pay ${x.annual == null ? 'N/A' : money(x.annual)} | growth ${x.outlook_pct}% | 2033 jobs ${money(x.jobs2033)} | ${x.qualifies ? 'qualifies' : 'excluded'}`

export const legsFor = (x, sp) => {
  const legs = [
    { title: x.title, doc: x.slug + '.md', kind: 'pay', quote: x.payQuote },
    { title: x.title, doc: x.slug + '.md', kind: 'growth', quote: x.growthQuote },
  ]
  if (sp.op === 'sum' && sp.field === 'jobs2033') {
    legs.push({ title: x.title, doc: x.slug + '.md', kind: 'jobs', quote: x.jobsQuote })
    legs.push({ title: x.title, doc: x.slug + '.md', kind: 'change', quote: x.changeQuote })
  }
  return legs
}
