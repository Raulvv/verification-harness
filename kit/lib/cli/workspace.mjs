// The sealed workspace: a discoverable `.retrieval/config.json` that pins the
// corpus target and endpoint so `ask` never repeats them (RN-G11). It records
// *where* a key comes from, never a key (RN-G12).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

export const WORKSPACE_DIR = '.retrieval'
export const WORKSPACE_FILE = 'config.json'

export const workspacePathFor = (dir) => join(resolve(dir), WORKSPACE_DIR, WORKSPACE_FILE)

// Walk up from `startDir` to the filesystem root looking for the workspace.
export function findWorkspace(startDir = process.cwd()) {
  let dir = resolve(startDir)
  for (;;) {
    const file = workspacePathFor(dir)
    if (existsSync(file)) return { dir, file, config: readWorkspace(file) }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function readWorkspace(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

// Write at the corpus root; the corpus is stored as '.', so the tree is
// relocatable. `cfg` never carries a literal secret (RN-G12).
export function writeWorkspace(corpusRoot, cfg = {}) {
  const root = resolve(corpusRoot)
  const file = workspacePathFor(root)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ version: 1, sealedAt: new Date().toISOString(), corpus: '.', ...cfg }, null, 2) + '\n')
  return file
}

export function clearWorkspace(dir) {
  const target = join(resolve(dir), WORKSPACE_DIR)
  if (!existsSync(target)) return false
  rmSync(target, { recursive: true, force: true })
  return true
}

// The corpus a workspace points at is the directory that contains `.retrieval/`.
export const corpusOf = (ws) => resolve(ws.dir, ws.config.corpus ?? '.')

export function formatWorkspace(ws) {
  const c = ws.config
  const row = (k, v) => `${k.padEnd(10)} ${v}`
  return [
    row('workspace', ws.dir),
    row('sealed', c.sealedAt ?? '(unknown)'),
    row('corpus', corpusOf(ws)),
    row('model', c.model ?? '(not set)'),
    row('baseUrl', c.baseUrl ?? '(default: http://localhost:11434/v1)'),
    row('apiKeyEnv', c.apiKeyEnv ?? '(none — must come from the env)'),
    row('embedModel', c.embedModel ?? '(default: nomic-embed-text)'),
    row('retriever', c.retriever ?? '(default: reference)'),
    row('tier', c.tier ?? '(default: source-v45)'),
  ].join('\n')
}
