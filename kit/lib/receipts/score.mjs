// Mechanical traceability scoring — two points per item: **path** (does the
// answer cite the source document?) and **quote** (does the answer carry a
// byte-verbatim quote at the source it names?). Correctness is judged
// elsewhere (cross-family models), never substring-matched here.
// 2026-09-30: not-found items are plain abstentions — the abstention IS the
// whole answer; a stray citation an abstention still claims must trace.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evidenceMatches, parseAnswer, ABSTAIN_TERMS, quoteInText } from './text.mjs'

export function scoreItem(item, answer, corpusRoot = process.cwd()) {
  const low = (answer ?? '').toLowerCase()
  const abstained = ABSTAIN_TERMS.some((m) => low.includes(m))
  // not-found: the abstention IS the whole answer. Any citation an abstention
  // still claims must trace (anti-fabrication); a clean abstention has no legs.
  if (item.not_found) {
    if (!abstained) return { path: false, quote: false, points: 0 }
    const { source, quote } = parseAnswer(answer)
    const legs = quote.split(/\s+\|\s+/).map((s) => s.trim()).filter((s) => s && !/^not found$/i.test(s))
    const homes = [...new Set(source.split(/\s+\|\s+/)
      .map((s) => (/·\s*(\S+)\s*$/.exec(s)?.[1] ?? '').replace(/:\d+(-\d+)?$/, ''))
      .filter(Boolean))]
    const traceable = !legs.length || (homes.length > 0 && legs.every((leg) => homes.some((home) => {
      try { return evidenceMatches(readFileSync(join(corpusRoot, home), 'utf8'), leg) } catch { return false }
    })))
    return { path: traceable, quote: traceable, points: traceable ? 2 : 0 }
  }
  const pathHitOne = (c) => low.includes(c.path.replace(/:\d+(-\d+)?$/, '').toLowerCase())
  const answerQuoteLegs = parseAnswer(answer).quote.split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean)
  const quoteHitOne = (c) => {
    if (quoteInText(answer, c.quote)) return true
    const claimed = c.path.replace(/:\d+(-\d+)?$/, '')
    try {
      return answerQuoteLegs.some((leg) => evidenceMatches(readFileSync(join(corpusRoot, claimed), 'utf8'), leg))
    } catch { return false }
  }
  const groups = item.candidates_groups?.length ? item.candidates_groups : [item.candidates ?? []]
  const pathHit = groups.some((g) => g.length) && groups.every((g) => g.some(pathHitOne))
  const quoteHit = groups.some((g) => g.length) && groups.every((g) => g.some(quoteHitOne))
  return { path: pathHit, quote: quoteHit, points: (pathHit ? 1 : 0) + (quoteHit ? 1 : 0) }
}

export function scoreAll(items, results, corpusRoot) {
  const rows = items.map((item) => {
    const r = results.find((x) => x.id === item.id) ?? {}
    return { ...scoreItem(item, r.text, corpusRoot), id: item.id, asked_by: item.asked_by ?? 'seed', ms: r.ms ?? 0, error: r.error ?? null }
  })
  const sum = (xs) => xs.reduce((a, b) => a + b, 0)
  const groups = {}
  for (const r of rows) (groups[r.asked_by] ??= []).push(r)
  const line = (label, xs) =>
    `${(label + ' (' + xs.length + ')').padEnd(18)} ${sum(xs.map((r) => r.points))}/${xs.length * 2}  (path ${xs.filter((r) => r.path).length}/${xs.length} · quote ${xs.filter((r) => r.quote).length}/${xs.length})`
  return {
    rows,
    groups: Object.fromEntries(Object.entries(groups).map(([k, xs]) => [k, line(k.toUpperCase(), xs)])),
    total: line('TOTAL', rows),
    points: sum(rows.map((r) => r.points)),
    max: rows.length * 2,
  }
}
