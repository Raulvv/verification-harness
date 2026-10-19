// Metadata resolvers for the citation receipt (system 3.0) — the system
// derives title and date from the material itself, never from hand-written
// headers. Resolution order:
//   date:  <file>.meta.json {"updated"}  →  git last-touch  →  file mtime
//   title: <file>.meta.json {"title"}    →  front-matter `title:`  →
//          first `# H1` / `<h1>`  →  filename stem
// The sidecar convention is what sync adapters (Confluence, Notion, …)
// should write: `page.md.meta.json` carrying the SOURCE system's real
// title and updated date — because a sync that overwrites files makes
// mtime lie ("everything looks freshly modified").
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

function sidecar(corpusRoot, rel) {
  const p = join(resolve(corpusRoot), rel + '.meta.json')
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return {} }
}

function gitDate(corpusRoot, rel) {
  try {
    const out = execFileSync('git', ['-C', resolve(corpusRoot), 'log', '-1', '--format=%cs', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : ''
  } catch { return '' }
}

export function resolveTitle(content, rel, meta = {}) {
  if (meta.title) return String(meta.title).trim()
  const text = content ?? ''
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  const fmTitle = fm && /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm[1])
  if (fmTitle) return fmTitle[1].trim()
  const h = /(?:^|\n)\s*#\s+(.+)/.exec(text) ?? /<h1[^>]*>(.+?)<\/h1>/i.exec(text)
  if (h) return h[1].replace(/<[^>]+>/g, '').trim()
  return basename(rel).replace(/\.\w+$/, '')
}

export function resolveDate(corpusRoot, rel, meta = {}) {
  if (meta.updated) return { date: iso(meta.updated), source: 'meta' }
  const g = gitDate(corpusRoot, rel)
  if (g) return { date: g, source: 'git' }
  try {
    return { date: iso(statSync(join(resolve(corpusRoot), rel)).mtime), source: 'mtime' }
  } catch {
    return { date: '', source: 'none' }
  }
}

// resolveMeta(corpusRoot, relPath, content?) -> { title, date, dateSource }
export function resolveMeta(corpusRoot, rel, content) {
  const meta = sidecar(corpusRoot, rel)
  const text = content ?? (existsSync(join(resolve(corpusRoot), rel)) ? readFileSync(join(resolve(corpusRoot), rel), 'utf8') : '')
  const { date, source } = resolveDate(corpusRoot, rel, meta)
  return { title: resolveTitle(text, rel, meta), date, dateSource: source }
}
