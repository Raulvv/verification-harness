// twg transport — one mocked boundary: a fake `twg` executable on PATH
// that records argv and replays the probe fixtures (epic §8.3). Everything
// under the boundary runs for real. Tests with a mutation that could hang
// (removed pagination break) carry a node:test timeout so they go red
// instead of eating the suite (house rule: assert termination).
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTwg, collectPages } from '../../lib/corpus/twg.mjs'
import { installFakeTwg } from '../fake-twg.mjs'

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures', 'confluence')
const P1 = join(FIXTURES, 'content-list.p1.json')
const P2 = join(FIXTURES, 'content-list.p2.json')
const YAML = join(FIXTURES, 'yaml-summary-envelope.txt')

let fake
beforeEach(() => {
  fake = installFakeTwg({
    FAKE_TWG_SCENARIO: 'ok',
    FAKE_TWG_FIXTURE: P1,
    FAKE_TWG_FIXTURE_END: P2,
    FAKE_TWG_YAML: YAML,
  })
})
afterEach(() => fake.teardown())
const calls = () => fake.calls()

test('runTwg: the pure-JSON output contract is enforced — the YAML summary envelope is refused', async () => {
  const res = await runTwg(['confluence', 'content', 'list', '--space', 'DEMO'])
  assert.equal(res.data.total, 5) // fixture envelope parsed, not the YAML
  assert.equal(calls().length, 1) // a contract violation is fatal, never retried
})

test('runTwg: args and --site pass through verbatim to the binary', async () => {
  await runTwg(['confluence', 'content', 'get', '1234567890'], { site: 'x.atlassian.net' })
  assert.deepEqual(calls()[0].split(' '), [
    'confluence', 'content', 'get', '1234567890',
    '-o', 'json', '--output-summary', 'none', '--site', 'x.atlassian.net',
  ])
})

test('runTwg: a transient failure is retried exactly once', async () => {
  process.env.FAKE_TWG_SCENARIO = 'fail-once'
  const res = await runTwg(['confluence', 'content', 'list', '--space', 'DEMO'])
  assert.equal(res.data.total, 5)
  assert.equal(calls().length, 2) // one retry, then success
})

test('runTwg: persistent failure rejects after two attempts and no more', async () => {
  process.env.FAKE_TWG_SCENARIO = 'fail-always'
  await assert.rejects(runTwg(['confluence', 'content', 'list', '--space', 'DEMO']), /exit 1/)
  assert.equal(calls().length, 2) // attempt + one retry; the cap is RN-S02
})

test('runTwg: a hung child is killed at the timeout — and a timeout is never retried', { timeout: 8000 }, async () => {
  process.env.FAKE_TWG_SCENARIO = 'slow' // sleeps 3s then succeeds
  await assert.rejects(runTwg(['confluence', 'content', 'list', '--space', 'DEMO'], { timeoutMs: 1500 }), /timed out after 1500ms/)
  assert.equal(calls().length, 1) // a slow third party gets one try, not two
})

test('collectPages: stops at limit even when nextCursor never empties', { timeout: 3000 }, async () => {
  process.env.FAKE_TWG_SCENARIO = 'cursor-endless' // p1 forever (its nextCursor never empties)
  const items = await collectPages(['confluence', 'content', 'list', '--space', 'DEMO'], { limit: 7 })
  assert.equal(items.length, 7) // 5 + 5 accumulated, sliced to the limit
  assert.equal(calls().length, 2) // and no third request is made
})

test('collectPages: stops when the cursor runs out', { timeout: 3000 }, async () => {
  process.env.FAKE_TWG_SCENARIO = 'cursor-then-end' // p1, then p2 with no nextCursor
  const items = await collectPages(['confluence', 'content', 'list', '--space', 'DEMO'], { limit: 100 })
  assert.equal(items.length, 5) // p1's five results, not an infinite tail
  assert.equal(calls().length, 2)
})

test('collectPages: a live cursor that never yields items stops (no spin, HK-8)', { timeout: 3000 }, async () => {
  process.env.FAKE_TWG_SCENARIO = 'cursor-empty' // an endless cursor with zero results
  const items = await collectPages(['confluence', 'content', 'list', '--space', 'DEMO'], { limit: 5 })
  assert.equal(items.length, 0)
  assert.equal(calls().length, 1) // stopped on the first no-progress page
})

test('runTwg: paces calls (delayMs) so the third party is never hammered', async () => {
  const t0 = Date.now()
  await runTwg(['confluence', 'space', 'get', 'DEMO'], { delayMs: 250 })
  await runTwg(['confluence', 'space', 'get', 'DEMO'], { delayMs: 250 })
  const elapsed = Date.now() - t0
  assert.ok(elapsed >= 480, `two paced calls took ${elapsed}ms — pacing is gone`)
})
