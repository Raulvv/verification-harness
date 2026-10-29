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

// The leading abstention shape: an answer that opens with NOT FOUND / no record /
// cannot find / nowhere / not documented / not stated. Shared by the scorer, the
// gate's absence check, and the kit's absence layer; the broad `ABSTAIN_TERMS`
// list stays for the vocabulary check inside an answer.
export const leadAbstain = (t) => /^\s*(not found|no record|cannot find|nowhere|not documented|not stated)\b/i.test(t)

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

// The minimal claim span: the sentence (or table cell group) containing the
// anchor, not the whole line. For prose, the shortest contiguous sentence
// range; for a table row, the row label plus the cell sentence that carries
// the anchor. The full line stays available via liftEvidence for the receipt.
const sentenceSpan = (text, a) => {
  const sentences = String(text ?? '').split(/(?<=[.!?;])\s+/).filter(Boolean)
  const idxs = sentences.map((s, i) => (norm(s).includes(a) ? i : -1)).filter((i) => i >= 0)
  if (!idxs.length) return null
  return sentences.slice(idxs[0], idxs[idxs.length - 1] + 1).join(' ')
}

export function liftSpan(content, anchor) {
  const a = norm(anchor)
  if (!a) return null
  let best = null
  const consider = (s) => {
    const t = String(s ?? '').trim()
    if (!t) return
    const complete = /[.!?;]$/.test(t)
    if (!best || (complete && !best.complete) || (complete === best.complete && t.length < best.t.length)) best = { t, complete }
  }
  const lines = String(content ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (norm(trimmed).includes(a)) {
      if (trimmed.includes('|')) {
        const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean)
        if (cells.length) {
          const label = cells[0]
          const hits = cells.filter((c) => norm(c).includes(a))
          if (hits.length) {
            const picked = hits.map((c) => sentenceSpan(c, a) ?? c)
            consider([label, ...picked].filter((v, i2, arr) => arr.indexOf(v) === i2).join(' | '))
          } else {
            consider(trimmed)
          }
        }
      } else {
        consider(sentenceSpan(trimmed, a) ?? trimmed)
      }
    }
    if (!/[.!?;|]$/.test(trimmed) && i + 1 < lines.length) {
      const pair = trimmed + ' ' + lines[i + 1].trim()
      if (norm(pair).includes(a)) consider(sentenceSpan(pair, a) ?? pair)
    }
  }
  return best?.t ?? null
}

// The one evidence matcher// The one evidence matcher, shared by gate and scorer: does this content
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

// STRICT evidence matcher (opt-in, `verify(..., { strict: true })`). The default
// matcher above is deliberately tolerant; this one backs a literal "verbatim"
// claim: only whitespace runs are collapsed and one pair of wrapping quote
// marks is stripped. Case, emphasis marks and punctuation must match exactly;
// no " / " segment joins and no per-line fallback (both let a stitched quote
// pass). A quote shorter than `minChars` must be a complete line of the file,
// so a two-word fragment cannot "verify" a claim.
export function evidenceMatchesStrict(content, quote, { minChars = 20 } = {}) {
  const ws = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  let q = ws(quote)
  const wrapped = /^([\"'`\u201c\u2018\u00ab])(.*)([\"'`\u201d\u2019\u00bb])$/.exec(q)
  if (wrapped && !ws(content).includes(q)) q = wrapped[2].trim()
  if (!q || q.toLowerCase() === 'not found') return false
  if (!ws(content).includes(q)) return false
  if (q.length >= minChars) return true
  return String(content ?? '').split('\n').some((line) => ws(line) === q)
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

// The one number tokenizer: every number in a text, comma-grouping removed and
// a trailing .0 dropped, so 10,500 / 10.500 / 10500 compare equal.
export const numbersIn = (text) =>
  [...String(text ?? '').matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,/g, '').replace(/\.0+$/, ''))

const WORD_NUM = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100',
}

// The claim-number view: strips labels that are not claims (versions, dotted
// release numbers, ISO dates, §-sections, ledger row ids), maps number words to
// digits, and drops the trivial count 1 (a determiner in prose, not a fact).
export function claimNumbers (text) {
  let s = String(text ?? '')
  s = s.replace(/\bv\d+(?:\.\d+)*/gi, ' ')
  s = s.replace(/\b\d+(?:\.\d+){2,}\b/g, ' ')
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
  s = s.replace(/§\s*\d+(?:\.\d+)*/g, ' ')
  s = s.replace(/\bB\d+\b/g, ' ')
  for (const [w, n] of Object.entries(WORD_NUM)) s = s.replace(new RegExp(`\\b${w}\\b`, 'gi'), n)
  return numbersIn(s).filter((n) => n !== '1')
}

// Results the answer itself shows as arithmetic over numbers the evidence
// already contains: 26 × 3 = 78 is anchored, 26 × 3 = 80 is not.
export function derivedNumbers (answer, evidence = [], { ignore = '' } = {}) {
  const text = Array.isArray(evidence) ? evidence.join(' ') : String(evidence ?? '')
  const quoted = new Set([...numbersIn(text), ...numbersIn(ignore)])
  const out = new Set()
  const re = /(\d+(?:[.,]\d+)?)\D{0,30}?(×|\bx\b|\*|\+|-|\/)\s*(\d+(?:[.,]\d+)?)\D{0,30}?=\s*(\d+(?:[.,]\d+)?)/gi
  for (const m of String(answer ?? '').matchAll(re)) {
    const a = Number(m[1].replace(/,/g, ''))
    const b = Number(m[3].replace(/,/g, ''))
    const c = Number(m[4].replace(/,/g, ''))
    if (!quoted.has(String(a)) || !quoted.has(String(b))) continue
    const op = m[2]
    const v = op === '×' || op === 'x' || op === '*' ? a * b : op === '+' ? a + b : op === '-' ? a - b : b ? a / b : NaN
    if (Number.isFinite(v) && Math.abs(v - c) <= 0.01 * Math.max(1, Math.abs(c))) out.add(String(c))
  }
  return [...out]
}

// The one number anchor: numbers stated in an answer that do NOT appear in its
// evidence quotes (nor in the question, an explicit derived-value allowlist, or
// arithmetic the answer shows over quoted operands) are unanchored — the
// answer/quote binding the prompt declares but never enforced. Pure, no model:
// usable as a post-hoc detector over stored answers or as a gate.
export function unanchoredNumbers (answer, evidence = [], { allow = [], ignore = '' } = {}) {
  const text = Array.isArray(evidence) ? evidence.join(' ') : String(evidence ?? '')
  const derived = derivedNumbers(answer, evidence, { ignore })
  const allowed = new Set([...allow.map((n) => String(n).replace(/,/g, '').replace(/\.0+$/, '')), ...derived])
  const quoted = new Set([...claimNumbers(text), ...claimNumbers(ignore)])
  return [...new Set(claimNumbers(answer))].filter((n) => !quoted.has(n) && !allowed.has(n))
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
