// Window selection by explicit reference (maintainer design, 2026-09-28):
// the question's phrases matched against TITLES and HEADINGS — never
// relevance ranking, never currency judgment. Measured windows: 1–2 docs
// when the question names things. Three parts:
//   1. ubiquitous-phrase stoplist — a phrase matching most titles selects
//      nothing ("a ubiquitous in-corpus phrase" is in nearly every file here);
//   2. light morphology — plurals match their stems ("regional codes" →
//      "Region_Code_Request…");
//   3. term-match fallback — the ONLY ranked step, used solely when
//      reference selection finds nothing (paraphrased questions like
//      "hand the account over" name no document). The unavoidable
//      selection judgment lives there, not in the reference layer.
import { readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { locate } from './locate.mjs'
import { WINDOW_STOP as STOP } from '../text/stopwords.mjs'
import { stem, splitId } from '../text/morph.mjs'
import { walkFiles } from '../text/walk.mjs'
// corpus files, recursively — a nested corpus (docs/Reference/Logging.md) is
// not visible to a flat readdir; measured: the whole docs/ tree was invisible
// to the selector and only root boilerplate matched. The walk itself is shared
// (`text/walk.mjs`); `mdFiles` stays a named wrapper for its callers.
const mdFiles = (dir) => walkFiles(dir, { extensions: ['.md'] })
// The snippet is the vet's evidence — it must show the QUESTION'S OWN
// words in context, not the document's opening (measured 2026-09-28:
// a common in-corpus term in every title made snippets show headings, and the vet
// correctly discarded six titles as not answering the question). Lines
// are scored by the RARITY of the stems they carry — "sla" beats
// a common term — the IDF lesson, applied to windows.
const snippetFor = (content, weights) => {
  const lines = content.split('\n')
  let best = 0
  let bestScore = -1
  const scoreLine = (l) => {
    const toks = new Set(stem(splitId(l.toLowerCase()).split(/\s+/).map(stem).join(' ')).split(' '))
    let s = 0
    for (const [w, weight] of weights) if (toks.has(w) || [...toks].some((t) => t.includes(w))) s += weight
    return s
  }
  lines.forEach((l, i) => {
    const s = scoreLine(l)
    if (s > bestScore) { bestScore = s; best = i }
  })
  const start = Math.max(0, best - 2)
  return lines.slice(start, start + 6).join(' ').slice(0, 400)
}

export function selectByReference(corpusRoot, question, opts = {}) {
  const all = mdFiles(corpusRoot).map((p) => relative(corpusRoot, p))
  // the corpus boundary comes FIRST: selection happens inside the declared
  // corpus, never across whatever the mirror happens to hold
  const files = opts.corpus ? all.filter((f) => opts.corpus.includes(f)) : all
  const q = splitId(question).toLowerCase().replace(/'s\b/g, '').replace(/[^a-z0-9' ]/g, ' ')
  const words = q.split(/\s+/).filter((w) => w && !STOP.has(w))
  const stems = words.map(stem)
  const bigrams = []
  for (let i = 1; i < words.length; i++) bigrams.push(stem(words[i - 1]) + ' ' + stem(words[i]))
  const acronyms = [...splitId(question).matchAll(/\b[A-Z]{2,}\b/g)].map((m) => m[0].toLowerCase())
  const hay = new Map()
  for (const rel of files) {
    const content = readFileSync(join(resolve(corpusRoot), rel), 'utf8')
    const title = splitId(rel.replace(/\.md$/i, '').toLowerCase().replace(/_/g, ' '))
    const heads = content.split('\n').filter((l) => /^#/.test(l)).map(splitId).join(' ').toLowerCase()
    const stemmed = (title + ' \n ' + heads).split(/\s+/).map(stem).join(' ')
    hay.set(rel, { raw: title + ' \n ' + heads, stemmed, full: stem(splitId(content.toLowerCase()).split(/\s+/).map(stem).join(' ')) })
  }
  const weights = stems.map((s) => {
    const df = files.filter((rel) => hay.get(rel).full.includes(s)).length
    return [s, Math.log((files.length + 1) / (df + 1)) + 1]
  })
  // 1. ubiquitous-phrase stoplist: a phrase touching most titles is not a
  //    reference — applied to bigrams AND acronyms alike
  const half = Math.max(1, files.length / 2)
  const disc = (match) => [...hay.values()].filter(match).length <= half
  const kept = bigrams.filter((b) => disc((h) => h.stemmed.includes(b)))
  const keptAcronyms = acronyms.filter((a) => disc((h) => new RegExp(`\\b${a}\\b`).test(h.raw)))
  const hits = []
  for (const rel of files) {
    const h = hay.get(rel)
    const matched = kept.filter((b) => h.stemmed.includes(b))
      .concat(keptAcronyms.filter((a) => new RegExp(`\\b${a}\\b`).test(h.raw)))
    if (matched.length) {
      const content = readFileSync(join(resolve(corpusRoot), rel), 'utf8')
      hits.push({ rel, matched: matched.join(', '), phrase: matched.some((m) => m.includes(' ')), snippet: snippetFor(content, weights) })
    }
  }
  // 2. A reference is a PHRASE; a lone token is a hint. Measured
  //    2026-09-28 (N1): a client acronym in Team_Review's heads returned the
  //    reference window alone and starved the union that holds the
  //    NDA/deal-sheet page N1 actually answers from. Phrase evidence →
  //    the reference window, all hits as ever. Lone acronyms alone →
  //    the union still runs, with the hint first in line (a hint is
  //    never cut — F1's 'se' points straight at its answer home).
  // 2. A reference is a PHRASE; a lone token is a hint. (Unchanged.) The
  //    second-chance pass (2026-10-01) may force the union past this return:
  //    a named window that ABSTAINS is retried over the content search — the
  //    trap where a title phrase answered nothing while the fact lived
  //    inside another doc. Correct reference answers are never re-windowed.
  if (!opts.forceFallback && hits.some((h) => h.phrase)) return { candidates: hits.map((h) => ({ rel: h.rel })), matches: hits, method: 'reference' }
  // 3. fallback — the corpus-bound union of BOTH tiers plus any lone
  //    hint. Measured 2026-09-28: the ranked tier alone drowned Roles
  //    (T1's era-split home) and an acronym reference pre-empted it
  //    (N1) — so the IDF/phrase ranker and the body-term count each
  //    contribute, and the vet keeps what fits. Every fallback window
  //    carries snippets too (the double pass is not optional; f-3
  //    drifted on an unvetted distractor).
  const withSnippets = (rels) => rels.map((rel) => {
    const content = readFileSync(join(resolve(corpusRoot), rel), 'utf8')
    return { rel, matched: hits.find((h) => h.rel === rel)?.matched ?? 'fallback', snippet: snippetFor(content, weights) }
  })
  const bodyScored = files.map((rel) => {
    const body = readFileSync(join(resolve(corpusRoot), rel), 'utf8').toLowerCase().split(/\s+/).map(stem).join(' ')
    return { rel, n: stems.filter((s) => s && body.includes(s)).length }
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || (a.rel < b.rel ? -1 : 1))
  const ranked = locate(corpusRoot, question, 5).candidates
    .map((c) => c.rel).filter((rel) => files.includes(rel)).slice(0, 3)
  const hints = hits.map((h) => h.rel)
  const union = [...new Set([...hints, ...ranked, ...bodyScored.map((x) => x.rel)])].slice(0, 6)
  return { candidates: union.map((rel) => ({ rel })), matches: withSnippets(union), method: 'fallback' }
}

// shared with the dense selector (dense.mjs): the same corpus walk, the same
// question-word snippet for the vet, the same light morphology.
export { mdFiles, snippetFor, stem, splitId }
