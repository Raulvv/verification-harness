#!/usr/bin/env node
// Run the one-shot machine against a golden set, then the full scorecard.
// Prints per-item points; writes a results file for the record.
//   node kit/bin/ask.mjs --golden <file> [--config <file>] [--out <file>] [--label <name>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadConfig } from '../lib/config.mjs'
import { scoreItem } from '../lib/receipts/score.mjs'
import { askOneShot } from '../lib/answer/oneshot.mjs'
import { makeArgs } from '../lib/cli.mjs'

// Progress goes to stderr: Node buffers stdout when it is a pipe (npm, an IDE,
// a capture), so stdout logs only appear at process exit. stderr is unbuffered
// and streams line-by-line as each item lands — the run is visible while it runs.
const log = (s) => process.stderr.write(String(s) + '\n')

const { arg } = makeArgs(process.argv.slice(2))
const cfg = loadConfig(arg('config') ?? 'retrieval.config.json')
const corpusRoot = cfg.corpusRoot
if (!cfg.models?.retriever) {
  console.error('no models.retriever in the config — copy kit/retrieval.config.example.json and name your model')
  process.exit(1)
}
const model = cfg.models.retriever
const golden = JSON.parse(readFileSync(arg('golden'), 'utf8'))
const outPath = arg('out') ?? 'stages-results.json'
const label = arg('label') ?? (arg('prompt') === 'lean' ? 'lean' : 'one-shot')
// Default tier is `source-v45` — the shipped `source` receipt contract (doc
// numbers, no quote) plus the v4.5 structural scaffold. The older tiers stay
// opt-in: `--prompt source` (no scaffold), `--prompt v45` (full verbatim quote
// + scaffold), `--prompt full` (full quote, no scaffold).
const run = (question) => askOneShot(model, corpusRoot, question, { corpus: cfg.corpus, promptStyle: arg('prompt') ?? 'source-v45', retriever: arg('retriever') ?? cfg.retriever ?? 'router' })

const N = golden.items.length
const nCorpus = (cfg.corpus ?? []).length
log(`\nbattery: ${N} items · model ${model.model ?? label} · corpus ${nCorpus ? nCorpus + ' files' : 'all files'}\n`)
const results = []
const t0 = Date.now()
for (let i = 0; i < golden.items.length; i++) {
  const it = golden.items[i]
  const n = i + 1
  log(`[${String(n).padStart(2)}/${N}] ${it.id} — ${it.question}`)
  const r = await run(it.question)
  const text = r.final?.text ?? ''
  // mechanical traceability only — correctness is judged in the battery (regress.mjs)
  const s = scoreItem(it, text, corpusRoot)
  const t = r.timings ?? {}
  const sec = (t.total_ms / 1000).toFixed(1)
  const vetLabel = (t.vet_ms ?? 0) > 0 ? `vet ${(t.vet_ms / 1000).toFixed(1)}s` : 'vet skipped'
  const nFiles = (r.attempts ?? []).length
  const toks = r.tokens ? (r.tokens / 1000).toFixed(1) + 'k' : ''
  const pf = r.parseFailures ?? []
  if (pf.length) log(`      parse failures: ${pf.join(' | ')}`)
  log(`      ${s.path ? 'source+' : 'source-'} ${s.quote ? 'quote+' : 'quote-'}  ${sec.padStart(5)}s  files:${nFiles}  ${toks}  ${vetLabel} · answer ${((t.model_ms ?? 0) / 1000).toFixed(1)}s`)
  const elapsed = (Date.now() - t0) / 1000
  const eta = elapsed / n * (N - n)
  log(`      — ${n}/${N} done · ${elapsed.toFixed(0)}s elapsed · ~${eta.toFixed(0)}s left`)
  results.push({ id: it.id, model: label, ms: t.total_ms, tokens: r.tokens ?? null, timings: t, text, parseFailures: pf, attempts: (r.attempts ?? []).map((a) => a.rel) })
}
const secs = (Date.now() - t0) / 1000
const totalTok = results.reduce((s, x) => s + (x.tokens ?? 0), 0)
log(`\n${label}: ${N} items · ${secs.toFixed(0)}s total · ${(secs / N).toFixed(1)}s/question · ${(totalTok / 1000).toFixed(1)}k tokens`)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(results, null, 2))
log('results → ' + outPath)
