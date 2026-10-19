// The receipt is assembled from the files' own metadata — mechanical truth.
// Re-homing: the model remembers *what* it read, not always *where*
// (measured: a Daniel-page quote labeled as the Journey Map); the bytes
// decide, and a leg no document contains is DROPPED, never carried.
// An abstention carries NO receipts (2026-09-30: the neighbor mechanism is
// gone — a NOT FOUND never names or quotes related material; any leg the
// model supplies alongside an abstention is dropped, never surfaced).
import { evidenceMatches, liftEvidence, abstainLine } from '../receipts/text.mjs'
import { monthYear } from '../receipts/cite.mjs'
import { resolveMeta } from '../corpus/meta.mjs'

export function rehomeLegs(docs, quotes) {
  const kept = []
  const dropped = []
  for (const q of quotes ?? []) {
    // The receipt is lifted, not re-copied: the model points at a passage;
    // the machine returns the FULL line it sits in — verbatim-by-construction.
    // A full verbatim quote lifts to its own line (unchanged); the tolerant
    // matcher (elision / per-line) stays as the fallback so no leg that used
    // to land is lost.
    const claimed = docs[Number(q.doc) - 1]
    if (claimed) {
      const lifted = liftEvidence(claimed.content, q.quote)
      if (lifted) { kept.push({ ...q, doc: Number(q.doc), quote: lifted }); continue }
      if (evidenceMatches(claimed.content, q.quote)) { kept.push({ ...q, doc: Number(q.doc) }); continue }
    }
    const liftIdx = docs.findIndex((d) => liftEvidence(d.content, q.quote))
    if (liftIdx >= 0) { kept.push({ ...q, doc: liftIdx + 1, quote: liftEvidence(docs[liftIdx].content, q.quote), rehomed: true }); continue }
    const trueIdx = docs.findIndex((d) => evidenceMatches(d.content, q.quote))
    if (trueIdx >= 0) kept.push({ ...q, doc: trueIdx + 1, rehomed: true })
    else dropped.push(String(q.quote).slice(0, 60))
  }
  return { kept, dropped }
}

export function assembleOneShot(corpusRoot, question, docs, parsed) {
  if (parsed.notFound) {
    return { text: `Q: ${abstainLine(parsed.answer)}\nSource: NOT FOUND\nQuote: NOT FOUND`, legs: [], dropped: (parsed.quotes ?? []).map((q) => String(q.quote).slice(0, 60)) }
  }
  const { kept, dropped } = rehomeLegs(docs, parsed.quotes)
  const used = [...new Set(kept.map((q) => q.doc))]
  const legs = []
  for (const n of used) {
    const d = docs[n - 1]
    if (!d) continue
    const meta = resolveMeta(corpusRoot, d.rel, d.content)
    legs.push({ title: meta.title || d.rel, date: meta.date ? monthYear(meta.date) : '', rel: d.rel, quote: kept.filter((q) => q.doc === n).map((q) => q.quote.trim()).join(' | ') })
  }
  const source = legs.map((l) => `${l.title} (${l.date || 'unknown'}) · ${l.rel}`).join(' | ')
  const quote = legs.map((l) => l.quote).join(' | ')
  return { text: `Q: ${parsed.answer}\nSource: ${source || 'NOT FOUND'}\nQuote: ${quote || 'NOT FOUND'}`, legs, dropped }
}

// The middle tier (source, no verbatim quote): the model names the document
// number(s) it drew on; the machine renders the Source line from those docs —
// provenance without the byte-parrot. No Quote line: a source reference is a
// locator, not a re-statement.
export function assembleSource(corpusRoot, question, docs, parsed) {
  if (parsed.notFound) {
    return { text: `Q: ${abstainLine(parsed.answer)}\nSource: NOT FOUND`, legs: [] }
  }
  const idx = [...new Set((parsed.sources ?? []).map((n) => n - 1))].filter((i) => docs[i])
  const legs = idx.map((i) => {
    const d = docs[i]
    const meta = resolveMeta(corpusRoot, d.rel, d.content)
    return { title: meta.title || d.rel, date: meta.date ? monthYear(meta.date) : '', rel: d.rel, quote: '' }
  })
  const source = legs.map((l) => `${l.title} (${l.date || 'unknown'}) · ${l.rel}`).join(' | ')
  return { text: `Q: ${parsed.answer}\nSource: ${source || 'NOT FOUND'}`, legs }
}
