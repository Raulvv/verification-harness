// The evidence a sufficiency judge should see: the receipt's OWN evidence, not
// the whole retrieved window. A quote tier hands over its verbatim quote(s); a
// source tier (no quote) hands over the cited document's most question-relevant
// lines. Small by construction, so it fits any judge's context — the judge then
// answers "does THIS evidence support the answer", which is the real question.
import { parseAnswer } from './text.mjs'
import { questionTerms } from '../retrieval/terms.mjs'

// The lines of `content` that best match the question's terms (stable order),
// capped. Falls back to the head of the document when nothing matches.
export function relevantSnippet(content, question, { maxLines = 12, maxChars = 2000 } = {}) {
  const terms = questionTerms(question)
  const lines = String(content ?? '').split('\n')
  const scored = lines.map((l, i) => {
    const low = l.toLowerCase()
    return { l, i, s: terms.reduce((a, t) => a + (low.includes(t) ? 1 : 0), 0) }
  })
  const hot = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, maxLines)
  const chosen = (hot.length ? hot : scored.slice(0, maxLines)).sort((a, b) => a.i - b.i).map((x) => x.l)
  return chosen.join('\n').slice(0, maxChars)
}

export function judgeEvidence(receipt, question, docs = [], legs = []) {
  const { quote } = parseAnswer(receipt)
  if (quote && !/^not found$/i.test(quote.trim())) return quote.trim() // the receipt's verbatim quote(s)
  const rels = new Set((legs ?? []).map((l) => l.rel))
  const cited = docs.filter((d) => rels.has(d.rel))
  const pool = cited.length ? cited : docs
  return pool.map((d) => relevantSnippet(d.content, question)).filter(Boolean).join('\n\n')
}

// The union a synthesis answer needs: the receipt's quote(s) PLUS the cited
// documents' question-relevant lines, deduped. A synthesized answer draws on
// several documents, so one quote under-supports it (B64); this hands the judge
// every cited leg's evidence, still bounded (relevantSnippet caps each doc).
export function judgeEvidenceUnion(receipt, question, docs = [], legs = []) {
  const parts = []
  const { quote } = parseAnswer(receipt)
  if (quote && !/^not found$/i.test(quote.trim())) parts.push(quote.trim())
  const rels = new Set((legs ?? []).map((l) => l.rel))
  const cited = docs.filter((d) => rels.has(d.rel))
  const pool = cited.length ? cited : docs
  for (const d of pool) {
    const snip = relevantSnippet(d.content, question)
    if (snip) parts.push(snip)
  }
  return [...new Set(parts)].join('\n\n')
}

// The whole retrieved window — every document the reader saw. Measured best for
// the gate (B87): the reader cites one line, but the answer is often entailed by
// another paragraph, so quote-only grading mislabels correct answers.
export function judgeEvidenceWindow(receipt, question, docs = []) {
  return (docs ?? []).map((d) => d.content).filter(Boolean).join('\n\n')
}

// Pick the evidence a judge sees. `window` (default) is the whole retrieved
// window — the measured best for the graded gate (B87); `union` is the quote plus
// the cited docs' relevant lines; `receipt` is the receipt's own quote only.
export function judgeEvidenceFor(mode, receipt, question, docs = [], legs = []) {
  if (mode === 'union') return judgeEvidenceUnion(receipt, question, docs, legs)
  if (mode === 'receipt') return judgeEvidence(receipt, question, docs, legs)
  return judgeEvidenceWindow(receipt, question, docs)
}
