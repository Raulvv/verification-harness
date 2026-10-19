// Qasper (allenai/qasper, validation) ingestion for the long-doc bench.
// Paginated from the HuggingFace datasets-server (JSON rows — no parquet),
// cached under bench/.cache. Emits one record per QUESTION:
//   { paperId, title, question, gold, evidence[], doc: [{ section, text }] }
// where `gold` is the extractive span(s) (or the free-form answer) and
// `evidence` are the gold evidence paragraphs. Robust to the server's nested
// answer wrapping.
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CACHE = join(HERE, '.cache')
const SRC = 'https://datasets-server.huggingface.co/rows?dataset=allenai%2Fqasper&config=qasper&split=validation'

function findAnswerObj(o) {
  if (!o || typeof o !== 'object') return null
  if ('unanswerable' in o || 'extractive_spans' in o || 'free_form_answer' in o) return o
  for (const v of Object.values(o)) { const r = findAnswerObj(v); if (r) return r }
  return null
}

function docOf(row) {
  const ft = row.full_text ?? {}
  const names = ft.section_name ?? []
  const paras = ft.paragraphs ?? []
  const doc = []
  for (let i = 0; i < names.length; i++) {
    const secParas = (paras[i] ?? []).filter(Boolean)
    if (!secParas.length) continue
    doc.push({ section: names[i] || `Section ${i + 1}`, text: secParas.join('\n\n') })
  }
  return doc
}

export async function qasperQuestions(maxPapers = 100) {
  const cache = join(CACHE, `qasper-dev-${maxPapers}.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  mkdirSync(CACHE, { recursive: true })
  const rows = []
  for (let offset = 0; offset < maxPapers; offset += 100) {
    const length = Math.min(100, maxPapers - offset)
    const res = await fetch(`${SRC}&offset=${offset}&length=${length}`)
    if (!res.ok) throw new Error(`qasper: HTTP ${res.status}`)
    const j = await res.json()
    if (!Array.isArray(j.rows)) throw new Error('qasper: no rows — ' + JSON.stringify(j).slice(0, 160))
    rows.push(...j.rows.map((r) => r.row))
  }
  const out = []
  for (const row of rows) {
    const doc = docOf(row)
    if (!doc.length) continue
    const qs = row.qas?.question ?? []
    const ansContainers = row.qas?.answers ?? []
    for (let i = 0; i < qs.length; i++) {
      const a = findAnswerObj(ansContainers[i])
      if (!a) continue
      if (a.unanswerable) continue
      const gold = (Array.isArray(a.extractive_spans) && a.extractive_spans.length ? a.extractive_spans.join('; ') : '') || String(a.free_form_answer ?? '').trim()
      if (!gold) continue
      const evidence = (Array.isArray(a.evidence) ? a.evidence : []).filter(Boolean)
      out.push({ paperId: row.id, title: row.title, abstract: String(row.abstract ?? '').trim(), question: qs[i], gold, evidence, doc })
    }
  }
  writeFileSync(cache, JSON.stringify(out))
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const qs = await qasperQuestions(Number(process.argv[2] ?? 100))
  const docs = qs.map((q) => q.doc.reduce((s, d) => s + d.text.length, 0))
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
  console.log(`qasper: ${qs.length} questions · mean doc ${Math.round(mean(docs))} chars · mean sections ${mean(qs.map((q) => q.doc.length)).toFixed(1)} · with evidence ${qs.filter((q) => q.evidence.length).length}`)
  console.log('sample:', JSON.stringify({ q: qs[0].question, gold: qs[0].gold, ev: qs[0].evidence[0]?.slice(0, 80), sections: qs[0].doc.length }))
}
