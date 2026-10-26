// Table aggregation — deterministic reduce over an explicit candidate set.
// No model call: the caller supplies the rows; the reducer is authoritative.
const OPS = new Set(['max', 'min', 'sum', 'count'])
const CMP = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b
}

const defaultFormat = (field, v) => {
  if (typeof v === 'string') return v
  if (field.endsWith('pct') || field === 'pct') return `${v}%`
  return Number(v).toLocaleString('en-US')
}

const defaultLine = (r, spec, fmt) =>
  `${r.title} | ${spec.field}: ${fmt(r[spec.field])} | ${r.qualifies ? 'qualifies' : 'excluded'}`

const defaultLegs = (r) => r.quotes ?? (r.quote ? [{ title: r.title, doc: r.doc, quote: r.quote }] : [])

export function askAggregate({ rows, spec, question = '', expected, formatField, receiptLine, legsFor } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('aggregate: rows are required')
  if (!spec || !OPS.has(spec.op)) throw new Error('aggregate: spec.op must be max, min, sum or count')
  if (!spec.field) throw new Error('aggregate: spec.field is required')
  if (spec.filter && !CMP[spec.filter.op]) throw new Error(`aggregate: bad filter op ${spec.filter.op}`)

  let base = rows
  if (Array.isArray(spec.select)) {
    base = spec.select.map((title) => {
      const row = rows.find((r) => r.title === title)
      if (!row) throw new Error(`aggregate: selected title missing: ${title}`)
      return row
    })
  }
  const expectedCount = Number.isFinite(expected) ? Number(expected) : base.length
  if (base.length !== expectedCount) {
    const coverage = { candidates: base.length, expected: expectedCount, complete: false }
    const text = `Q: ${question || 'aggregate'}\nA: NOT FOUND — incomplete candidate set (${base.length}/${expectedCount})`
    return { question, answer: 'NOT FOUND', quote: '', legs: [], coverage, aggregate: { op: spec.op, field: spec.field, filter: spec.filter ?? null, candidates: base.length, qualifying: 0, winner: null, value: null }, citation_breadth: { cited: base.length, expected: expectedCount }, final: { text } }
  }
  const fmt = (v) => (formatField ? formatField(spec.field, v) : defaultFormat(spec.field, v))
  const filtered = base.map((r) => ({
    ...r,
    qualifies: spec.filter ? CMP[spec.filter.op](r[spec.filter.field], spec.filter.value) : true
  }))
  const qualifying = filtered.filter((r) => r.qualifies)
  let winner = null
  let value = null
  if (spec.op === 'max' || spec.op === 'min') {
    if (!qualifying.length) {
      const text = `Q: ${question || 'aggregate'}\nA: NOT FOUND`
      return { question, answer: 'NOT FOUND', quote: '', legs: [], coverage: { candidates: filtered.length, expected: base.length, complete: filtered.length === base.length }, aggregate: { op: spec.op, field: spec.field, filter: spec.filter ?? null, candidates: filtered.length, qualifying: 0, winner: null, value: null }, citation_breadth: { cited: filtered.length, expected: base.length }, final: { text } }
    }
    winner = qualifying.reduce((a, b) => (spec.op === 'max' ? (b[spec.field] > a[spec.field] ? b : a) : (b[spec.field] < a[spec.field] ? b : a)))
    value = winner[spec.field]
  } else if (spec.op === 'sum') {
    value = qualifying.reduce((s, r) => s + Number(r[spec.field] ?? 0), 0)
  } else {
    value = qualifying.length
  }

  const answer = spec.op === 'max' || spec.op === 'min'
    ? `${winner.title} — ${fmt(value)}`
    : spec.op === 'count' ? `${value}` : fmt(value)
  const quote = filtered.map((r) => (receiptLine ? receiptLine(r, spec, fmt) : defaultLine(r, spec, fmt))).join('\n')
  const legs = filtered.flatMap((r) => (legsFor ? legsFor(r, spec) : defaultLegs(r)))
  const coverage = { candidates: filtered.length, expected: expectedCount, complete: filtered.length === expectedCount }
  const aggregate = {
    op: spec.op,
    field: spec.field,
    filter: spec.filter ?? null,
    candidates: filtered.length,
    qualifying: qualifying.length,
    winner: winner?.title ?? null,
    value
  }
  const final = { text: `Q: ${question || 'aggregate'}\nA: ${answer}\n\nReceipt (${coverage.candidates}/${coverage.expected} candidates):\n${quote}` }
  return { question, answer, quote, legs, coverage, aggregate, citation_breadth: { cited: filtered.length, expected: expectedCount }, final }
}
