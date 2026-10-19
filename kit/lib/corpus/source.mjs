// Source selection — how the corpus becomes files. The engine (runner,
// gate, scorers, tools) only ever sees a directory of files with optional
// `.meta.json` sidecars; this module is the whole difference between
// "the repo I'm standing in" and "a wiki/URL/Confluence I don't own".
//
// Config ergonomics (the entire difference):
//   "source": "local"                       → the current repo
//   "source": "https://naruto.fandom.com"   → an external site, mirrored
//   "source": { "type": "url", "url": "...", "limit": 300, ... }   → full control
//
// Adapters materialize a source into `mirror/` as `<slug>.md` +
// `<slug>.md.meta.json` sidecars carrying the SOURCE's real title and
// last-edited date (never regenerated ones — a sync that lies about dates
// is worse than no sync). Adapters: `mediawiki` (fandom/wikia/Wikipedia-
// shaped), `flat` (a list or index of files over HTTP). Confluence is the
// next adapter and plugs in here without touching anything downstream.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runTwg, collectPages } from './twg.mjs'
import { htmlToText } from './html.mjs'

const UA = process.env.RETRIEVAL_UA ?? 'retrieval-kit/0.1 (bounded one-time mirror; contact: set RETRIEVAL_UA)'

// ---------- normalize ----------
export function normalizeSource(cfg, configDir = '.') {
  const s = cfg.source ?? { type: 'local', root: cfg.corpusRoot ?? '.' }
  const src = typeof s === 'string' ? (/^https?:\/\//i.test(s) ? { type: 'url', url: s } : { type: 'local', root: s === 'local' ? '.' : s }) : { ...s }
  if (src.type === 'url' || src.type === 'confluence') {
    src.url = (src.url ?? '').replace(/\/$/, '')
    // Most MediaWiki roots expose the API at /api.php; Wikimedia projects at
    // /w/api.php — allow an explicit override, default to /api.php.
    src.apiUrl ??= src.url + '/api.php'
    src.slug ??= (new URL(src.url).hostname.replace(/^www\./, '') + (new URL(src.url).pathname.replace(/[^\w]+/g, '-'))).replace(/-+$/, '')
    src.mirror ??= join('.retrieval-mirror', src.slug)
    src.limit ??= 300
    src.delayMs ??= 350
    src.adapter ??= src.type === 'confluence' ? 'confluence' : 'auto'
    src.corpusRoot = resolve(configDir, src.mirror)
  } else {
    src.root ??= '.'
    src.corpusRoot = resolve(configDir, src.root)
  }
  return src
}

// ---------- adapters ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJSON(url, delayMs, ua) {
  // Back off on 429 (Wikimedia and friends rate-limit): honor Retry-After and
  // retry a bounded number of times — never hammer. See AGENTS.md conduct rule.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': ua ?? UA, accept: 'application/json' } })
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after')) || (attempt + 1) * 4
      await sleep(ra * 1000)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    await sleep(delayMs)
    return res.json()
  }
  throw new Error(`HTTP 429 rate-limited for ${url} — slow down or set a descriptive RETRIEVAL_UA`)
}

const slugify = (t) => t.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'page'

// MediaWiki (fandom / wikia / wikipedia-shaped): enumerate + render + timestamp
async function mediawikiList(src) {
  const pages = []
  // explicit titles first (the ones the experiment cares about)
  for (const title of src.include ?? []) pages.push({ title })
  let cont = ''
  while (pages.length < src.limit) {
    const q = new URLSearchParams({ action: 'query', list: 'allpages', apnamespace: '0', aplimit: '500', format: 'json' })
    if (cont) q.set('apcontinue', cont)
    const j = await getJSON(`${src.apiUrl}?${q}`, src.delayMs, src.userAgent)
    for (const p of j?.query?.allpages ?? []) {
      if (!pages.some((x) => x.title === p.title)) pages.push({ title: p.title })
    }
    cont = j?.continue?.apcontinue ?? ''
    if (!cont) break
  }
  return pages.slice(0, src.limit)
}

async function mediawikiFetch(src, page) {
  const q = new URLSearchParams({ action: 'parse', page: page.title, prop: 'text|revid', redirects: '1', format: 'json' })
  const j = await getJSON(`${src.apiUrl}?${q}`, src.delayMs, src.userAgent)
  const html = j?.parse?.text?.['*'] ?? ''
  const rq = new URLSearchParams({ action: 'query', titles: page.title, prop: 'revisions', rvprop: 'timestamp', rvlimit: '1', format: 'json' })
  const rj = await getJSON(`${src.apiUrl}?${rq}`, src.delayMs, src.userAgent)
  const rev = Object.values(rj?.query?.pages ?? {})[0]?.revisions?.[0]
  return {
    title: j?.parse?.displaytitle ? htmlToText(j.parse.displaytitle) || page.title : page.title,
    updated: rev?.timestamp ? String(rev.timestamp).slice(0, 10) : '',
    url: `${src.url}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    text: htmlToText(html),
  }
}

// flat: explicit page URLs or an index page's links to documents
async function flatList(src) {
  if (src.pages?.length) return src.pages.map((u) => ({ title: u.split('/').pop() || u, url: u }))
  if (!src.indexUrl) throw new Error('flat adapter needs `pages: [...]` or `indexUrl`')
  const res = await fetch(src.indexUrl, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.indexUrl}`)
  const html = await res.text()
  await sleep(src.delayMs)
  const hrefs = [...html.matchAll(/href=["']([^"'#?]+)["']/gi)].map((m) => m[1])
  const files = hrefs.filter((h) => /\.(md|txt|html?)$/i.test(h)).slice(0, src.limit)
  return files.map((h) => {
    const url = new URL(h, src.indexUrl).href
    return { title: decodeURIComponent(h.split('/').pop()), url }
  })
}

async function flatFetch(src, page) {
  const res = await fetch(page.url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${page.url}`)
  const body = await res.text()
  await sleep(src.delayMs)
  const lastMod = res.headers.get('last-modified')
  const isHtml = /<html|<body/i.test(body) || page.url.endsWith('.html')
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(body)?.[1]?.trim() || page.title
  return {
    title,
    updated: lastMod ? new Date(lastMod).toISOString().slice(0, 10) : '',
    url: page.url,
    text: isHtml ? htmlToText(body) : body,
  }
}

// Confluence via the official `twg` CLI (the conduct rule lives in
// twg.mjs): enumerate one space with CQL (complete — `content list` sees
// only the space root's children), fetch html ("what a reader reads") and
// carry the source's own version date into the sidecar. Pages whose
// sidecar date matches the listing are never re-asked (the mirror is the
// cache).
function confluenceFresh(src, page) {
  if (!page.updated) return false
  const slug = slugify(page.title)
  try {
    const meta = JSON.parse(readFileSync(join(src.corpusRoot, `${slug}.md.meta.json`), 'utf8'))
    return meta.updated === page.updated && existsSync(join(src.corpusRoot, `${slug}.md`))
  } catch {
    return false
  }
}

async function confluenceList(src) {
  if (!src.space) throw new Error('confluence adapter needs `space` (a space key or id)')
  const cql = src.cql ?? `space = "${src.space}" AND type = page`
  const items = await collectPages(
    ['confluence', 'search', 'query', '--cql', cql, '--limit', String(src.limit)],
    { site: src.site, limit: src.limit, delayMs: src.delayMs, timeoutMs: src.timeoutMs },
  )
  return items
    .map((it) => ({ id: it.content.id, title: it.content.title, updated: String(it.lastModified ?? '').slice(0, 10) }))
    .filter((p) => !confluenceFresh(src, p))
}

async function confluenceFetch(src, page) {
  const res = await runTwg(
    ['confluence', 'content', 'get', String(page.id), '--detail', 'full', '--format', 'html', '--include-metadata'],
    { site: src.site, delayMs: src.delayMs, timeoutMs: src.timeoutMs },
  )
  const d = res.data ?? {}
  const created = d.metadata?.version?.createdAt
  return {
    title: d.title || page.title,
    updated: created ? String(created).slice(0, 10) : '',
    url: `${src.url}/wiki/spaces/${src.space}/pages/${page.id}`,
    text: htmlToText(d.body?.value ?? ''),
  }
}

export const ADAPTERS = {
  mediawiki: { list: mediawikiList, fetch: mediawikiFetch },
  flat: { list: flatList, fetch: flatFetch },
  confluence: { list: confluenceList, fetch: confluenceFetch },
}

export async function detectAdapter(src) {
  if (src.adapter && src.adapter !== 'auto') return src.adapter
  try {
    await getJSON(`${src.apiUrl ?? src.url + "/api.php"}?action=query&meta=siteinfo&format=json`, src.delayMs, src.userAgent)
    return 'mediawiki'
  } catch { return 'flat' }
}

// ---------- sync ----------
// materialize the source into the mirror; sidecars carry the SOURCE's
// title and date. Returns { pages, dir }.
export async function syncSource(src, { onProgress } = {}) {
  if (src.type === 'local') return { pages: 0, dir: src.corpusRoot, local: true }
  const kind = await detectAdapter(src)
  const adapter = ADAPTERS[kind]
  if (!adapter) throw new Error(`no adapter for source type "${src.type}" (available: ${Object.keys(ADAPTERS).join(', ')})`)
  mkdirSync(src.corpusRoot, { recursive: true })
  const listed = await adapter.list(src)
  let n = 0
  for (const page of listed) {
    try {
      const f = await adapter.fetch(src, page)
      if (!f.text) continue
      const slug = slugify(f.title || page.title)
      writeFileSync(join(src.corpusRoot, `${slug}.md`), `# ${f.title}\n\n${f.text}\n`)
      writeFileSync(join(src.corpusRoot, `${slug}.md.meta.json`), JSON.stringify({ title: f.title, updated: f.updated, url: f.url }, null, 2))
      n++
      onProgress?.(n, f.title)
    } catch (e) {
      onProgress?.(n, `SKIP ${page.title}: ${String(e).slice(0, 60)}`)
    }
  }
  return { pages: n, dir: src.corpusRoot, adapter: kind }
}
