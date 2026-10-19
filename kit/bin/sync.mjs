#!/usr/bin/env node
// Materialize the configured source into files — the only step that knows
// where the corpus comes from.
//
//   node kit/bin/sync.mjs [--config retrieval.config.json] [--limit N] [--dry-run]
//
//   "source": "local"                      → no-op (the repo is already files)
//   "source": "https://naruto.fandom.com"  → bounded mirror + date sidecars
//
// Everything downstream (run / score / verify / chain / bootstrap) works on
// the resulting directory and never knows the difference.
import { loadConfig } from '../lib/config.mjs'
import { normalizeSource, syncSource } from '../lib/corpus/source.mjs'
import { makeArgs } from '../lib/cli.mjs'
import { dirname } from 'node:path'

const { arg, has } = makeArgs(process.argv.slice(2))
const cfg = loadConfig(arg('config'))
const src = normalizeSource(cfg, dirname(cfg.__path ?? 'retrieval.config.json'))
if (arg('limit')) src.limit = Number(arg('limit'))

if (has('dry-run')) {
  console.log(JSON.stringify({ type: src.type, adapter: src.adapter, url: src.url, mirror: src.corpusRoot, limit: src.limit }, null, 2))
  process.exit(0)
}
if (src.type === 'local') {
  console.log(`local source — corpus is already files at ${src.corpusRoot}`)
  process.exit(0)
}
console.log(`syncing ${src.url} (${src.adapter}) → ${src.corpusRoot} (limit ${src.limit})…`)
const r = await syncSource(src, { onProgress: (n, t) => { if (n % 25 === 0 || String(t).startsWith('SKIP')) console.log(`  ${n}: ${t}`) } })
console.log(`\nsynced ${r.pages} page(s) via ${r.adapter} → ${r.dir}`)
console.log('each page carries .meta.json with the SOURCE title and date (sidecar convention)')
