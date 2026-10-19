// Shared lexical + hybrid ranking for the long-doc bench probes. BM25 and
// RRF are pure; hybridRank needs the local embedder (dense.mjs).
import { embedAll, normalize } from './dense.mjs'

export const tokenize = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function bm25Rank(texts, q, k1 = 1.2, b = 0.75) {
  const docs = texts.map(tokenize)
  const avgdl = mean(docs.map((d) => d.length)) || 1
  const df = new Map(); for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length
  return docs.map((d, i) => {
    const tf = new Map(); for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let s = 0
    for (const t of new Set(tokenize(q))) if (df.has(t)) s += Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5)) * ((tf.get(t) ?? 0) * (k1 + 1)) / ((tf.get(t) ?? 0) + k1 * (1 - b + b * d.length / avgdl))
    return { i, s }
  }).sort((a, b2) => b2.s - a.s).map((x) => x.i)
}

export const rrf = (lists, k = 60) => {
  const sc = new Map()
  for (const list of lists) list.forEach((id, i) => sc.set(id, (sc.get(id) ?? 0) + 1 / (k + i + 1)))
  return [...sc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

// RRF of BM25 and dense cosine over `texts`, ranked. Needs the local embedder.
export async function hybridRank(texts, query, { batch = 16 } = {}) {
  const bm = bm25Rank(texts, query)
  const dv = (await embedAll(texts.map((x) => `search_document: ${x}`), { batch })).map(normalize)
  const qv = normalize((await embedAll([`search_query: ${query}`], { batch: 1 }))[0])
  const dense = dv.map((v, i) => [i, v.reduce((a, x, j) => a + x * qv[j], 0)]).sort((a, b) => b[1] - a[1]).map(([i]) => i)
  return rrf([bm, dense])
}
