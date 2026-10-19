// HotpotQA (distractor, validation) ingestion for Tier B. Paginated from the
// HuggingFace datasets-server (JSON rows — no parquet), cached under
// bench/.cache. Each row: question, answer, context (10 paragraphs),
// supporting_facts (the paragraphs that support the answer).
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE } from './ingest.mjs'

const SRC = 'https://datasets-server.huggingface.co/rows?dataset=hotpotqa%2Fhotpot_qa&config=distractor&split=validation'

export async function hotpotRows(n) {
  const cache = join(CACHE, `hotpot-distractor-dev-${n}.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const out = []
  for (let offset = 0; offset < n; offset += 100) {
    const length = Math.min(100, n - offset)
    const res = await fetch(`${SRC}&offset=${offset}&length=${length}`)
    if (!res.ok) throw new Error(`hotpot: HTTP ${res.status}`)
    const j = await res.json()
    if (!Array.isArray(j.rows)) throw new Error('hotpot: no rows — ' + JSON.stringify(j).slice(0, 160))
    out.push(...j.rows.map((r) => r.row))
  }
  writeFileSync(cache, JSON.stringify(out))
  return out
}
