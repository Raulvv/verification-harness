#!/usr/bin/env node
// Recompute the fresh snapshot with the SCHEMA-CONSTRAINED accuracy oracle
// (kimi-k3, {verdict:YES|NO}) instead of the old strict/noisy judge. Re-judges
// only the answered answerable rows (no reader re-run); unanswerable correctness
// is "abstained" by definition.
import { readFileSync, writeFileSync } from 'node:fs'
import { hotpotRows } from './ingest-hotpot.mjs'

const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const SCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['YES', 'NO'] } }, required: ['verdict'], additionalProperties: false }
const P = (q, g, a) => ['Is the SYSTEM ANSWER a correct answer to the QUESTION, given the GOLD answer?', 'YES if it gives the same answer (wording may differ; a less-specific but correct answer counts).', 'NO if different, contradictory, or does not answer.', 'QUESTION: ' + q, 'GOLD: ' + g, 'SYSTEM ANSWER: ' + a].join('\n')
async function judge(q, g, a) {
  const res = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) },
    body: JSON.stringify({ model: 'kimi-k3', max_tokens: 400, temperature: 0, response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema: SCHEMA } }, messages: [{ role: 'user', content: P(q, g, a) }] }),
  })
  const m = (await res.json()).choices?.[0]?.message ?? {}
  try { return JSON.parse(m.content).verdict === 'YES' ? 1 : 0 } catch { return null }
}

const IN = process.argv[2] ?? 'bench/results/hotpot-fresh-301-600.jsonl'
const OUT = process.env.OUT ?? IN.replace(/\.jsonl$/, '-kimi-oracle.jsonl')
const r = readFileSync(IN, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
for (const x of r) {
  if (x.condition === 'answerable' && x.reader_abstained !== 1 && x.parse_failure !== 1) {
    const row = byId.get(x.id); const v = await judge(row.question, row.answer, x.answer)
    if (v != null) x.reader_correct = v // keep the old label if the new judge returned null
    process.stderr.write('.')
  }
}
writeFileSync(OUT, r.map((x) => JSON.stringify(x)).join('\n') + '\n')
console.log(`wrote ${OUT} (from ${IN})`)

const pct = (x, n) => (n ? (100 * x / n).toFixed(1) : '-')
const ans = r.filter((x) => x.condition === 'answerable'), un = r.filter((x) => x.condition === 'unanswerable')
const shown = ans.filter((x) => x.state !== 'not_found')
const ver = ans.filter((x) => x.state === 'verified'), verAll = r.filter((x) => x.state === 'verified')
const unVer = un.filter((x) => x.state === 'verified')
console.log(`\nFresh snapshot · schema-constrained accuracy oracle (kimi) · N=${r.length}`)
console.log(`raw: unknown abstention ${pct(un.filter((x) => x.reader_abstained).length, un.length)}% · answerable false-abstention ${pct(ans.filter((x) => x.reader_abstained).length, ans.length)}% · acc among shown ${pct(ans.filter((x) => !x.reader_abstained && x.reader_correct).length, ans.filter((x) => !x.reader_abstained).length)}%`)
console.log(`gate: unknown abstention ${pct(un.filter((x) => x.state === 'not_found').length, un.length)}% · answerable false-abstention ${pct(ans.filter((x) => x.state === 'not_found').length, ans.length)}% · acc among shown ${pct(shown.filter((x) => x.reader_correct).length, shown.length)}%`)
console.log(`verified: answerable ${pct(ver.filter((x) => x.reader_correct).length, ver.length)}% (n=${ver.length}) · pooled ${pct(verAll.filter((x) => x.reader_correct).length, verAll.length)}% (n=${verAll.length}) · false-accept ${unVer.length}`)
console.log(`verified-wrong (answerable, verified, incorrect): ${ver.filter((x) => x.reader_correct === 0).length}`)
