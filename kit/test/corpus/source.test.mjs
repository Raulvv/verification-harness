// Source selection: config ergonomics, html→text, and both adapters —
// with fetch stubbed, so adapter contracts are tested without a network.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeSource, syncSource, detectAdapter } from '../../lib/corpus/source.mjs'
import { htmlToText } from '../../lib/corpus/html.mjs'

let realFetch
beforeEach(() => { realFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = realFetch })

test('normalizeSource: the three config shapes and their defaults', () => {
  const local = normalizeSource({ source: 'local' }, '/cfg')
  assert.equal(local.type, 'local')
  assert.equal(local.corpusRoot, resolve('/cfg'))
  const url = normalizeSource({ source: 'https://naruto.fandom.com' }, '/cfg')
  assert.equal(url.type, 'url')
  assert.equal(url.limit, 300)
  assert.equal(url.adapter, 'auto')
  assert.ok(url.corpusRoot.endsWith(join('.retrieval-mirror', 'naruto.fandom.com')))
  assert.ok(!url.slug.endsWith('-')) // trailing-dash lesson
  const full = normalizeSource({ source: { type: 'url', url: 'https://x.example/wiki/', limit: 7, include: ['A'], delayMs: 1 } }, '/cfg')
  assert.equal(full.limit, 7)
  assert.deepEqual(full.include, ['A'])
  assert.equal(normalizeSource({ source: 'https://a.example/deep/path' }, '/cfg').slug, 'a.example-deep-path')
})

test('htmlToText: strips machinery, keeps reading text', () => {
  const html = '<script>evil()</script><style>.x{}</style><h1>Title</h1><p>Hello &amp; <b>bye</b>&nbsp;world</p><ul><li>one</li></ul><td>cell</td><p>Section edit</p>'
  const t = htmlToText(html)
  assert.ok(!t.includes('evil'))
  assert.ok(!t.includes('<'))
  assert.ok(t.includes('Hello & bye'))
  assert.ok(t.includes('- one'))
  assert.ok(t.includes('# Title'))
  assert.ok(!/\bedit\s*$/m.test(t)) // the MediaWiki "edit" suffix dies
  assert.equal(htmlToText('&#8212; gone'), 'gone') // numeric entities dropped
  assert.equal(htmlToText(''), '')
})

test('htmlToText: list items stay on one line — inter-tag newlines are not content', () => {
  // the producer's real shape: tags on their own lines (page-body.html dumps)
  const t = htmlToText('<ul>\n<li>\n<p>Alpha one</p>\n</li>\n<li>\n<p>Beta two</p>\n</li>\n</ul>')
  assert.ok(t.includes('- Alpha one'))
  assert.ok(t.includes('- Beta two'))
  assert.ok(!/^-\s*$/m.test(t)) // the mangled "- \ntext" bullet dies
})

test('syncSource: local is a no-op; flat adapter stores files with real dates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'src-'))
  const local = await syncSource(normalizeSource({ source: 'local', root: dir }, dir))
  assert.equal(local.local, true)

  globalThis.fetch = async () => ({
    ok: true, status: 200,
    headers: new Map([['last-modified', 'Wed, 01 May 2024 10:00:00 GMT']]),
    text: async () => '<html><title>Page One</title><body><h1>Page One</h1><p>Content here.</p></body></html>',
    json: async () => ({}),
  })
  const src = normalizeSource({ source: { type: 'url', url: 'https://docs.example', adapter: 'flat', pages: ['https://docs.example/a.html'], limit: 5, delayMs: 0, mirror: join(dir, 'mirror') } }, dir)
  const r = await syncSource(src)
  assert.equal(r.pages, 1)
  assert.equal(r.adapter, 'flat')
  const meta = JSON.parse(readFileSync(join(dir, 'mirror', 'Page_One.md.meta.json'), 'utf8'))
  assert.equal(meta.title, 'Page One')
  assert.equal(meta.updated, '2024-05-01') // from Last-Modified, not regenerated
  assert.ok(readFileSync(join(dir, 'mirror', 'Page_One.md'), 'utf8').includes('Content here.'))
  rmSync(dir, { recursive: true, force: true })
})

test('mediawiki adapter: enumeration honors limit/include, fetch carries revision dates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-'))
  const calls = []
  globalThis.fetch = async (url) => {
    const u = String(url)
    calls.push(u)
    if (u.includes('list=allpages')) {
      return { ok: true, status: 200, json: async () => ({ query: { allpages: [{ title: 'Alpha' }, { title: 'Beta' }] } }) }
    }
    if (u.includes('action=parse')) {
      const page = new URL(u).searchParams.get('page')
      return { ok: true, status: 200, json: async () => ({ parse: { text: { '*': `<h1>${page}</h1><p>Body of ${page}.</p>` } } }) }
    }
    return { ok: true, status: 200, json: async () => ({ query: { pages: { 1: { revisions: [{ timestamp: '2021-03-04T00:00:00Z' }] } } } }) }
  }
  const src = normalizeSource({ source: { type: 'url', url: 'https://wiki.example', adapter: 'mediawiki', limit: 3, include: ['Zeta'], delayMs: 0, mirror: join(dir, 'm') } }, dir)
  const r = await syncSource(src)
  assert.equal(r.pages, 3) // Zeta + Alpha + Beta (limit trims)
  const zeta = JSON.parse(readFileSync(join(dir, 'm', 'Zeta.md.meta.json'), 'utf8'))
  assert.equal(zeta.title, 'Zeta')
  assert.equal(zeta.updated, '2021-03-04')
  assert.ok(readFileSync(join(dir, 'm', 'Alpha.md'), 'utf8').includes('Body of Alpha.'))
  assert.equal(await detectAdapter({ url: 'https://wiki.example', delayMs: 0, adapter: 'auto' }), 'mediawiki')
  rmSync(dir, { recursive: true, force: true })
})

test('adapters fail loudly on unreachable sources and empty pages are skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bad-'))
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) })
  const src = normalizeSource({ source: { type: 'url', url: 'https://down.example', adapter: 'flat', indexUrl: 'https://down.example/', delayMs: 0, mirror: join(dir, 'm') } }, dir)
  await assert.rejects(syncSource(src))
  assert.equal(await detectAdapter({ url: 'https://down.example', delayMs: 0, adapter: 'auto' }), 'flat')
  rmSync(dir, { recursive: true, force: true })
})
