#!/usr/bin/env node
// Robust accuracy oracle: judge each answered answerable with TWO judges, each
// forced to a strict {correct: boolean} schema; report agreement, per-judge
// accuracy, and the CONSENSUS (both YES) accuracy. Tests whether the noisy
// single-judge oracle is fixable.
import { readFileSync } from 'node:fs'
import { hotpotRows } from './ingest-hotpot.mjs'

const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const SCHEMA = { type: 'object', properties: { correct: { type: 'boolean' } }, required: ['correct'], additionalProperties: false }
const PROMPT = (q, gold, ans) => ['Is the SYSTEM ANSWER a correct answer to the QUESTION, given the GOLD answer?', 'YES if it gives the same answer (wording may differ; a less-specific but correct answer counts).', 'NO if different, contradictory, or does not answer.', 'QUESTION: ' + q, 'GOLD: ' + gold, 'SYSTEM ANSWER: ' + ans].join('\n')
async function judge(model, q, gold, ans) {
  const res = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) },
    body: JSON.stringify({ model, max_tokens: 400, temperature: 0, response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema: SCHEMA } }, messages: [{ role: 'user', content: PROMPT(q, gold, ans) }] }),
  })
  const m = (await res.json()).choices?.[0]?.message ?? {}
  try { return JSON.parse(m.content).correct ? 1 : 0 } catch { return null }
}
const A = process.env.J1 ?? 'kimi-k3', B = process.env.J2 ?? 'deepseek-v4.1-flash'
const r = readFileSync('bench/results/hotpot-fresh-301-600.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
const ans = r.filter((x) => x.condition === 'answerable' && x.reader_abstained === 0)
let aC = 0, bC = 0, both = 0, bothN = 0, agree = 0, n = 0, nan = 0
for (const x of ans) {
  const row = byId.get(x.id)
  const a = await judge(A, row.question, row.answer, x.answer)
  const b = await judge(B, row.question, row.answer, x.answer)
  if (a == null || b == null) { nan++; continue }
  n++; aC += a; bC += b; if (a === b) agree++; if (a && b) both++; else bothN++
  process.stderr.write('.')
}
const pct = (x, d) => (100 * x / d).toFixed(1)
console.log(`\nA=${A}  B=${B}  answered answerable n=${n} (null ${nan})`)
console.log(`A correct ${pct(aC, n)}% · B correct ${pct(bC, n)}% · agreement ${pct(agree, n)}%`)
console.log(`consensus YES ${pct(both, n)}% · at least one NO ${pct(bothN, n)}%`)
