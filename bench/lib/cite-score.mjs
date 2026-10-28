// Citation scoring, separate from answer scoring: validity (does the quote
// exist in the claimed document?), completeness (do the quotes cover the
// required operands/stated parts?), and claim classification for support.
// Mechanical by default; the runner adds the MiniCheck support signal.
import { numbersIn } from '../../kit/lib/receipts/text.mjs'

export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
export const loose = (s) => norm(s).replace(/[^\w\s]/g, '')

const has = (hay, needle) => norm(hay).includes(norm(needle))
const hasLoose = (hay, needle) => loose(hay).includes(loose(needle))
const numIn = (text, v) => {
  const t = String(text ?? '').replace(/,/g, '')
  const needle = Number.isInteger(Number(v)) ? String(Number(v)) : String(v)
  return t.includes(needle)
}

export function requiredValues(item) {
  if (!item) return []
  if (item.condition === 'partial') {
    return (item.gold?.parts ?? []).filter((p) => p.status === 'stated' && p.value != null).map((p) => p.value)
  }
  if (item.condition === 'answerable') {
    const f = String(item.formula ?? '')
    if (f.includes('=')) {
      // a computed answer is evidenced by its OPERANDS, not by the result
      return numbersIn(f.split('=')[0]).map(Number)
    }
    const g = item.gold
    if (g && typeof g === 'object') return Object.values(g).filter((v) => v != null)
    return g == null ? [] : [g]
  }
  return []
}

export function valueIn(quotes, v) {
  const q = Array.isArray(quotes) ? quotes.join(' | ') : String(quotes ?? '')
  return typeof v === 'number' || /^\d+$/.test(String(v)) ? numIn(q, v) : has(q, v)
}

// Each quote: {doc} (1-based index into docs) or {rel}. Checks the claimed
// document first, then any other document (misattribution).
export function quoteChecks(quotes, docs = []) {
  const byRel = new Map(docs.map((d, i) => [d.rel, i]))
  const out = []
  for (const raw of quotes ?? []) {
    const quote = String(raw?.quote ?? '')
    if (!quote) continue
    const idx = raw?.rel != null ? byRel.get(raw.rel) : Number(raw?.doc) - 1
    const claimed = idx != null && idx >= 0 && idx < docs.length ? docs[idx] : null
    let status = 'missing'
    if (claimed) {
      if (has(claimed.content ?? '', quote)) status = 'exact'
      else if (hasLoose(claimed.content ?? '', quote)) status = 'tolerant'
    }
    if (status === 'missing' || status === 'tolerant') {
      const other = docs.some((d, i) => i !== idx && (has(d.content ?? '', quote) || hasLoose(d.content ?? '', quote)))
      if (other) status = 'misattributed'
    }
    out.push({ quote, doc: claimed?.rel ?? null, status })
  }
  return out
}

export function coverage(item, quotes) {
  const req = requiredValues(item)
  const covered = req.filter((v) => valueIn(quotes, v)).length
  return { required: req.length, covered, complete: req.length > 0 && covered === req.length }
}

export function fileMentions(text) {
  return [...new Set(String(text ?? '').match(/[\w./-]+\.(?:md|markdown|txt|html?)/gi) ?? [])]
}

const ABSENCE_RE = /not (?:stated|provided|included|listed|available|covered)|(?:does|do) not (?:state|provide|include|list|contain|specify)|no (?:record|data|information|mention|pay|salary|wage|figure|value)|(?:only|just) (?:one|two|three|four|\d+) [^.]*(?:have|has|are|is)|cannot be (?:determined|calculated|computed|confirmed|completed|made|ranked)/i
const COMPUTED_RE = /\d\s*(?:[+\-−*×/]|plus|minus|times|divided by)\s*\d/i
// A source line is not a claim: filter "Source: a.md", "[1] a.md", "Reference: ...".
const SOURCE_RE = /^\s*(?:source(?:s| file)?|reference(?:s)?|doc(?:ument)?\s*\d*)\s*[:.\-]/i
const FILE_ONLY_RE = /^\s*\[?\d+\]?\s*[\w./-]+\.(?:md|markdown|txt|html?)\b/i

export function splitClaims(answer) {
  const parts = String(answer ?? '')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && !SOURCE_RE.test(s) && !FILE_ONLY_RE.test(s))
  return parts.map((text) => ({
    text,
    kind: ABSENCE_RE.test(text) ? 'absence' : COMPUTED_RE.test(text) || text.includes('=') ? 'computed' : 'positive',
  }))
}

// A computed claim is supported when its operands appear in the quotes; the
// arithmetic itself is the answer's, not the evidence's.
export function computedHolds(claim, quotes) {
  // Prefer the explicit binary expression, so years in the sentence ("2033")
  // are not mistaken for operands.
  const m = String(claim).match(/(\d[\d,]*)\s*(?:[+\-−*×/]|plus|minus|times|divided by)\s*(\d[\d,]*)/i)
  if (m) return valueIn(quotes, m[1]) && valueIn(quotes, m[2])
  const nums = numbersIn(claim).map(Number).filter((n) => n < 1900 || n > 2100)
  if (nums.length < 2) return false
  const operands = nums.slice(0, -1) // last is the stated result
  return operands.every((n) => valueIn(quotes, n))
}

export function citationStats({ item, answer, quotes, docs }) {
  const checks = quoteChecks(quotes, docs)
  const exact = checks.filter((c) => c.status === 'exact').length
  const tolerant = checks.filter((c) => c.status === 'tolerant').length
  const misattributed = checks.filter((c) => c.status === 'misattributed').length
  const missing = checks.filter((c) => c.status === 'missing').length
  const mentions = fileMentions(answer)
  return {
    quotes: checks.length,
    exact,
    tolerant,
    misattributed,
    missing,
    invalid: tolerant + misattributed + missing,
    has_quote: checks.length > 0,
    all_valid: checks.length > 0 && exact === checks.length,
    mentions: mentions.length,
    no_file: mentions.length === 0,
    coverage: coverage(item, checks.map((c) => c.quote)),
    claims: splitClaims(answer),
  }
}
