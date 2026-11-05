// Table aggregation — deterministic reduce over an explicit candidate set.
// No model call: the caller supplies the rows; the reducer is authoritative.
const OPS = new Set(['max', 'min', 'sum', 'count', 'topk', 'diff'])
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

// A spec may carry one `filter` (legacy) or many `filters`, ANDed together.
const filtersOf = (spec) => [
  ...(Array.isArray(spec.filters) ? spec.filters : []),
  ...(spec.filter ? [spec.filter] : [])
]

const signed = (v) => (v < 0 ? '−' : '')

export function askAggregate({ rows, spec, question = '', expected, formatField, receiptLine, legsFor } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('aggregate: rows are required')
  if (!spec || !OPS.has(spec.op)) throw new Error('aggregate: spec.op must be max, min, sum, count, topk or diff')
  if (!spec.field) throw new Error('aggregate: spec.field is required')
  const filters = filtersOf(spec)
  for (const f of filters) {
    if (!CMP[f.op]) throw new Error(`aggregate: bad filter op ${f.op}`)
    if (!f.field) throw new Error('aggregate: filter.field is required')
  }
  if (spec.op === 'topk' && !(Number.isInteger(spec.k) && spec.k > 0)) {
    throw new Error('aggregate: spec.k must be a positive integer for topk')
  }
  const order = spec.order ?? 'desc'
  if (!['asc', 'desc'].includes(order)) throw new Error(`aggregate: bad order ${order}`)
  if (spec.op === 'diff' && (!Array.isArray(spec.select) || spec.select.length !== 2)) {
    throw new Error('aggregate: diff needs exactly two selected titles')
  }

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
    return { question, answer: 'NOT FOUND', quote: '', legs: [], coverage, aggregate: { op: spec.op, field: spec.field, filter: spec.filter ?? null, filters, candidates: base.length, qualifying: 0, winner: null, value: null }, citation_breadth: { cited: base.length, expected: expectedCount }, final: { text } }
  }
  const fmt = (v) => (formatField ? formatField(spec.field, v) : defaultFormat(spec.field, v))
  const filtered = base.map((r) => ({
    ...r,
    qualifies: filters.every((f) => CMP[f.op](r[f.field], f.value))
  }))
  const qualifying = filtered.filter((r) => r.qualifies)
  const valued = qualifying.filter((r) => r[spec.field] != null && r[spec.field] !== '')
  let winner = null
  let value = null
  let ranked = null
  if (spec.op === 'max' || spec.op === 'min') {
    if (!valued.length) {
      const text = `Q: ${question || 'aggregate'}\nA: NOT FOUND`
      return { question, answer: 'NOT FOUND', quote: '', legs: [], coverage: { candidates: filtered.length, expected: base.length, complete: filtered.length === base.length }, aggregate: { op: spec.op, field: spec.field, filter: spec.filter ?? null, filters, candidates: filtered.length, qualifying: 0, winner: null, value: null }, citation_breadth: { cited: filtered.length, expected: base.length }, final: { text } }
    }
    winner = valued.reduce((a, b) => (spec.op === 'max' ? (b[spec.field] > a[spec.field] ? b : a) : (b[spec.field] < a[spec.field] ? b : a)))
    value = winner[spec.field]
  } else if (spec.op === 'topk') {
    const ordered = [...valued].sort((a, b) => (order === 'asc' ? a[spec.field] - b[spec.field] : b[spec.field] - a[spec.field]))
    if (ordered.length > spec.k && ordered[spec.k - 1][spec.field] === ordered[spec.k][spec.field]) {
      const text = `Q: ${question || 'aggregate'}\nA: NEEDS_SPECIFICATION — tie at the ${order === 'asc' ? 'bottom' : 'top'}-${spec.k} boundary (${fmt(ordered[spec.k - 1][spec.field])}); provide a tie-break rule`
      return { question, answer: 'NEEDS_SPECIFICATION', quote: '', legs: [], coverage: { candidates: filtered.length, expected: expectedCount, complete: true }, aggregate: { op: spec.op, field: spec.field, filter: spec.filter ?? null, filters, candidates: filtered.length, qualifying: qualifying.length, winner: null, value: null, tie: fmt(ordered[spec.k - 1][spec.field]) }, citation_breadth: { cited: filtered.length, expected: expectedCount }, final: { text } }
    }
    ranked = ordered.slice(0, spec.k)
  } else if (spec.op === 'sum') {
    value = qualifying.reduce((s, r) => s + Number(r[spec.field] ?? 0), 0)
  } else if (spec.op === 'count') {
    value = qualifying.length
  } else {
    const [a, b] = qualifying
    value = Number(a[spec.field]) - Number(b[spec.field])
  }

  const answer = spec.op === 'max' || spec.op === 'min'
    ? `${winner.title} — ${fmt(value)}`
    : spec.op === 'count' ? `${value}`
      : spec.op === 'topk' ? ranked.map((r, i) => `${i + 1}. ${r.title} — ${fmt(r[spec.field])}`).join('\n')
        : spec.op === 'diff' ? `${signed(value)}${fmt(Math.abs(value))}`
          : fmt(value)
  const quote = filtered.map((r) => (receiptLine ? receiptLine(r, spec, fmt) : defaultLine(r, spec, fmt))).join('\n')
  const legs = filtered.flatMap((r) => (legsFor ? legsFor(r, spec) : defaultLegs(r)))
  const coverage = { candidates: filtered.length, expected: expectedCount, complete: filtered.length === expectedCount }
  const aggregate = {
    op: spec.op,
    field: spec.field,
    filter: spec.filter ?? null,
    filters,
    order,
    candidates: filtered.length,
    qualifying: qualifying.length,
    winner: winner?.title ?? null,
    value,
    ...(ranked ? { ranked: ranked.map((r) => ({ title: r.title, value: r[spec.field] })) } : {})
  }
  const final = { text: `Q: ${question || 'aggregate'}\nA: ${answer}\n\nReceipt (${coverage.candidates}/${coverage.expected} candidates):\n${quote}` }
  return { question, answer, quote, legs, coverage, aggregate, citation_breadth: { cited: filtered.length, expected: expectedCount }, final }
}
