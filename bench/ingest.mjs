#!/usr/bin/env node
// SciFact (BEIR) ingestion for the retrieval bench. One bounded download,
// cached under bench/.cache forever; materializes the corpus as a markdown
// mirror (title/date sidecars) so the kit can read it.
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CACHE = join(HERE, '.cache')
export const MIRROR = join(CACHE, 'scifact-mirror')
const ZIP = join(CACHE, 'scifact.zip')
const URL = 'https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/scifact.zip'

export const readJSONL = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
export const readTSV = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))

function findDirWith(file, roots) {
  for (const r of roots) {
    if (existsSync(join(r, file))) return r
    if (existsSync(r)) {
      for (const e of readdirSync(r, { withFileTypes: true })) {
        if (e.isDirectory() && existsSync(join(r, e.name, file))) return join(r, e.name)
      }
    }
  }
  return null
}

export function ensureDataset() {
  mkdirSync(CACHE, { recursive: true })
  if (!existsSync(join(CACHE, 'scifact', 'corpus.jsonl'))) {
    if (!existsSync(ZIP)) {
      console.log('downloading scifact.zip …')
      execFileSync('curl', ['-sL', URL, '-o', ZIP], { stdio: 'inherit' })
    }
    execFileSync('unzip', ['-q', '-o', ZIP, '-d', CACHE], { stdio: 'inherit' })
  }
  const root = findDirWith('corpus.jsonl', [join(CACHE, 'scifact'), CACHE])
  if (!root) throw new Error('no corpus.jsonl found under ' + CACHE)
  const corpus = readJSONL(join(root, 'corpus.jsonl'))
  const queries = readJSONL(join(root, 'queries.jsonl'))
  const qrelsPath = ['test.tsv', 'dev.tsv', 'train.tsv'].map((f) => join(root, 'qrels', f)).find(existsSync)
  if (!qrelsPath) throw new Error('no qrels under ' + join(root, 'qrels'))
  const qrels = new Map()
  for (const row of readTSV(qrelsPath)) {
    const [qid, did, score] = row
    if (Number.isNaN(Number(score))) continue // header or blank
    if (!qid || !did || Number(score) <= 0) continue
    if (!qrels.has(qid)) qrels.set(qid, new Set())
    qrels.get(qid).add(did)
  }
  return { root, corpus, queries, qrels, qrelsPath }
}

export function materializeMirror(corpus) {
  mkdirSync(MIRROR, { recursive: true })
  for (const d of corpus) {
    const id = String(d._id)
    writeFileSync(join(MIRROR, `${id}.md`), `# ${d.title || id}\n\n${d.text ?? ''}\n`)
    writeFileSync(join(MIRROR, `${id}.md.meta.json`), JSON.stringify({ title: d.title || id, updated: '2020-01-01' }))
  }
  return MIRROR
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ds = ensureDataset()
  console.log(`scifact: ${ds.corpus.length} docs · ${ds.queries.length} queries · ${ds.qrels.size} judged (${ds.qrelsPath})`)
  materializeMirror(ds.corpus)
  console.log('mirror → ' + MIRROR)
}
