// §3.5 trap #2 (extraction epic, Finding "Two traps"): the shipped claim
// "16% marked verified — every one of them wrong" [recomputed] derives from
// `oracle_correct`/`reader_correct` that `hotpot-fresh.mjs:101` FORCES to 0
// for every answered partial/unanswerable row — those rows were never asked
// of the accuracy oracle. Same strict-verdict split as the §3.4 pre-audit,
// run over `unified.jsonl` rows with questions joined from the OFFLINE
// HotpotQA cache (refuses to fetch — the cache is the only accepted source).
//
//   node bench/audit-hotpot-split.mjs            # b108 (the §3.5 run)
//   RUN=b95-hotpot-fresh-4b-kimi node ...        # any run, same trap class
//   RUN=b102-hotpot-fresh-deepseek STATE=unverified node ...
//     # the §3.2 flag rows: the same forced-0 class in the unverified state
//     # (flagged answers — "mostly catches" needs a correctness read)
//
// Output per cell: construction = the forced-0 label was the bug (answer
// actually correct), genuine = answer actually wrong (real false accept).

import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CACHE } from './ingest.mjs'
import { oracleVerdict, classifyAudit, AUDIT_CONDITIONS } from './audit-classify.mjs'

const CACHE_FILE = join(CACHE, 'hotpot-distractor-dev-600.json')

export function selectHotpotAudit (rows, runId, state = 'verified') {
  return rows.filter(r =>
    r.run_id === runId &&
    AUDIT_CONDITIONS.includes(r.condition) &&
    r.state === state &&
    Boolean(r.answer) && r.answer !== 'NOT FOUND')
}

export function joinQuestions (recs, cacheRows) {
  const byId = new Map(cacheRows.map(r => [r.id, r]))
  const missing = recs.filter(r => !byId.has(r.id)).map(r => r.id)
  if (missing.length) throw new Error(`hotpot cache misses ${missing.length} ids: ${missing.slice(0, 5).join(', ')}`)
  return recs.map(r => ({ ...r, question: byId.get(r.id).question }))
}

const loadJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []

async function main () {
  const runId = process.env.RUN ?? 'b108-hotpot-fresh-partial-4b'
  const state = process.env.STATE ?? 'verified'
  const out = process.env.OUT ?? `bench/results/audit-hotpot-${runId.split('-')[0]}.jsonl`
  if (!existsSync(CACHE_FILE)) { console.error(`refusing to run: offline cache missing (${CACHE_FILE}) — this audit never fetches`); process.exit(1) }
  const recs = joinQuestions(selectHotpotAudit(loadJsonl(process.env.UNIFIED ?? 'unified.jsonl'), runId, state), JSON.parse(readFileSync(CACHE_FILE, 'utf8')))
  const done = new Set(loadJsonl(out).map(r => `${r.id}|${r.condition}`))
  console.log(`${runId} [state=${state}]: ${recs.length} claim-bearing rows (${recs.filter(r => done.has(r.id + '|' + r.condition)).length} already classified)`)
  let calls = 0
  for (const r of recs) {
    const key = `${r.id}|${r.condition}`
    if (done.has(key)) continue
    let correct
    try { correct = await oracleVerdict(r.question, r.gold_answer, r.answer) } catch (e) { console.error(`failed at ${key}: ${e.message}`); process.exit(1) }
    appendFileSync(out, JSON.stringify({
      run_id: runId, id: r.id, condition: r.condition, state: r.state, score: r.score,
      quote_in_gold: r.quote_in_gold, judge_correct: correct ? 1 : 0,
      class: classifyAudit(correct), gold: r.gold_answer, question: r.question, answer: r.answer,
    }) + '\n')
    calls++
  }
  const all = loadJsonl(out)
  console.log(`\n=== ${out} (${all.length} classified, ${calls} oracle calls this pass) ===`)
  const groups = new Map()
  for (const r of all) {
    const k = `${r.condition}/${r.state ?? 'verified'}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  for (const [k, g] of groups) {
    const c = g.filter(r => r.class === 'construction').length
    console.log(k.padEnd(30), `n=${g.length}`, `construction=${c}`, `genuine=${g.length - c}`)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
