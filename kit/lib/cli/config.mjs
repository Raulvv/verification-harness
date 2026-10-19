// `config` — seal the workspace once (RN-G11): the corpus target and endpoint,
// discovered on later asks by walking up. By default the seat is written where
// you run it (`.retrieval/config.json`), recording the corpus path — so you seal
// from your project root and ask from the same place. It never writes a secret
// (RN-G12).
import { existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { findWorkspace, writeWorkspace, clearWorkspace, formatWorkspace } from './workspace.mjs'

const FIELDS = ['model', 'baseUrl', 'apiKeyEnv', 'embedModel', 'retriever', 'tier']

export function runConfig({ flags = {}, cwd = process.cwd() } = {}) {
  if (flags.show) {
    const ws = findWorkspace(cwd)
    if (!ws) throw new Error('no sealed workspace here (or above) — run `retrieval-kit config --corpus <dir>`')
    return { action: 'show', output: formatWorkspace(ws) }
  }
  if (flags.reset) {
    const ws = findWorkspace(cwd)
    if (!ws) throw new Error('no sealed workspace here (or above)')
    clearWorkspace(ws.dir)
    return { action: 'reset', output: `workspace removed: ${resolve(ws.dir, '.retrieval')}` }
  }
  if (!flags.corpus) throw new Error('usage: retrieval-kit config --corpus <dir> [--model <id>] [--base-url <url>] [--retriever dense|reference|router] [--tier v45|source-v45|full]')
  if (flags.apiKey) throw new Error('refusing to write a literal key — use `--api-key-env <VAR>` and set that variable instead (RN-G12)')
  const corpusRoot = resolve(cwd, flags.corpus)
  if (!existsSync(corpusRoot)) throw new Error(`corpus not found: ${corpusRoot}`)

  const sealDir = flags.at ? resolve(cwd, flags.at) : resolve(cwd)
  let corpus = relative(sealDir, corpusRoot).split('\\').join('/') || '.'
  if (!corpus.startsWith('.')) corpus = './' + corpus

  const cfg = { corpus }
  for (const k of FIELDS) if (flags[k] != null && flags[k] !== true) cfg[k] = flags[k]
  const file = writeWorkspace(sealDir, cfg)
  return { action: 'write', file, output: `workspace sealed: ${file}\ncorpus:  ${corpusRoot}\nnext:  retrieval-kit ask "<question>"` }
}
