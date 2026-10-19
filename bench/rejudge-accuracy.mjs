#!/usr/bin/env node
// Re-judge the fresh-run answers with the RELAXED accuracy prompt (accept a
// correct, less-specific answer) and compare to the stored reader_correct.
// Isolates the prompt change: same judge, same answers.
import { readFileSync } from 'node:fs'
import { hotpotRows } from './ingest-hotpot.mjs'
import { judgePrompt } from './lib/judge.mjs'

const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const JUDGE = process.env.ACC_JUDGE ?? 'deepseek-v4.1-flash'
const r = readFileSync('bench/results/hotpot-fresh-301-600.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600)
const byId = new Map(rows.map((x) => [x.id, x]))
async function judge(q, gold, ans) {
  const res = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) },
    body: JSON.stringify({ model: JUDGE, max_tokens: 500, temperature: 0, messages: [{ role: 'user', content: judgePrompt(q, gold, ans) }] }),
  })
  const m = (await res.json()).choices?.[0]?.message ?? {}
  return /\byes\b/i.test(String(m.content ?? '') || String(m.reasoning_content ?? '')) ? 1 : 0
}
const ans = r.filter((x) => x.condition === 'answerable' && x.reader_abstained === 0)
let flippedUp = 0, flippedDown = 0, oldC = 0, newC = 0
for (const x of ans) {
  const row = byId.get(x.id); const nw = await judge(row.question, row.answer, x.answer)
  oldC += x.reader_correct; newC += nw
  if (x.reader_correct === 0 && nw === 1) flippedUp++
  if (x.reader_correct === 1 && nw === 0) flippedDown++
  process.stderr.write('.')
}
const pct = (x, n) => (100 * x / n).toFixed(1)
console.log(`\naccuracy judge ${JUDGE} · ${ans.length} answered answerable`)
console.log(`old correct ${oldC} (${pct(oldC, ans.length)}%) → new correct ${newC} (${pct(newC, ans.length)}%)`)
console.log(`flipped wrong→right ${flippedUp} · right→wrong ${flippedDown}`)
