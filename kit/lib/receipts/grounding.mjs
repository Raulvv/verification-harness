// A mechanical grounding floor for honest abstention (RN-G04's missing half).
//
// The prompt *asks* the model to abstain when the window doesn't answer — but a
// small model leaks parametric knowledge under a strong prior ("Brock's gym")
// and cites a real-but-irrelevant retrieved file, which the gate cannot catch
// (the citation exists). So abstention cannot be a promise; it needs a floor.
//
// This is that floor, and it is deliberately narrow and deterministic: an answer
// may not name proper nouns or numbers that appear NOWHERE in the retrieved
// window. If it does, the answer went beyond the evidence and the system
// abstains. Lexical — not entailment — so it catches "answered from memory",
// not subtler overreach.

// Capitalized function / sentence-lead / domain-generic words that are not
// evidence and must not trigger a false positive.
const FUNCTION = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', 'if', 'in', 'on', 'at', 'for',
  'and', 'or', 'but', 'however', 'according', 'based', 'when', 'while', 'after', 'before', 'since',
  'as', 'so', 'then', 'there', 'here', 'both', 'each', 'all', 'no', 'not', 'yes', 'answer', 'answers',
  'question', 'questions', 'document', 'documents', 'provided', 'corpus', 'source', 'quote', 'generation',
  'method', 'note', 'first', 'second', 'third', 'type', 'types', 'national', 'pokédex', 'pokemon',
  'pokémon', 'base', 'total', 'height', 'weight', 'abilities', 'evolves', 'evolution', 'entry', 'led',
  'uses', 'use', 'used', 'still', 'also', 'only', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'episode', 'episodes', 'chapter', 'volume', 'anime', 'manga', 'series', 'arc',
])

const CAP = /\b(\p{Lu}\p{Ll}{2,})\b/gu
const NUM = /\b\d[\d,.]*\b/g

// Proper nouns (capitalized, not function words) + numbers appearing in the text.
export function salientTerms(text) {
  const out = new Set()
  for (const m of String(text ?? '').matchAll(NUM)) out.add(m[0].replace(/[.,]$/, ''))
  for (const m of String(text ?? '').matchAll(CAP)) {
    if (!FUNCTION.has(m[1].toLowerCase())) out.add(m[1])
  }
  return [...out]
}

// Salient terms in `answer` that appear nowhere in `evidence` (lowercased substring).
export function ungroundedTerms(answer, evidence) {
  const ev = String(evidence ?? '').toLowerCase()
  return salientTerms(answer).filter((t) => !ev.includes(t.toLowerCase()))
}
