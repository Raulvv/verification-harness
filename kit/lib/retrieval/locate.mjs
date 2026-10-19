// LOCATE — deterministic candidate selection, no model. The question's
// phrases+terms are matched against a memoized corpus index and a small,
// ranked candidate room is returned. This is the only room of the old stage
// machine the current one-shot path still uses (as the fallback when no
// phrase reference is found); COMPREHEND/ANSWER were removed with the
// stage machine. `rank()` exposes the same scorer over the whole corpus for
// offline retrieval benchmarks; `locate()` is that score, windowed.
import { readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { resolveMeta } from '../corpus/meta.mjs'
import { questionTerms } from './terms.mjs'
import { rootTerm, splitWords } from '../text/morph.mjs'
import { walkFiles } from '../text/walk.mjs'
import { WINDOW_STOP } from '../text/stopwords.mjs'

function phrases(question) {
  const words = String(question ?? '').toLowerCase().match(/[a-z0-9À-ɏ.]+/g) ?? []
  const out = new Set()
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const p = words.slice(i, i + n).join(' ')
      if (p.replace(/[^a-z0-9À-ɏ]/g, '').length >= 6 && !/^(the|a|an|of|for|to|in|on|do|does|how|is|are|what|when|you|your)$/.test(p.split(' ')[0])) out.add(p)
    }
  }
  return [...out]
}

// memoized corpus index: normalize each file once per process. The cache key
// is the corpus root + each file's path/mtime/size, so a changed corpus
// re-indexes instead of serving stale scores (HK-10).
const INDEX_CACHE = new Map()
const INDEX_EXT = ['.md', '.txt', '.js', '.mjs', '.py', '.json']
function corpusIndex(corpusRoot) {
  const root = resolve(corpusRoot)
  const files = walkFiles(root, { extensions: INDEX_EXT })
  const key = root + '|' + files
    .map((abs) => {
      try { const s = statSync(abs); return `${relative(root, abs)}:${s.mtimeMs}:${s.size}` } catch { return relative(root, abs) }
    })
    .join(',')
  if (INDEX_CACHE.has(key)) return INDEX_CACHE.get(key)
  const idx = new Map()
  for (const abs of files) {
    const rel = relative(root, abs)
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    const meta = resolveMeta(root, rel, text)
    const titleWords = splitWords(rel.split('/').pop().replace(/\.\w+$/, '')) + ' ' + splitWords(meta.title)
    const heads = text.split('\n').filter((l) => /^#{1,4}\s/.test(l.trim()) || /<h[1-4][\s>]/i.test(l)).map(splitWords).join(' ')
    idx.set(rel, { rel, text, titleWords, heads, bodyNorm: splitWords(text), body: text.toLowerCase() })
  }
  INDEX_CACHE.set(key, idx)
  return idx
}

// gap-tolerant phrase check: all content words present within a window
// ("releases are supported" matches the phrase "releases supported")
function allWordsNear(text, words, span = 320) {
  if (!words.length) return false
  const low = text.toLowerCase()
  const first = low.indexOf(words[0])
  if (first < 0) return false
  for (let start = first; start >= 0; start = low.indexOf(words[0], start + 1)) {
    const window = low.slice(start, start + span)
    if (words.every((w) => window.includes(w))) return true
    if (start > 20000) break
  }
  return false
}

// the scorer: phrase evidence + IDF-weighted term coverage over every file
function scoreCorpus(corpusRoot, question) {
  const terms = questionTerms(question)
  const phr = phrases(question)
  const idx = corpusIndex(corpusRoot)
  // IDF: a term matching every file ("long" matches "belongs") is worth
  // almost nothing; rare discriminative terms carry the ranking (the f-8
  // lesson: LTS.md matched 3/4 words but lost to universal "long")
  const roots = [...new Set(terms.map(rootTerm))]
  const df = new Map()
  for (const f of idx.values()) for (const t of roots) if (f.body.includes(t)) df.set(t, (df.get(t) ?? 0) + 1)
  const idf = (t) => Math.log((idx.size + 1) / ((df.get(t) ?? 0) + 1)) + 0.4
  const scored = []
  for (const f of idx.values()) {
    const matched = terms.filter((t) => f.body.includes(rootTerm(t)))
    if (!matched.length) continue
    const contentWords = (p) => p.split(' ').filter((w) => !WINDOW_STOP.has(w))
    let phraseScore = 0
    for (const p of phr) {
      const words = contentWords(p)
      if (words.length && words.every((w) => f.titleWords.includes(w))) phraseScore += 25
      else if (words.length && words.every((w) => f.heads.includes(w))) phraseScore += 12
      else if (allWordsNear(f.bodyNorm, words)) phraseScore += 8
      else if (f.bodyNorm.includes(p)) phraseScore += 4
    }
    const termScore = matched.reduce((s, t) => s + idf(rootTerm(t)) * 3, 0)
    const coverage = matched.length
    let score = phraseScore + termScore
    score *= /\.md$/i.test(f.rel) ? 1.2 : 1
    if (/test|spec|fixture/i.test(f.rel)) score *= 0.6
    scored.push({ rel: f.rel, score, coverage, phraseScore, matched })
  }
  scored.sort((a, b) => b.score - a.score)
  return { terms, phr, scored }
}

// ---------- LOCATE: deterministic, no model ----------
export function locate(corpusRoot, question, limit = 5) {
  const { terms, phr, scored } = scoreCorpus(corpusRoot, question)
  // union strategy: phrase-top and term-top — a pure-term home must never
  // be pushed out by a phrase miss (the f-5 regression)
  const chosen = []
  const seen = new Set()
  for (const s of [...scored].sort((a, b) => b.score - a.score).slice(0, 3)) {
    chosen.push(s); seen.add(s.rel)
  }
  // the coverage window is 5 by design: the candidate room stays small
  // (the known-good composition — widening it to the full limit measurably
  // changed which extracts win and cost E3/E6, 2026-09-28)
  for (const s of [...scored].sort((a, b) => b.coverage - a.coverage).slice(0, 5)) {
    if (chosen.length >= limit) break
    if (!seen.has(s.rel)) { chosen.push(s); seen.add(s.rel) }
  }
  return { terms, phrases: phr, candidates: chosen.slice(0, limit) }
}

// Full ranking over the whole corpus (top k) — the retriever surface for
// offline benchmarks. Same score as locate(), not windowed.
export function rank(corpusRoot, question, k = 100) {
  const { scored } = scoreCorpus(corpusRoot, question)
  return scored.slice(0, k).map((s, i) => ({ rel: s.rel, score: s.score, rank: i + 1 }))
}
