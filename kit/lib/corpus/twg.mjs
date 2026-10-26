// twg transport — the only place this kit talks to Atlassian's CLI.
// The third-party conduct rule lives here as code (RN-S02/RN-S06): a
// fixed output contract, a kill-on-timeout, at most one retry and only
// for transient exit failures (a timeout or a contract violation is
// never retried), optional pacing between calls, and a cursor iterator
// that terminates at `limit` — no other loop shape exists.
import { execFile } from 'node:child_process'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const OUTPUT_CONTRACT = ['-o', 'json', '--output-summary', 'none']

function spawnOnce(bin, argv, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, argv, { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = err.killed
          ? new Error(`twg timed out after ${timeoutMs}ms`)
          : new Error(`twg failed (exit ${err.code}): ${String(stderr || err.message).trim().slice(0, 300)}`)
        if (err.killed) e.fatal = true // a slow third party is not hammered (RN-S02)
        return reject(e)
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        const e = new Error('twg returned non-JSON output — the --output-summary contract is broken')
        e.fatal = true // a contract violation is not transient
        reject(e)
      }
    })
  })
}

export async function runTwg(args, opts = {}) {
  const { bin = 'twg', site, timeoutMs = 30000, retries = 1, delayMs = 0 } = opts
  const argv = [...args, ...OUTPUT_CONTRACT, ...(site ? ['--site', site] : [])]
  let err
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const out = await spawnOnce(bin, argv, timeoutMs)
      if (delayMs) await sleep(delayMs) // pacing, like the HTTP adapters
      return out
    } catch (e) {
      err = e
      if (delayMs) await sleep(delayMs)
      if (e.fatal || attempt === retries) throw e
    }
  }
  throw err
}

// Collect `data.results` across cursor pages until the cursor runs out or
// `limit` items exist. Termination is the contract: endless `nextCursor` still
// stops, and so does a missing one. A page that returns a cursor but adds no
// items is a stall — stop rather than spin (HK-8).
export async function collectPages(args, opts = {}) {
  const { limit = 300, ...rest } = opts
  const items = []
  let cursor
  while (items.length < limit) {
    const before = items.length
    const res = await runTwg([...args, ...(cursor ? ['--cursor', cursor] : [])], rest)
    items.push(...(res.data?.results ?? []))
    cursor = res.data?.nextCursor
    if (!cursor) break
    if (items.length === before) break // no progress with a live cursor: stop
  }
  return items.slice(0, limit)
}
