#!/usr/bin/env node
// Local-judge sweep: grade the SAME stored reader outputs with several judges
// (schema-constrained, temp 0) and report, per judge: AUROC vs the oracle,
// mean seconds/record, tokens/call, and model size (GB). Finds the floor for
// a local gate. gpt-oss:20b dropped 2026-10-16 (B107: schema-nulls, no usable
// signal — every call returned null, so no tokens to measure either).
// SWEEP_N=<n> caps items for smoke runs; results are written to
// bench/results/judge-sweep-tokens.json so the numbers survive the session.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hotpotRows } from './ingest-hotpot.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'
import { chatWithUsage } from '../kit/lib/model.mjs'

const FILE = process.env.SWEEP_FILE ?? 'bench/results/hotpot-fresh-4b-27bjudge.jsonl'
// The default results file backs the article's priced dial table (ledger
// B107) and is committed — refuse to clobber it (B107's original results
// file was lost the same way). Path is cwd-independent; FORCE=1 replaces
// deliberately, SWEEP_OUT=<path> grades an adopter's own outputs elsewhere
// (article §7) without touching the evidence.
const OUTFILE = process.env.SWEEP_OUT
  ?? fileURLToPath(new URL('./results/judge-sweep-tokens.json', import.meta.url))
if (existsSync(OUTFILE) && process.env.FORCE !== '1') {
  console.error(`refusing to overwrite ${OUTFILE} — set FORCE=1 to replace or SWEEP_OUT=<path> to write elsewhere (the default file is committed evidence, ledger B107)`)
  process.exit(1)
}
const KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
const JUDGES = [
  ['qwen3.5:4b', 3.4], ['qwen3.5:9b', 6.6],
  ['oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU', 17.8], ['kimi-k3', null],
]
const isLocal = (m) => !/^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(m)
const model = (m) => isLocal(m) ? { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: m } : { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: KEY, model: m }

const r = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = await hotpotRows(600); const byId = new Map(rows.map((x) => [x.id, x]))
// pre-build windows
const items = []
for (const x of r) {
  const row = byId.get(x.id); if (!row) continue
  const gold = new Set((row.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))
  const paras = row.context.title.map((t, i) => ({ title: t, text: (row.context.sentences[i] ?? []).join(' ') }))
  const keep = x.condition === 'answerable' ? paras : paras.filter((p) => !gold.has(String(p.title).toLowerCase()))
  items.push({ condition: x.condition, correct: x.reader_correct, abstained: x.reader_abstained, q: row.question, ev: keep.map((p) => `# ${p.title}\n${p.text}`).join('\n\n'), answer: x.answer })
}
const cap = Number(process.env.SWEEP_N ?? 0)
const use = cap > 0 ? items.slice(0, cap) : items
const auroc = (ps) => {
  const pos = ps.filter((s) => s.y === 1).map((s) => s.score); const neg = ps.filter((s) => s.y === 0).map((s) => s.score)
  let w = 0; for (const p of pos) for (const q of neg) w += p > q ? 1 : p === q ? 0.5 : 0
  return pos.length && neg.length ? w / (pos.length * neg.length) : NaN
}
console.log(`\nJudge sweep on ${FILE} (N=${use.length})\n`)
console.log('judge                                GB    AUROC   s/rec   nulls  tok/call (p+c)')
const out = []
for (const [name, gb] of JUDGES) {
  const ps = []; let secs = 0, nul = 0, n = 0
  let pSum = 0, cSum = 0, tokN = 0
  const logged = async (msgs, o) => {
    const res = await chatWithUsage(model(name), msgs, o)
    pSum += res.usage?.prompt_tokens ?? 0
    cSum += res.usage?.completion_tokens ?? 0
    tokN++
    return res
  }
  for (const it of use) {
    if (it.abstained) continue
    const t0 = Date.now()
    let score = null
    try { score = await judgeGrade(model(name), it.q, it.ev, it.answer, { _chat: logged }) } catch {}
    secs += Date.now() - t0; n++
    if (score == null) { nul++; continue }
    ps.push({ y: it.condition === 'answerable' && it.correct === 1 ? 1 : 0, score })
  }
  const rec = {
    judge: name, gb, auroc: Number(auroc(ps).toFixed(3)), s_rec: Number((secs / n / 1000).toFixed(2)),
    nulls: nul, n,
    prompt_tok_mean: tokN ? Math.round(pSum / tokN) : null,
    completion_tok_mean: tokN ? Math.round(cSum / tokN) : null,
    tok_mean: tokN ? Math.round((pSum + cSum) / tokN) : null,
  }
  out.push(rec)
  console.log(`${name.padEnd(36)} ${String(gb ?? 'hosted').padEnd(5)} ${rec.auroc.toFixed(3)}   ${rec.s_rec.toFixed(2)}    ${String(nul).padEnd(6)} ${rec.tok_mean ?? '-'}`)
  process.stderr.write('.')
}
writeFileSync(OUTFILE, JSON.stringify({
  file: FILE, items: use.length, generated: new Date().toISOString(), judges: out,
}, null, 2) + '\n')
console.log(`\nWrote ${OUTFILE}`)
