// Minimal-receipt post-processing: keep only the quote sentences needed to
// retain the answer's coverage, with a guard that falls back to the full quote
// if any answer coverage is lost. The selected sentences are verbatim
// substrings of the assembled legs; the receipt stays multi-leg.
const STOP = new Set('a an the and or but if then than that this these those of for to in on at by with from as is are was were be been being it its their his her they he she we you i not no do does did can could may might will would should about into over under which who whom whose what when where why how all any some more most other such only own same so too very s t don now'.split(' '))
const words = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
const content = (s) => words(s).filter((w) => !STOP.has(w))
const quoteWords = (s) => String(s ?? '').split(/\s+/).filter(Boolean).length

function sentences (quote) {
  const raw = String(quote ?? '').replace(/\s*\|\s*/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 3)
  const seen = new Set()
  const out = []
  for (const s of raw) {
    const key = s.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!seen.has(key)) { seen.add(key); out.push(s) }
  }
  return out
}
function coverage (target, text) {
  if (!target.size) return 0
  const t = new Set(content(text))
  return [...target].filter((w) => t.has(w)).length / target.size
}
function greedy (sents, target, want) {
  const chosen = []
  const covered = new Set()
  while (target.size && covered.size / target.size < want) {
    let pick = null
    let gain = 0
    for (const s of sents) {
      if (chosen.includes(s)) continue
      const t = new Set(content(s))
      const g = [...target].filter((w) => t.has(w) && !covered.has(w)).length
      if (g > gain) { gain = g; pick = s }
    }
    if (!pick || gain === 0) break
    chosen.push(pick)
    for (const w of target) if (new Set(content(pick)).has(w)) covered.add(w)
  }
  return { chosen, cov: target.size ? covered.size / target.size : 0 }
}

export function minimizeAssembled (assembled, answer, { tolerance = 0.01 } = {}) {
  const legs = assembled.legs ?? []
  if (!legs.length) return { ...assembled, minimized: false, reason: 'no_legs' }
  const full = legs.map((l) => l.quote).filter(Boolean).join(' | ')
  const aSet = new Set(content(answer))
  const fullA = coverage(aSet, full)
  if (!aSet.size || fullA === 0) return { ...assembled, minimized: false, reason: 'no_answer_target' }

  const entries = []
  const seen = new Set()
  legs.forEach((leg, li) => {
    for (const s of sentences(leg.quote)) {
      const key = s.toLowerCase().replace(/\s+/g, ' ').trim()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ li, s })
    }
  })
  if (!entries.length) return { ...assembled, minimized: false, reason: 'no_sentences' }

  const sel = greedy(entries.map((x) => x.s), aSet, Math.max(0, 0.95 * fullA))
  const minA = coverage(aSet, sel.chosen.join(' '))
  if (minA < fullA - tolerance) {
    return { ...assembled, minimized: false, reason: 'answer_drop', fullWords: quoteWords(full), minWords: quoteWords(full), fullA, minA }
  }

  const chosen = new Set(sel.chosen)
  const newLegs = []
  legs.forEach((leg, li) => {
    const qs = entries.filter((x) => x.li === li && chosen.has(x.s)).map((x) => x.s)
    if (qs.length) newLegs.push({ ...leg, quote: qs.join(' | ') })
  })
  if (!newLegs.length) return { ...assembled, minimized: false, reason: 'empty_selection' }

  const source = newLegs.map((l) => `${l.title} (${l.date || 'unknown'}) · ${l.rel}`).join(' | ')
  const quote = newLegs.map((l) => l.quote).join(' | ')
  return {
    ...assembled,
    text: `Q: ${answer}\nSource: ${source || 'NOT FOUND'}\nQuote: ${quote || 'NOT FOUND'}`,
    legs: newLegs,
    minimized: true,
    reason: 'minimized',
    fullWords: quoteWords(full),
    minWords: quoteWords(quote),
    fullA,
    minA
  }
}
