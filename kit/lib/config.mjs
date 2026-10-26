// Config loader — one JSON file plus env overrides is the whole surface.
//
//   RETRIEVAL_CONFIG=path/to/retrieval.config.json   (default: ./retrieval.config.json)
//   RETRIEVAL_RETRIEVER / RETRIEVAL_COORDINATOR       model id overrides
//   RETRIEVAL_BASE_URL / RETRIEVAL_API_KEY           shared endpoint overrides
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { normalizeSource } from './corpus/source.mjs'

export function loadConfig(explicit) {
  const path = resolve(process.env.RETRIEVAL_CONFIG ?? explicit ?? 'retrieval.config.json')
  const cfg = JSON.parse(readFileSync(path, 'utf8'))
  cfg.__path = path
  const root = dirname(path)
  // source selection: "local" | "<url>" | { type, ... } — the corpus root is
  // the repo (local) or the sync mirror (url/confluence). See lib/source.mjs.
  const src = normalizeSource(cfg, root)
  cfg.source = src
  cfg.corpusRoot = src.corpusRoot
  for (const k of ['indexPath', 'goldenPath']) {
    if (cfg[k]) cfg[k] = resolve(root, cfg[k])
  }
  if (cfg.docsDir) cfg.docsDir = resolve(cfg.corpusRoot, cfg.docsDir)
  cfg.archiveDirs = (cfg.archiveDirs ?? []).map((d) => resolve(cfg.corpusRoot, d))
  cfg.models ??= {}
  for (const role of ['retriever', 'coordinator']) {
    const m = cfg.models[role]
    if (!m) continue
    if (process.env.RETRIEVAL_BASE_URL) m.baseUrl = process.env.RETRIEVAL_BASE_URL
    if (process.env.RETRIEVAL_API_KEY) m.apiKey = process.env.RETRIEVAL_API_KEY
    const envModel = process.env[`RETRIEVAL_${role.toUpperCase()}`] ?? (role === 'retriever' ? process.env.RETRIEVAL_MODEL : null)
    if (envModel) m.model = envModel
    m.label ??= m.model
    if (!m.apiKey && !m.apiKeyEnv && !process.env.RETRIEVAL_API_KEY && !m.auth && m.provider !== 'opencode') {
      throw new Error(`models.${role}: set apiKeyEnv (or RETRIEVAL_API_KEY)`)
    }
  }
  return cfg
}
