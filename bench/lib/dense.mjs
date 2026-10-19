// Dense retrieval support — embeddings via a local Ollama model, cached to
// disk so the bench embeds a corpus once. No network beyond localhost.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434'

async function embedBatch(model, input) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input }),
  })
  if (!res.ok) throw new Error(`embed: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 120))}`)
  const j = await res.json()
  if (!Array.isArray(j.embeddings)) throw new Error('embed: no embeddings in response')
  return j.embeddings
}

export async function embedAll(texts, { model = 'nomic-embed-text', batch = 64, cache } = {}) {
  if (cache && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const out = []
  for (let i = 0; i < texts.length; i += batch) {
    out.push(...(await embedBatch(model, texts.slice(i, i + batch))))
    if (i % (batch * 10) === 0) process.stdout.write(`  embedded ${Math.min(i + batch, texts.length)}/${texts.length}\r`)
  }
  process.stdout.write('\n')
  if (cache) writeFileSync(cache, JSON.stringify(out))
  return out
}

export const normalize = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
