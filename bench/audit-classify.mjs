// §3.4 private hand-audit pre-classifier — extraction epic Phase 2b.
//
// The two clean-room reader runs label every answered partial/unanswerable
// record `reader_correct=0` BY CONSTRUCTION (private-run.mjs:91 never asks),
// so the "verified but all wrong" counts mix two very different things:
//   - genuine: the shown answer is actually wrong (reader confabulated or
//     the judge rubber-stamped an admitted partial);
//   - construction: the shown answer is actually CORRECT — the question was
//     answerable from the surviving window (partial) or from a distractor
//     (unanswerable), i.e. the generator's hop requirement was violated.
// HotpotQA taught the same lesson (B96: 11/15 "false accepts" were artifacts
// of gold-paragraph removal). This pass asks the deepseek accuracy oracle
// once per claim-bearing record — a single sequential pass, no sweeps — and
// writes the (a)/(b) split that the §3.4 hand audit verifies.

import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { judgePrompt } from './lib/judge.mjs'
import { opencodeKey } from './lib/auth.mjs'

export const AUDIT_CONDITIONS = ['partial', 'unanswerable']

// Claim-bearing set: the records §3.4/§3.5 make "every one of them wrong"
// claims about — answered (state verified implies the reader produced an
// answer), non-answerable conditions only.
export function selectAudit (recs) {
  return recs.filter(r =>
    AUDIT_CONDITIONS.includes(r.condition) &&
    r.state === 'verified' &&
    Boolean(r.answer) && r.answer !== 'NOT FOUND')
}

export function classifyAudit (oracleCorrect) {
  return oracleCorrect ? 'construction' : 'genuine'
}

const ARMS = [
  { arm: '4b-local', file: 'bench/results/cr-private-run-4b.jsonl' },
  { arm: 'deepseek', file: 'bench/results/cr-private-run-dsv41.jsonl' },
]
const QUESTIONS = 'bench/results/private-questions.jsonl'

// Strict parse: the classification of a 107-row audit is too consequential
// for the loose `/\byes\b/` on content-OR-reasoning match that the run-time
// oracle uses — a 500-token reasoning stream that gets cut off mid-deliberation
// (content empty, reasoning containing a hypothetical "yes") was silently
// labeling wrong answers "correct". Content only, last non-empty line, exact
// word, and an empty content after retry fails loud.
export const parseVerdict = (content) => {
  const lines = String(content ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const last = lines.at(-1) ?? ''
  if (/^yes\.?$/i.test(last)) return true
  if (/^no\.?$/i.test(last)) return false
  return null
}

export async function oracleVerdict (question, gold, ans, home = process.env.HOME) {
  const key = opencodeKey(home)
  if (!key) throw new Error('audit oracle: no opencode-go key (auth.json missing)')
  let lastContent = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) },
      body: JSON.stringify({ model: 'deepseek-v4.1-flash', max_tokens: 1500, temperature: 0, messages: [{ role: 'user', content: judgePrompt(question, gold, ans) }] }),
    })
    const j = await r.json()
    if (!r.ok || !j.choices?.[0]?.message) throw new Error(`audit oracle: HTTP ${r.status} — refusing to classify on a failed call`)
    lastContent = j.choices[0].message.content ?? ''
    const v = parseVerdict(lastContent)
    if (v !== null) return v
  }
  throw new Error(`audit oracle: no YES/NO verdict after retry (content: ${JSON.stringify(lastContent.slice(0, 200))})`)
}

const loadJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []

async function main () {
  if (!opencodeKey(process.env.HOME)) { console.error('refusing to run: no opencode-go key — the §3.4 oracle pass cannot label'); process.exit(1) }
  const out = process.env.OUT ?? 'bench/results/audit-classify.jsonl'
  const qs = new Map(loadJsonl(QUESTIONS).map(q => [q.id, q]))
  const done = new Set(loadJsonl(out).map(r => `${r.arm}|${r.id}|${r.condition}`))
  let calls = 0
  for (const { arm, file } of ARMS) {
    const recs = selectAudit(loadJsonl(file))
    console.log(`${arm}: ${recs.length} claim-bearing records (${file})`)
    for (const r of recs) {
      const key = `${arm}|${r.id}|${r.condition}`
      if (done.has(key)) continue
      const q = qs.get(r.id)
      if (!q) { console.error(`failed at ${key}: question missing from ${QUESTIONS}`); process.exit(1) }
      let correct
      try { correct = await oracleVerdict(q.question, q.answer, r.answer) } catch (e) { console.error(`failed at ${key}: ${e.message}`); process.exit(1) }
      appendFileSync(out, JSON.stringify({
        arm, id: r.id, condition: r.condition, score: r.score,
        hops_missing: r.hops_missing, judge_correct: correct ? 1 : 0,
        class: classifyAudit(correct), gold: q.answer, answer: r.answer,
      }) + '\n')
      calls++
    }
  }
  const all = loadJsonl(out)
  console.log(`\n=== ${out} (${all.length} classified, ${calls} oracle calls this pass) ===`)
  const header = ['arm', 'condition', 'n', 'construction', 'genuine'].map(s => s.padEnd(14)).join('')
  console.log(header)
  for (const { arm } of ARMS) for (const condition of AUDIT_CONDITIONS) {
    const g = all.filter(r => r.arm === arm && r.condition === condition)
    if (!g.length) continue
    const c = g.filter(r => r.class === 'construction').length
    console.log([arm, condition, String(g.length), String(c), String(g.length - c)].map(s => s.padEnd(14)).join(''))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
