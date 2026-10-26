#!/usr/bin/env node
// Manifest check — the self-enforcement for the retrieval substrate.
//
//   node kit/bin/manifest-check.mjs [--config <file>]     (exit 1 on violation)
//
// Three invariants, each printed with its own fix when broken:
//   1. Every work doc carries Status:/Since:/Answers: after its H1, with
//      Status from the closed vocabulary.
//   2. The INDEX has one row per doc and its status matches the header
//      (the index cannot drift from the headers).
//   3. Path<->status: docs/** is open|reference; archive/** is never open.
//      A `done` header in docs/ is a failing test that names the move.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { loadConfig } from '../lib/config.mjs'
import { makeArgs } from '../lib/cli.mjs'

const { arg } = makeArgs(process.argv.slice(2))
const cfg = loadConfig(arg('config'))
const ROOT = cfg.corpusRoot
const VOCAB = ['open', 'done', 'decided', 'falsified', 'superseded', 'reference']

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  const skip = new Set(['readme.md', basename(cfg.indexPath).toLowerCase()])
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md') && !skip.has(e.name.toLowerCase())) out.push(p)
  }
  return out
}

const problems = []
const docsRel = relative(ROOT, cfg.docsDir) || 'docs'
const archiveRels = cfg.archiveDirs.map((d) => relative(ROOT, d))
const docsDirs = [cfg.docsDir, ...cfg.archiveDirs].filter(Boolean)
const docs = docsDirs.flatMap((d) => walk(d))
const klass = (status) => status.split('—')[0].trim().split(/\s+/)[0]

const indexRows = new Map()
const indexPath = cfg.indexPath
if (existsSync(indexPath)) {
  for (const line of readFileSync(indexPath, 'utf8').split('\n')) {
    const m = line.match(/^\| \[`[^`]+`\]\(([^)]+)\) \| (\w+) \|/)
    if (m) {
      const h = m[1]
      indexRows.set(h.startsWith('archive/') || h.startsWith(docsRel) ? h : join(docsRel, h), m[2])
    }
  }
} else {
  problems.push(`${indexPath} is missing — regenerate with kit/bin/bootstrap.mjs --apply`)
}

const inDocsDir = (rel) => rel === docsRel || rel.startsWith(docsRel + '/')
for (const abs of docs) {
  const rel = relative(ROOT, abs)
  const text = readFileSync(abs, 'utf8')
  const statusLine = text.split('\n').find((l) => l.startsWith('Status: '))
  const sinceLine = text.split('\n').find((l) => l.startsWith('Since: '))
  const answersLine = text.split('\n').find((l) => l.startsWith('Answers: '))
  const inArchive = archiveRels.some((a) => rel === a || rel.startsWith(a + '/'))
  const indexed = indexRows.has(rel)
  if (!inDocsDir(rel) && !indexed && !statusLine) continue

  for (const [label, line] of [['Status:', statusLine], ['Since:', sinceLine], ['Answers:', answersLine]]) {
    if (!line) problems.push(`${rel}: missing \`${label}\` header — add it after the H1`)
  }
  if (statusLine) {
    const word = klass(statusLine.slice('Status: '.length))
    if (!VOCAB.includes(word)) problems.push(`${rel}: Status class "${word}" is outside the closed vocabulary (${VOCAB.join(' | ')})`)
    const idx = indexRows.get(rel)
    if (idx === undefined) problems.push(`${rel}: no row in the INDEX — add one (path, ${word}, Since, the question it answers)`)
    else if (idx !== word) problems.push(`${rel}: INDEX says "${idx}" but the header says "${word}" — make them agree`)
    if (inDocsDir(rel) && !['open', 'reference'].includes(word)) {
      problems.push(`${rel}: Status "${word}" in docs/ — concluded work moves to the matching archive/ folder (path<->status invariant)`)
    }
    if (inArchive && word === 'open') {
      problems.push(`${rel}: Status "open" under archive/ — open work lives in docs/ (path<->status invariant)`)
    }
  }
}

for (const [rel] of indexRows) {
  if (!existsSync(join(ROOT, rel))) problems.push(`${rel}: listed in the INDEX but missing on disk — fix the row or the file`)
}

if (problems.length) {
  console.error(`manifest check — ${problems.length} violation(s):`)
  for (const p of problems) console.error('  ✗ ' + p)
  process.exit(1)
}
console.log(`manifest check OK — ${docs.length} docs, ${indexRows.size} index rows, vocabulary closed.`)
