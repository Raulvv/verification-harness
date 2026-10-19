// confluence adapter — the mirror materializes from the probe fixtures
// through the real transport and the real syncSource (epic §8.3: the only
// mocked boundary is the twg process). Date faithfulness (RN-S03),
// "what a reader reads" (RN-S04) and "never re-ask unchanged" (RN-S02)
// are the behaviours under guard.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSource, syncSource } from '../../lib/corpus/source.mjs'
import { installFakeTwg } from '../fake-twg.mjs'

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures', 'confluence')
const SEARCH = join(FIXTURES, 'search.json')
const SEARCH_END = join(FIXTURES, 'search-page2.json')

let dir, fake, getDir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'conf-'))
  getDir = join(dir, 'gets')
  mkdirSync(getDir)
  // The real API returns each page's own envelope per id; the fixtures
  // vary id/title/createdAt the same way, from the one dumped envelope —
  // createdAt mirrors the listing's lastModified (same real-world event).
  const tmpl = JSON.parse(readFileSync(join(FIXTURES, 'page-get.html.json'), 'utf8'))
  for (const r of JSON.parse(readFileSync(SEARCH, 'utf8')).data.results) {
    const env = structuredClone(tmpl)
    env.data.id = r.content.id
    env.data.title = r.title
    env.data.metadata.version.createdAt = r.lastModified
    writeFileSync(join(getDir, `${r.content.id}.json`), JSON.stringify(env))
  }
  fake = installFakeTwg({
    FAKE_TWG_SCENARIO: 'adapter',
    FAKE_TWG_SEARCH: SEARCH,
    FAKE_TWG_SEARCH_END: SEARCH_END,
    FAKE_TWG_GET_DIR: getDir,
  })
})
afterEach(() => {
  fake.teardown()
  rmSync(dir, { recursive: true, force: true })
})

const confSource = (extra = {}) =>
  normalizeSource({ source: { type: 'confluence', url: 'https://fixture.atlassian.net', space: 'DEMO', delayMs: 0, mirror: join(dir, 'm'), ...extra } }, dir)

test('confluence sync: CQL enumeration maps the envelope — nested pages included, limit trims', async () => {
  const src = confSource({ limit: 1 }) // the search fixture holds 2
  const r = await syncSource(src)
  assert.equal(r.pages, 1) // limit trims, not a sweep
  assert.equal(r.adapter, 'confluence')
  const meta = JSON.parse(readFileSync(join(dir, 'm', 'Fixture_Result_One.md.meta.json'), 'utf8'))
  assert.deepEqual(meta, {
    title: 'Fixture Result One',
    updated: '2026-08-10', // the source's own date, never now
    url: 'https://fixture.atlassian.net/wiki/spaces/DEMO/pages/5382537278',
  })
  const listCall = fake.calls()[0]
  assert.ok(listCall.includes('--cql space = "DEMO" AND type = page'), `not a CQL enumeration: ${listCall}`)
  assert.ok(listCall.includes('--limit 1'), `list asked for an unbounded page: ${listCall}`)
  assert.equal(fake.calls().length, 2) // 1 search + 1 get, nothing else
})

test('confluence sync: sidecars carry the source\'s real dates and the html body survives as reading text', async () => {
  const r = await syncSource(confSource({ limit: 2 }))
  assert.equal(r.pages, 2)
  const one = JSON.parse(readFileSync(join(dir, 'm', 'Fixture_Result_One.md.meta.json'), 'utf8'))
  const two = JSON.parse(readFileSync(join(dir, 'm', 'Fixture_Result_Two.md.meta.json'), 'utf8'))
  assert.equal(one.updated, '2026-08-10')
  assert.equal(two.updated, '2026-08-06')
  const body = readFileSync(join(dir, 'm', 'Fixture_Result_One.md'), 'utf8')
  assert.ok(body.includes('# Fixture Heading One')) // html→text reading
  assert.ok(body.includes('Fixture panel text one.')) // panel text survives
  assert.ok(!body.includes('<h1')) // tags die
  assert.ok(!body.includes('data-type')) // machinery dies
})

test('confluence sync: current pages are never re-asked — the mirror is the cache', async () => {
  const src = confSource({ limit: 2 })
  await syncSource(src)
  const before = fake.calls().length
  const r2 = await syncSource(src)
  assert.equal(r2.pages, 0) // nothing to write — everything is current
  assert.equal(fake.calls().length - before, 1) // one search, zero gets
  assert.ok(readFileSync(join(dir, 'm', 'Fixture_Result_One.md'), 'utf8').includes('Fixture panel text one.'))
})

test('confluence sync: a changed page is re-fetched — and only that one', async () => {
  const src = confSource({ limit: 2 })
  await syncSource(src)
  const metaPath = join(dir, 'm', 'Fixture_Result_One.md.meta.json')
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  meta.updated = '2020-01-01' // the sidecar no longer matches the listing
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  const before = fake.calls().length
  const r2 = await syncSource(src)
  assert.equal(r2.pages, 1) // only the stale one re-fetched
  assert.equal(fake.calls().length - before, 2) // 1 search + 1 get
  assert.equal(JSON.parse(readFileSync(metaPath, 'utf8')).updated, '2026-08-10') // healed
})

test('confluence sync: a failing page is skipped and named — the run survives', async () => {
  process.env.FAKE_TWG_FAIL_ID = '5371756560' // Fixture Result Two's get fails
  const progress = []
  const r = await syncSource(confSource({ limit: 2 }), { onProgress: (n, msg) => progress.push(msg) })
  assert.equal(r.pages, 1) // the other one lands
  assert.ok(progress.some((m) => /SKIP .*Fixture Result Two/.test(m)), `no SKIP in ${JSON.stringify(progress)}`)
  assert.equal(fake.calls().length, 4) // 1 search + 1 good get + the failed get's single allowed retry
})

test('confluence: a missing space is loud, an unreachable source is loud', async () => {
  await assert.rejects(syncSource(confSource({ space: undefined, limit: 2 })), /needs `space`/)
  process.env.FAKE_TWG_FAIL_LIST = '1'
  await assert.rejects(syncSource(confSource({ limit: 2 })), /exit 1/)
})

test('confluence: a scoped cql becomes the corpus definition (cluster syncs)', async () => {
  await syncSource(confSource({ limit: 2, cql: 'space = "DEMO" AND type = page AND title ~ "Fixture topic"' }))
  assert.ok(fake.calls()[0].includes('--cql space = "DEMO" AND type = page AND title ~ "Fixture topic"'), `cql override lost: ${fake.calls()[0]}`)
})
