#!/usr/bin/env node
// Mechanical gate CLI.
//   node kit/bin/verify.mjs <results.json> [more.json ...] --golden <file> [--config <file>] [--strict]
//   node kit/bin/verify.mjs --self-test
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verify } from '../lib/receipts/gate.mjs'
import { loadConfig } from '../lib/config.mjs'
import { parseFiles } from '../lib/cli.mjs'
import { readResults } from '../lib/receipts/results.mjs'

const strict = process.argv.includes('--strict')
const argv = process.argv.slice(2).filter((a) => a !== '--strict')

if (argv[0] === '--self-test') {
  // Generic seeded-error drill, corpus-independent: quote-class corruptions
  // must be rejected; the verdict-class is deliberately left to the judge.
  const dir = mkdtempSync(join(tmpdir(), 'retrieval-kit-drill-'))
  writeFileSync(join(dir, 'doc.md'), '# Fixture\n\nThe override was removed on 2026-09-24.\n')
  const item = {
    id: 'drill', question: 'Was the override removed?',
    candidates: [{ path: 'doc.md', quote: 'The override was removed on 2026-09-24.' }],
  }
  const seeds = [
    ['real answer', 'Q: The override was removed.\nPath: doc.md\nQuote: The override was removed on 2026-09-24.', true],
    ['wrong path (real quote)', 'Q: The override was removed.\nPath: missing.md\nQuote: The override was removed on 2026-09-24.', false],
    ['fabricated quote (right path)', 'Q: The override was removed.\nPath: doc.md\nQuote: this sentence appears nowhere in the file', false],
    ['wrong verdict, real quote (judge class)', 'Q: The override still exists.\nPath: doc.md\nQuote: The override was removed on 2026-09-24.', true],
  ]
  let ok = true
  console.log('mechanical verifier — seeded-error drill:')
  for (const [label, answer, expectPass] of seeds) {
    const v = verify(item, answer, dir)
    const good = v.mechanicalPass === expectPass
    ok = ok && good
    console.log(`  ${label.padEnd(42)} → ${v.mechanicalPass ? 'PASS' : 'REJECT'} (${v.why}) [${good ? 'as designed' : 'UNEXPECTED'}]`)
  }
  rmSync(dir, { recursive: true, force: true })
  console.log(ok ? '\nself-test OK — quote-class corruptions rejected; verdict-class correctly left to the judge.' : '\nself-test FAILED')
  process.exit(ok ? 0 : 1)
}

const { groups, options, positionals } = parseFiles(argv, { multi: ['golden'], single: ['config'] })
const goldenFiles = groups.golden
const resultsFiles = positionals
const cfgPath = options.config ?? null
if (!goldenFiles.length || !resultsFiles.length) {
  console.error('usage: node kit/bin/verify.mjs <results.json ...> --golden <file> [...] [--config <file>] [--strict] | --self-test')
  process.exit(1)
}
const cfg = loadConfig(cfgPath)
const items = goldenFiles.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).items)
const results = resultsFiles.flatMap(readResults)
let pass = 0
for (const item of items) {
  const r = results.find((x) => x.id === item.id)
  const v = verify(item, r?.text ?? '', cfg.corpusRoot, { strict })
  if (v.mechanicalPass) pass++
  console.log(`  ${item.id.padEnd(6)} ${v.mechanicalPass ? 'PASS' : 'REJECT'}  ${v.why}`)
}
console.log(`\nmechanical: ${pass}/${items.length} verified`)
process.exit(pass === items.length ? 0 : 1)
