// The retriever's term extraction — question -> content terms. The only
// consumer is locate() in corpus/locate.mjs.
import { TERM_STOP as STOP } from '../text/stopwords.mjs'

export function questionTerms(question) {
  return [...new Set((String(question ?? '').toLowerCase().match(/[a-z0-9À-ɏ]{3,}/g) ?? []).filter((w) => !STOP.has(w)))]
}
