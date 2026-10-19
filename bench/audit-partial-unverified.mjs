// Unverified-shown partial audit — the missing half of the discrimination
// table. The §3.4 pre-audit classified only state=verified rows; the gate's
// claim to be informative on strong readers' partials needs the other shown
// bucket too: if `unverified` partials are mostly WRONG while `verified`
// ones are mostly correct (deepseek 27/34), the sufficiency score separates
// on partials — the "inert for strong readers" reading would be too coarse.
// Same strict oracle as audit-classify (oracleVerdict); key includes state
// so a verified and an unverified row of the same id never collide.
//
//   node bench/audit-partial-unverified.mjs
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { oracleVerdict } from './audit-classify.mjs'
import { opencodeKey } from './lib/auth.mjs'

export const ARMS = [
  { arm: '4b-local', file: 'bench/results/cr-private-run-4b.jsonl' },
  { arm: 'deepseek', file: 'bench/results/cr-private-run-dsv41.jsonl' },
]
export const QUESTIONS = 'bench/results/private-questions.jsonl'

// The unverified-shown set: partial condition, gate said unverified (shown
// but flagged), the reader actually produced an answer (abstentions and parse
// failures land in not_found and are not shown).
export function selectUnverified (recs) {
  return recs.filter(r =>
    r.condition === 'partial' &&
    r.state === 'unverified' &&
    Boolean(r.answer) && r.answer !== 'NOT FOUND')
}

const loadJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []

async function main () {
  if (!opencodeKey(process.env.HOME)) { console.error('refusing to run: no opencode-go key — the oracle cannot label'); process.exit(1) }
  const out = process.env.OUT ?? 'bench/results/audit-partial-unverified.jsonl'
  const qs = new Map(loadJsonl(QUESTIONS).map(q => [q.id, q]))
  const done = new Set(loadJsonl(out).map(r => `${r.arm}|${r.id}|${r.condition}|${r.state}`))
  let calls = 0
  for (const { arm, file } of ARMS) {
    const recs = selectUnverified(loadJsonl(file))
    console.log(`${arm}: ${recs.length} unverified-shown partial records (${file})`)
    for (const r of recs) {
      const key = `${arm}|${r.id}|${r.condition}|${r.state}`
      if (done.has(key)) continue
      const q = qs.get(r.id)
      if (!q) { console.error(`failed at ${key}: question missing from ${QUESTIONS}`); process.exit(1) }
      let correct
      try { correct = await oracleVerdict(q.question, q.answer, r.answer) } catch (e) { console.error(`failed at ${key}: ${e.message}`); process.exit(1) }
      appendFileSync(out, JSON.stringify({
        arm, id: r.id, condition: r.condition, state: r.state, score: r.score,
        hops_missing: r.hops_missing, judge_correct: correct ? 1 : 0,
        gold: q.answer, answer: r.answer,
      }) + '\n')
      calls++
    }
  }
  const all = loadJsonl(out)
  console.log(`\n=== ${out} (${all.length} classified, ${calls} oracle calls this pass) ===`)
  console.log(['arm', 'n', 'correct', 'wrong', 'acc%'].map(s => s.padEnd(10)).join(''))
  for (const { arm } of ARMS) {
    const g = all.filter(r => r.arm === arm)
    if (!g.length) continue
    const c = g.filter(r => r.judge_correct === 1).length
    console.log([arm, String(g.length), String(c), String(g.length - c), (100 * c / g.length).toFixed(1)].map(s => s.padEnd(10)).join(''))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
