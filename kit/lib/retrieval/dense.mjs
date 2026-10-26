// Dense selection — layer 0 (2026-10-05). The default retriever: embed every
// corpus file once (cached), rank by cosine to the embedded question, take the
// top-k, and hand back the same shape `selectByReference` returns
// ({ candidates, matches, method }) so the vet and the receipt are untouched.
//
// Why: on an open corpus the naming selector found both gold paragraphs 26% of
// the time vs 90% for dense (historical research notes); end-to-end 50% vs 84%.
// The index lives under <corpusRoot>/.retrieval-index/<key>.json and is keyed by
// the file list + mtimes, so a changed corpus re-embeds and an unchanged one is
// never re-asked.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { embedTexts, normalize, dot, EMBED_MODEL } from './embed.mjs'
import { mdFiles, snippetFor, selectByReference } from './window.mjs'
import { stem, splitId } from '../text/morph.mjs'
import { WINDOW_STOP as STOP } from '../text/stopwords.mjs'

const filesOf = (corpusRoot, corpus) => {
  const all = mdFiles(corpusRoot).map((p) => relative(corpusRoot, p))
  return corpus ? all.filter((f) => corpus.includes(f)) : all
}

function indexKey(corpusRoot, files) {
  const h = createHash('sha1')
  h.update(EMBED_MODEL + '|' + files.join('\n'))
  for (const rel of files) {
    try { const s = statSync(join(resolve(corpusRoot), rel)); h.update(`${s.mtimeMs}:${s.size};`) } catch { /* gone */ }
  }
  return h.digest('hex').slice(0, 16)
}

// embed the corpus once; reuse the cache unless a file changed.
export async function denseIndex(corpusRoot, files, { _embed } = {}) {
  const key = indexKey(corpusRoot, files)
  const dir = join(resolve(corpusRoot), '.retrieval-index')
  const path = join(dir, `${key}.json`)
  if (existsSync(path)) {
    try { const j = JSON.parse(readFileSync(path, 'utf8')); if (j.files && j.files.length === files.length && j.df) return j } catch { /* rebuild */ }
  }
  const embed = _embed ?? ((texts) => embedTexts(texts))
  const texts = []
  const df = {} // document frequency per stem — feeds the same IDF snippet the reference selector uses
  for (const rel of files) {
    const content = readFileSync(join(resolve(corpusRoot), rel), 'utf8')
    texts.push(`search_document: ${rel.replace(/\.md$/i, '').replace(/[_/]+/g, ' ')}\n${content}`)
    for (const s of new Set(splitId(content.toLowerCase()).split(/\s+/).map(stem).filter(Boolean))) df[s] = (df[s] ?? 0) + 1
  }
  const vectors = (await embed(texts)).map(normalize)
  const j = { model: EMBED_MODEL, files, vectors, df }
  try { mkdirSync(dir, { recursive: true }); writeFileSync(path, JSON.stringify(j)) } catch { /* read-only corpus: keep in memory */ }
  return j
}

function questionWeights(question, df, n) {
  const words = splitId(question).toLowerCase().replace(/'s\b/g, '').replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w))
  // IDF like the reference selector: a rare question term outweighs a
  // ubiquitous one, so the vet's snippet shows the line that answers.
  return [...new Set(words.map(stem))].map((s) => [s, Math.log((n + 1) / ((df[s] ?? 0) + 1)) + 1])
}

export async function selectByDense(corpusRoot, question, opts = {}) {
  const files = filesOf(corpusRoot, opts.corpus)
  if (!files.length) return { candidates: [], matches: [], method: 'dense' }
  const idx = await denseIndex(corpusRoot, files, { _embed: opts._embed })
  const embed = opts._embed ?? ((texts) => embedTexts(texts))
  const qv = normalize((await embed([`search_query: ${question}`]))[0])
  const k = opts.k ?? (Number(process.env.RETRIEVAL_K) || 6)
  const scored = idx.files
    .map((rel, i) => ({ rel, s: dot(idx.vectors[i], qv) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
  const weights = questionWeights(question, idx.df ?? {}, idx.files.length)
  const matches = scored.map(({ rel }) => {
    const content = readFileSync(join(resolve(corpusRoot), rel), 'utf8')
    return { rel, matched: 'dense', snippet: snippetFor(content, weights) }
  })
  return { candidates: scored.map(({ rel }) => ({ rel })), matches, method: 'dense' }
}

// BM25 (lexical) — a rare discriminative term ("LSF") that cosine blurs on a
// homogeneous corpus is exactly what BM25 weights. Ported from bench/lib/rank.
const tokenize = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
function bm25Rank(texts, q, k1 = 1.2, b = 0.75) {
  const docs = texts.map(tokenize)
  const avgdl = (docs.reduce((a, d) => a + d.length, 0) / (docs.length || 1)) || 1
  const df = new Map()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length
  return docs.map((d, i) => {
    const tf = new Map()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let s = 0
    for (const t of new Set(tokenize(q))) if (df.has(t)) s += Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5)) * ((tf.get(t) ?? 0) * (k1 + 1)) / ((tf.get(t) ?? 0) + k1 * (1 - b + b * d.length / avgdl))
    return { i, s }
  }).sort((a, c) => c.s - a.s).map((x) => x.i)
}
const rrf = (lists, k = 60) => {
  const sc = new Map()
  for (const list of lists) list.forEach((id, i) => sc.set(id, (sc.get(id) ?? 0) + 1 / (k + i + 1)))
  return [...sc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

// Dense + BM25, fused with RRF (reciprocal rank fusion). The single-approach
// candidate: dense's open-corpus recall + BM25's rare-term precision.
export async function selectFuse(corpusRoot, question, opts = {}) {
  const files = filesOf(corpusRoot, opts.corpus)
  if (!files.length) return { candidates: [], matches: [], method: 'fuse' }
  const idx = await denseIndex(corpusRoot, files, { _embed: opts._embed })
  const embed = opts._embed ?? ((texts) => embedTexts(texts))
  const qv = normalize((await embed([`search_query: ${question}`]))[0])
  const denseOrder = idx.vectors.map((v, i) => [i, dot(v, qv)]).sort((a, b) => b[1] - a[1]).map(([i]) => i)
  const texts = idx.files.map((rel) => readFileSync(join(resolve(corpusRoot), rel), 'utf8'))
  const fused = rrf([bm25Rank(texts, question), denseOrder])
  const k = opts.k ?? (Number(process.env.RETRIEVAL_K) || 6)
  const weights = questionWeights(question, idx.df ?? {}, idx.files.length)
  const matches = fused.slice(0, k).map((i) => {
    const rel = idx.files[i]
    return { rel, matched: 'fuse', snippet: snippetFor(readFileSync(join(resolve(corpusRoot), rel), 'utf8'), weights) }
  })
  return { candidates: matches.map(({ rel }) => ({ rel })), matches, method: 'fuse' }
}

// Union — dense (general) + reference (precise, cheap). Both retriever's
// candidates are merged, deduped, reference first, capped at k. The precision
// of the naming selector on a homogeneous named corpus AND the recall of dense
// on an open one, for the cost of a file scan plus one embed call — both
// dwarfed by the answer call. Neither alone passes both regimes (bench §Rung 1,
// §dense on the Confluence battery).
export async function selectUnion(corpusRoot, question, opts = {}) {
  const k = opts.k ?? (Number(process.env.RETRIEVAL_K) || 6)
  const ref = selectByReference(corpusRoot, question, { corpus: opts.corpus })
  const den = await selectByDense(corpusRoot, question, { corpus: opts.corpus, _embed: opts._embed, k })
  const r = ref.candidates.map((c) => c.rel)
  const d = den.candidates.map((c) => c.rel)
  // INTERLEAVE ref and dense round-robin — a plain concatenation would let one
  // side's 6 fill the window and crowd the other out (reference's lexical set on
  // an open corpus, or dense's on a named one). Alternating reserves slots for both.
  const rels = []
  const seen = new Set()
  for (let i = 0; rels.length < k && i < Math.max(r.length, d.length); i++) {
    for (const rel of [r[i], d[i]]) {
      if (rel && !seen.has(rel)) { seen.add(rel); rels.push(rel) }
      if (rels.length >= k) break
    }
  }
  const matchOf = new Map([...ref.matches, ...den.matches].map((m) => [m.rel, m]))
  const matches = rels.map((rel) => matchOf.get(rel) ?? { rel, matched: 'union', snippet: '' })
  return { candidates: rels.map((rel) => ({ rel })), matches, method: 'union' }
}
