// Dense selection (2026-10-05): embed every corpus file once (cached), rank by
// cosine to the embedded question, take the top-k, and hand back the same shape
// `selectByReference` returns ({ candidates, matches, method }) so the vet and
// the receipt are untouched. The `dense`/`router` retrievers opt into this; the
// shipped default is the embedder-free `reference` selector.
//
// Why dense exists: on an open corpus the naming selector found both gold
// paragraphs 26% of the time vs 90% for dense (historical research notes);
// end-to-end 50% vs 84%. The index lives under
// <corpusRoot>/.retrieval-index/<key>.json and is keyed by the file list +
// mtimes, so a changed corpus re-embeds and an unchanged one is never re-asked.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { embedTexts, normalize, dot, EMBED_MODEL } from './embed.mjs'
import { mdFiles, snippetFor } from './window.mjs'
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
