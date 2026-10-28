// The receipt is assembled from the files' own metadata — mechanical truth.
// Re-homing: the model remembers *what* it read, not always *where*
// (measured: a Daniel-page quote labeled as the Journey Map); the bytes
// decide, and a leg no document contains is DROPPED, never carried.
// An abstention carries NO receipts (2026-09-30: the neighbor mechanism is
// gone — a NOT FOUND never names or quotes related material; any leg the
// model supplies alongside an abstention is dropped, never surfaced).
import { evidenceMatches, liftEvidence, liftSpan, abstainLine, norm } from '../receipts/text.mjs'
import { monthYear } from '../receipts/cite.mjs'
import { resolveMeta } from '../corpus/meta.mjs'
import { minimizeAssembled } from './minimize.mjs'

const squash = (s) => norm(s).replace(/\s+\/\s+/g, ' ')
const contiguous = (content, q) => norm(content).includes(norm(q)) || squash(content).includes(squash(q))

// A model quote can be a composite of several source lines/rows. Keep only the
// contiguous segments; the receipt is then individually verifiable, not a
// concatenation that only the tolerant matcher accepts.
function verbatimSegments(content, quote) {
  const q = String(quote ?? '').trim()
  if (!q) return []
  if (contiguous(content, q)) return [q]
  const coarse = q.split(/\s*\|\s*|\n+|\s+\/\s+|\s{3,}/).map((x) => x.trim()).filter(Boolean)
  if (coarse.length > 1) {
    const out = []
    for (const part of coarse) {
      if (contiguous(content, part)) out.push(part)
      else {
        for (const sent of part.split(/(?<=[.!?;])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean)) {
          if (contiguous(content, sent)) out.push(sent)
        }
      }
    }
    return [...new Set(out)]
  }
  return [...new Set(q.split(/(?<=[.!?;])\s+(?=[A-Z])/).map((x) => x.trim()).filter((x) => contiguous(content, x)))]
}

export function rehomeLegs(docs, quotes) {  const kept = []
  const dropped = []
  for (const q of quotes ?? []) {
    // The receipt is lifted, not re-copied: the model points at a passage;
    // the machine returns the FULL line it sits in — verbatim-by-construction.
    // A full verbatim quote lifts to its own line (unchanged); the tolerant
    // matcher (elision / per-line) stays as the fallback so no leg that used
    // to land is lost.
    const add = (idx, content, text, extra = {}) => {
      const segs = verbatimSegments(content, text)
      if (!segs.length) return false
      for (const seg of segs) kept.push({ ...q, ...extra, doc: idx + 1, quote: seg, span: seg === text ? (liftSpan(content, q.quote) ?? seg) : seg })
      return true
    }
    const claimedIdx = Number(q.doc) - 1
    const claimed = docs[claimedIdx]
    if (claimed) {
      const lifted = liftEvidence(claimed.content, q.quote)
      if (lifted && add(claimedIdx, claimed.content, lifted)) continue
      if (add(claimedIdx, claimed.content, q.quote)) continue
      if (evidenceMatches(claimed.content, q.quote)) {
        kept.push({ ...q, doc: claimedIdx + 1, quote: q.quote, span: liftSpan(claimed.content, q.quote) ?? q.quote })
        continue
      }
    }
    let found = false
    for (let i = 0; i < docs.length; i++) {
      if (i === claimedIdx) continue
      if (add(i, docs[i].content, q.quote, { rehomed: true })) { found = true; break }
      if (evidenceMatches(docs[i].content, q.quote)) {
        kept.push({ ...q, doc: i + 1, quote: q.quote, span: liftSpan(docs[i].content, q.quote) ?? q.quote, rehomed: true })
        found = true
        break
      }
    }
    if (found) continue
    dropped.push(String(q.quote).slice(0, 60))
  }
  return { kept, dropped }
}

// Citation metadata for one verbatim quote: byte offsets when the quote is an
// exact substring (0-indexed, exclusive end — the Anthropic convention), plus
// the section heading and the nearest intro line (table context). `exact` is
// false when only the tolerant matcher would land the quote; offsets stay null
// so a consumer never slices a wrong range.
function citeMeta(content, quote) {
  const q = String(quote ?? '')
  const idx = q ? content.indexOf(q) : -1
  const exact = idx >= 0
  let section = null
  let context = null
  if (exact) {
    const before = content.slice(0, idx)
    const heads = [...before.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)]
    section = heads.length ? heads[heads.length - 1][1].trim() : null
    const lines = before.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (!line) continue
      if (line.endsWith(':')) { context = line; break }
      if (lines.length - 1 - i > 6) break
    }
  }
  const lines = q.split('\n').map((l) => l.trim()).filter(Boolean)
  const kind = q.includes(' | ') ? 'row'
    : lines.length >= 2 && lines.slice(1).some((l) => /^\$?-?[\d,.]+%?$/.test(l)) ? 'table'
      : 'prose'
  return { start_char_index: exact ? idx : null, end_char_index: exact ? idx + q.length : null, exact, section, context, kind }
}

// Build the machine-readable citation list from the FINAL legs (so a minimized
// receipt cites exactly what it shows). `document_index` is 1-based, matching
// the source numbering in the prompt and the display.
function buildCitations(legs, docs) {
  const byRel = new Map((docs ?? []).map((d) => [d.rel, d.content]))
  const out = []
  for (let i = 0; i < (legs ?? []).length; i++) {
    const leg = legs[i]
    const content = byRel.get(leg.rel) ?? ''
    const quotes = leg.quotes ?? (leg.quote ? [leg.quote] : [])
    for (const quote of quotes) {
      out.push({ document_index: i + 1, title: leg.title, date: leg.date ?? '', rel: leg.rel, quote, ...citeMeta(content, quote) })
    }
  }
  return out
}

export function assembleOneShot(corpusRoot, question, docs, parsed, opts = {}) {
  if (parsed.notFound) {
    return { text: `Q: ${abstainLine(parsed.answer)}\nSource: NOT FOUND\nQuote: NOT FOUND`, legs: [], citations: [], dropped: (parsed.quotes ?? []).map((q) => String(q.quote).slice(0, 60)) }
  }
  const { kept, dropped } = rehomeLegs(docs, parsed.quotes)
  const used = [...new Set(kept.map((q) => q.doc))]
  const cap = Number(opts.maxQuotesPerDoc)
  const legs = []
  for (const n of used) {
    const d = docs[n - 1]
    if (!d) continue
    const meta = resolveMeta(corpusRoot, d.rel, d.content)
    let quotes = kept.filter((q) => q.doc === n).map((q) => q.quote.trim()).filter(Boolean)
    if (Number.isInteger(cap) && cap > 0) quotes = quotes.slice(0, cap)
    if (!quotes.length) continue
    legs.push({ title: meta.title || d.rel, date: meta.date ? monthYear(meta.date) : '', rel: d.rel, quote: quotes.join(' | '), quotes })
  }
  const source = legs.map((l) => `${l.title} (${l.date || 'unknown'}) · ${l.rel}`).join(' | ')
  const quote = legs.map((l) => l.quote).join(' | ')
  let assembled = { text: `Q: ${parsed.answer}\nSource: ${source || 'NOT FOUND'}\nQuote: ${quote || 'NOT FOUND'}`, legs, dropped }
  if (opts.minimizeReceipt === true) assembled = minimizeAssembled(assembled, parsed.answer ?? '')
  assembled.citations = buildCitations(assembled.legs ?? [], docs)
  return assembled
}

// The middle tier (source, no verbatim quote): the model names the document
// number(s) it drew on; the machine renders the Source line from those docs —
// provenance without the byte-parrot. No Quote line: a source reference is a
// locator, not a re-statement.
export function assembleSource(corpusRoot, question, docs, parsed) {
  if (parsed.notFound) {
    return { text: `Q: ${abstainLine(parsed.answer)}\nSource: NOT FOUND`, legs: [], citations: [] }
  }
  const idx = [...new Set((parsed.sources ?? []).map((n) => n - 1))].filter((i) => docs[i])
  const legs = idx.map((i) => {
    const d = docs[i]
    const meta = resolveMeta(corpusRoot, d.rel, d.content)
    return { title: meta.title || d.rel, date: meta.date ? monthYear(meta.date) : '', rel: d.rel, quote: '' }
  })
  const source = legs.map((l) => `${l.title} (${l.date || 'unknown'}) · ${l.rel}`).join(' | ')
  return { text: `Q: ${parsed.answer}\nSource: ${source || 'NOT FOUND'}`, legs, citations: [] }
}
