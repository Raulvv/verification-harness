#!/usr/bin/env node
// Partition unified.jsonl into the public HotpotQA-only subset: exclude the
// six private-corpus runs (b113–b118), keep every other line
// byte-identically in original order. INPUT env (default unified.jsonl),
// OUTPUT env (default bench/results/unified-public.jsonl). Also writes
// OUTPUT.sha256 (`shasum -c` format) so the pin regenerates with the subset.
// Refuses to overwrite OUTPUT unless FORCE=1 (same pattern as judge-sweep.mjs).
// A run_id that is neither in the private denylist nor the known-public
// list aborts the run BEFORE anything is written — a future private run
// must be added here explicitly, never shipped by default.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'

const PRIVATE_RUN_IDS = new Set([
  'b113-private-4b',
  'b114-private-deepseek',
  'b115-private-4b-v2',
  'b116-private-deepseek-v2',
  'b117-private-4b-v3',
  'b118-private-deepseek-v3',
])
const PUBLIC_RUN_IDS = new Set([
  'b95-hotpot-fresh-4b-kimi',
  'b102-hotpot-fresh-deepseek',
  'b103b-deepseek-kimi-oracle',
  'b104-hotpot-fresh-27b',
  'b105-hotpot-fresh-4b-27bjudge',
  'b108-hotpot-fresh-partial-4b',
  'b109-hotpot-fresh-4b-9bjudge',
  'b119-cleanroom-4b',
  'b120-cleanroom-deepseek',
])

const INPUT = process.env.INPUT ?? 'unified.jsonl'
const OUTPUT = process.env.OUTPUT ?? 'bench/results/unified-public.jsonl'
if (existsSync(OUTPUT) && process.env.FORCE !== '1') {
  console.error(`refusing to overwrite ${OUTPUT} — set FORCE=1 to replace or OUTPUT=<path> to write elsewhere`)
  process.exit(1)
}

const raw = readFileSync(INPUT, 'utf8')
const lines = raw.split('\n')
if (lines.at(-1) === '') lines.pop() // trailing newline artifact
const kept = []
const excludedByRun = new Map()
const keptByRun = new Map()
const unknown = new Set()
lines.forEach((line, i) => {
  if (line === '') {
    console.error(`line ${i + 1}: blank line in ${INPUT}`)
    process.exit(1)
  }
  let run_id
  try {
    run_id = JSON.parse(line).run_id
  } catch (e) {
    console.error(`line ${i + 1}: invalid JSON (${e.message})`)
    process.exit(1)
  }
  if (PRIVATE_RUN_IDS.has(run_id)) {
    excludedByRun.set(run_id, (excludedByRun.get(run_id) ?? 0) + 1)
    return
  }
  if (!PUBLIC_RUN_IDS.has(run_id)) {
    unknown.add(run_id)
    return
  }
  keptByRun.set(run_id, (keptByRun.get(run_id) ?? 0) + 1)
  kept.push(line)
})
if (unknown.size) {
  console.error(`unknown run_id(s) not in the private denylist nor the known-public list: ${[...unknown].sort().join(', ')}`)
  console.error('update PRIVATE_RUN_IDS / PUBLIC_RUN_IDS in bench/partition-unified.mjs before partitioning')
  process.exit(1)
}

mkdirSync(dirname(OUTPUT), { recursive: true })
const body = kept.length ? kept.join('\n') + '\n' : ''
writeFileSync(OUTPUT, body)
writeFileSync(`${OUTPUT}.sha256`, `${createHash('sha256').update(body).digest('hex')}  ${OUTPUT}\n`)

for (const run of [...excludedByRun.keys()].sort()) {
  console.log(`excluded ${excludedByRun.get(run)} ${run}`)
}
const tokenHotpot = [...keptByRun.keys()].filter((r) => r.includes('hotpot'))
const tokenOther = [...keptByRun.keys()].filter((r) => !r.includes('hotpot'))
console.log(`kept: ${tokenHotpot.length} run_id(s) containing "hotpot" + ${tokenOther.length} without the token (${tokenOther.join(', ') || 'none'})`)
console.log(`in ${lines.length} lines (${PUBLIC_RUN_IDS.size + PRIVATE_RUN_IDS.size} runs) → out ${kept.length} lines (${keptByRun.size} runs)`)
console.log(`Wrote ${OUTPUT} and ${OUTPUT}.sha256`)
