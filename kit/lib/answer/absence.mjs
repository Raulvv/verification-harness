// D-absence: when the harness abstains or claims a fact is absent, decompose the
// question into atomic facts, search the FULL corpus for each, and re-read with
// any counter-document found. This verifies absence claims; the gate verifies
// presence claims. Shared by the CLI default and the benchmark.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rank } from '../retrieval/locate.mjs'
import { leadAbstain } from '../receipts/text.mjs'

export const ABSENCE_RE = /not (?:stated|provided|included|listed|available|covered)|(?:does|do) not (?:state|provide|include|list|contain|specify|give)|no (?:record|data|information|mention|pay|salary|wage|figure|value)|(?:only|just) (?:one|two|three|four|\d+) [^.]*(?:have|has|are|is)|cannot be (?:determined|calculated|computed|confirmed|completed|made|ranked)/i

export const shouldRunAbsence = (text) => leadAbstain(text) || ABSENCE_RE.test(text)

export const FACTS_SCHEMA = {
  type: 'object',
  properties: { facts: { type: 'array', items: { type: 'object', properties: { entity: { type: 'string' }, attribute: { type: 'string' } }, required: ['entity', 'attribute'] } } },
  required: ['facts'],
}

export const PROMPT_FACTS = (q) => [
  'Extract every entity the question names — occupation, person, place, organization, date, or metric — and for each, the attribute asked about it.',
  'Do not answer the question. One fact per entity.',
  'Return ONLY JSON: {"facts":[{"entity":"<entity>","attribute":"<attribute>"}]}',
  'Question: ' + q,
].join('\n')

const normText = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// chat: the reader's chat call (facts extraction). read(docs): the same
// D pipeline over a document window, returning { text, gate, usage, tokens, ms }.
// Returns the fixed result (or null), the absence metadata and the facts usage.
export async function runAbsence({ question, docs = [], corpusRoot, chat, read, docChars = 20000 }) {
  const t0 = Date.now()
  let facts = []
  let usage = null
  try {
    const fr = await chat([{ role: 'user', content: PROMPT_FACTS(question) }], { format: FACTS_SCHEMA, maxTokens: 300 })
    usage = fr.usage ?? null
    const txt = String(fr.content ?? '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    facts = (JSON.parse(txt).facts ?? []).filter((f) => f && (f.entity || f.attribute))
  } catch { /* fall back to the question as one fact */ }
  if (!facts.length) facts = [{ entity: '', attribute: question }]

  const seen = new Set(docs.map((x) => x.rel))
  const qn = normText(question)
  const candidates = []
  for (const f of facts) {
    const ent = normText(f.entity)
    // drop entities the question does not actually name (model drift)
    if (ent && !qn.includes(ent)) continue
    const attrWords = normText(f.attribute).split(' ').filter((w) => w.length >= 4)
    const q = `${f.entity ?? ''} ${f.attribute ?? ''}`.trim() || question
    for (const hit of rank(corpusRoot, q, 20)) {
      if (seen.has(hit.rel) || !/\.md$/i.test(hit.rel)) continue
      let content = ''
      try { content = readFileSync(join(corpusRoot, hit.rel), 'utf8') } catch { continue }
      const cn = normText(content.slice(0, 20000))
      const hasEntity = ent ? cn.includes(ent) : true
      const hasAttr = attrWords.length ? attrWords.some((w) => cn.includes(w)) : true
      if (!hasEntity || !hasAttr) continue
      seen.add(hit.rel)
      candidates.push(hit.rel)
      break
    }
  }

  const limit = Number.isFinite(docChars) && docChars > 0 ? docChars : Infinity
  const extra = candidates.slice(0, 2).map((rel) => {
    let content = ''
    try { content = readFileSync(join(corpusRoot, rel), 'utf8').slice(0, limit) } catch { /* unreadable */ }
    return { rel, content }
  }).filter((d) => d.content)
  const absence = { triggered: true, facts: facts.length, candidates, fixed: false }
  let fixed = null
  if (extra.length) {
    try {
      const r = await read([...docs, ...extra])
      if (r?.gate?.mechanicalPass && !leadAbstain(r.text)) {
        fixed = r
        absence.fixed = true
      }
    } catch { /* the re-read failed; keep the first answer and the absence meta */ }
  }
  return { fixed, absence, usage, ms: Date.now() - t0 }
}
