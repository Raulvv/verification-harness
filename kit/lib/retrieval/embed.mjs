// Local embeddings for dense selection (layer 0). Vectors come from a local
// Ollama model (`nomic-embed-text` by default) — no network beyond localhost.
// L2-normalized, so a dot product IS cosine. One place that talks to the
// embedder; the caller owns caching.
const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434'
export const EMBED_MODEL = process.env.RETRIEVAL_EMBED_MODEL ?? 'nomic-embed-text'

async function embedBatch(model, input) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input }),
  })
  if (!res.ok) throw new Error(`embed: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`)
  const j = await res.json()
  if (!Array.isArray(j.embeddings)) throw new Error('embed: no embeddings in response')
  return j.embeddings
}

export async function embedTexts(texts, { model = EMBED_MODEL, batch = 64 } = {}) {
  const out = []
  for (let i = 0; i < texts.length; i += batch) out.push(...(await embedBatch(model, texts.slice(i, i + batch))))
  return out
}

export const normalize = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

export const dot = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
