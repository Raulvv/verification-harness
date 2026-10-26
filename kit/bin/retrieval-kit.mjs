#!/usr/bin/env node
// retrieval-kit — the one-command CLI: `config` once, `ask` many (RN-G01/G11).
// Thin dispatcher; the logic lives in lib/cli/* (testable without a process).
import { runConfig } from '../lib/cli/config.mjs'
import { runAsk, formatAsk, runAggregate, formatAggregate } from '../lib/cli/ask.mjs'
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const sub = argv[0]
const rest = argv.slice(1)

function parse(list) {
  const flags = {}
  const pos = []
  const BOOLEAN = new Set(['json', 'aggregate'])
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a === '--') { pos.push(...list.slice(i + 1)); break }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2)
      const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      if (eq < 0 && BOOLEAN.has(camel)) { flags[camel] = true; continue }
      const val = eq >= 0 ? a.slice(eq + 1) : (i + 1 < list.length && !list[i + 1].startsWith('--') ? list[++i] : true)
      flags[camel] = val
    } else pos.push(a)
  }
  return { flags, pos }
}

function usage() {
  console.log([
    'retrieval-kit — ask a folder of documents and get a checkable answer',
    '',
    '  retrieval-kit config --corpus <dir> [--model <id>] [--base-url <url>]',
    '  retrieval-kit ask "<question>"',
    '  retrieval-kit ask <dir> "<question>"      # one-off, no workspace',
    '  retrieval-kit ask --aggregate --table <rows.json> --spec <spec.json> [question]',
    '  retrieval-kit config --show | --reset',
    '',
    'options: --retriever dense|reference|router   --files a.md,b.md (corpus allowlist)   --quote (also print the full verbatim quote)   --tier source-v45|v45|full',
    '         --sufficient --judge <model> (graded gate: score<lo abstains, lo..hi-1 UNVERIFIED, >=hi verified; frozen lo=2 hi=5)   --lo <n> --hi <n>   --unverified (force the flag path)   --judge-evidence window|receipt|union   --judge-cmd <cmd>   --json',
    '         --aggregate --table <rows.json> --spec <spec.json> (deterministic table reducer; no model)',
  ].join('\n'))
}

async function main() {
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') { usage(); return }
  if (sub === 'config') {
    console.log(runConfig({ flags: parse(rest).flags }).output)
    return
  }
  if (sub === 'ask') {
    const { flags, pos } = parse(rest)
    if (flags.aggregate) {
      if (!flags.table || !flags.spec) throw new Error('--aggregate needs --table <rows.json> and --spec <spec.json>')
      const rows = JSON.parse(readFileSync(flags.table, 'utf8'))
      const spec = JSON.parse(readFileSync(flags.spec, 'utf8'))
      const question = pos.join(' ') || 'aggregate query'
      const res = runAggregate({ rows, spec, question })
      process.stdout.write(formatAggregate(res, { json: Boolean(flags.json) }) + '\n')
      return
    }
    const corpus = pos.length >= 2 ? pos[0] : flags.corpus
    const question = pos.length >= 2 ? pos.slice(1).join(' ') : pos.join(' ')
    const res = await runAsk({ question, flags: { ...flags, corpus } })
    process.stdout.write(formatAsk(res, { json: Boolean(flags.json) }) + '\n')
    return
  }
  console.error(`unknown command: ${sub}`)
  usage()
  process.exitCode = 1
}

main().catch((e) => {
  console.error(`error: ${e.message}`)
  process.exitCode = 1
})
