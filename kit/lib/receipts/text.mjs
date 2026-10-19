// Text primitives for receipts: the one normalization, the one evidence
// matcher, the answer parser, the abstention shape and vocabulary — shared
// by the gate and the scorer so the two cannot drift.
export const norm = (s) => (s ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[`*_"'“”«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

// The single abstention vocabulary: the scorer's not-found branch and the
// gate's abstention detection both read it.
export const ABSTAIN_TERMS = [
  'not found', 'no record', 'nothing', 'nowhere', 'not documented', 'no mention',
  'not in the repo', 'cannot find', 'no reference', 'no trace', 'there is no',
  'do not contain', 'does not contain', "don't contain", "doesn't contain",
  'not mention', 'no information', 'not listed', 'does not state', 'do not state',
  'not stated', 'never states',
]

// The one evidence lifter: given a short anchor the model copied from a
// document, return the FULL line(s) it points at — so the stored receipt is
// verbatim-by-construction (lifted from the file), never verbatim-by-recopy.
// An anchor that already IS the full line returns unchanged. Line-first (a
// markdown bullet/table row is one line); falls back to a two-line pair for a
// wrapped sentence. null when no line carries the anchor.
export function liftEvidence(content, anchor) {
  const a = norm(anchor)
  if (!a) return null
  const lines = String(content ?? '').split('\n')
  for (const line of lines) if (norm(line).includes(a)) return line.trim()
  for (let i = 0; i < lines.length - 1; i++) {
    const pair = lines[i] + ' ' + lines[i + 1]
    if (norm(pair).includes(a)) return pair.trim()
  }
  return null
}

// The one evidence matcher, shared by gate and scorer: does this content
// contain this quote verbatim — tolerating emphasis, " / " joins (whole or
// by segments), and whitespace? File-side truth only.
export function evidenceMatches(content, quote) {
  if (!norm(quote)) return false
  const sq = (s) => norm(s).replace(/\s+\/\s+/g, ' ')
  const c = norm(content)
  if (c.includes(norm(quote))) return true
  if (sq(content).includes(sq(quote))) return true
  const segs = (quote ?? '').split(/\s+\/\s+/).map(norm).filter(Boolean)
  if (segs.length > 1 && segs.every((s) => c.includes(s))) return true
  // per-line fallback: every substantive line appears somewhere (a quote
  // whose continuation swallowed a marker or a blank)
  const lines = (quote ?? '').split('\n').map((s) => norm(s)).filter((s) => s && s !== 'not found')
  return lines.length >= 1 && lines.every((s) => c.includes(s))
}

// Does this quote appear in arbitrary TEXT (an answer, not a file)? The
// answer-side twin of evidenceMatches: emphasis and whitespace tolerated,
// " / " joins matched whole or by verbatim segment. Shared by the scorer, so
// the answer-side matcher cannot drift from the file-side one.
export function quoteInText(text, quote) {
  const a = norm(text)
  const q = norm(quote)
  if (a.includes(q)) return true
  const squash = (s) => norm(s).replace(/\s+\/\s+/g, ' ')
  if (squash(text).includes(squash(quote))) return true
  const segs = (quote ?? '').split(/\s+\/\s+/).map(norm).filter(Boolean)
  return segs.length > 1 && segs.every((s) => a.includes(s))
}

// The abstention is ONE sentence (the taught shape). Any trailing clause
// naming what else the documents mention is the neighbor mechanism
// leaking through the model's prose — the receipt drops it, exactly like
// Source/Quote are forced to NOT FOUND (2026-09-30).
export function abstainLine(answer) {
  const s = String(answer ?? '').trim()
  return s.split(/(?<=[.!?;])\s+(?=[A-Z])/)[0].trim()
}

export function parseAnswer(text) {
  const lines = (text ?? '').split('\n')
  const grab = (name) => {
    const re = new RegExp(`^${name}:\\s*`, 'i')
    const i = lines.findIndex((l) => re.test(l.trim()))
    if (i < 0) return ''
    const parts = [lines[i].trim().replace(re, '')]
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j].trim()
      if (/^(q|path|source|quote|status|derived):/i.test(l)) break
      if (l) parts.push(l)
    }
    return parts.join('\n')
  }
  return { proposed: grab('q'), path: grab('path'), source: grab('source'), quote: grab('quote'), status: grab('status') }
}
