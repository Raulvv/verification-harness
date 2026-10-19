// Bounded retry for transient network failures (ECONNRESET mid-stream on the
// hosted route took down a 60/100 private-gen run once — see fix commit).
// Attempts are counted, backoff is linear, and the LAST error is rethrown
// unchanged so a persistent failure still fails loud. Used by private-gen's
// generator call; anything that must never repeat (labeling oracles) keeps
// its own fail-loud guards instead.
export async function withRetry(fn, attempts = 3, delayMs = 1000) {
  if (attempts < 1) throw new Error('withRetry: attempts must be >= 1')
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}
