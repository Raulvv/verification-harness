// The model boundary — OpenAI-compatible vs native Ollama, key resolution,
// loud failures, the bounded 429 retry. `fetch` is stubbed, so no network
// (epic retrieval-kit-refactor Iteration 1, HK-3).
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chatWithUsage } from '../lib/model.mjs'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.RETRIEVAL_API_KEY; delete process.env.RETRIEVAL_THINK })

const okJSON = (body) => ({ ok: true, status: 200, json: async () => body })

test('OpenAI-compatible endpoint: /chat/completions, model, bearer key', async () => {
  let seen
  globalThis.fetch = async (url, opts) => {
    seen = { url, body: JSON.parse(opts.body), headers: opts.headers }
    return okJSON({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } })
  }
  const r = await chatWithUsage({ baseUrl: 'https://api.example/v1', apiKey: 'secret', model: 'm1' }, [{ role: 'user', content: 'q' }])
  assert.equal(seen.url, 'https://api.example/v1/chat/completions')
  assert.equal(seen.body.model, 'm1')
  assert.equal(seen.headers.authorization, 'Bearer secret')
  assert.equal(r.content, 'hi')
  assert.deepEqual(r.usage, { prompt_tokens: 1, completion_tokens: 2 })
})

test('the API key can come from an env var named by the config', async () => {
  let auth
  globalThis.fetch = async (_url, opts) => { auth = opts.headers.authorization; return okJSON({ choices: [{ message: { content: 'ok' } }] }) }
  process.env.MODEL_TEST_KEY = 'from-env'
  await chatWithUsage({ baseUrl: 'https://api.x/v1', apiKeyEnv: 'MODEL_TEST_KEY', model: 'm' }, [])
  delete process.env.MODEL_TEST_KEY
  assert.equal(auth, 'Bearer from-env')
})

test('Ollama endpoint goes native: /api/chat, think honored, usage normalized', async () => {
  let seen
  globalThis.fetch = async (url, opts) => {
    seen = { url, body: JSON.parse(opts.body) }
    return okJSON({ message: { content: 'hey' }, prompt_eval_count: 5, eval_count: 7 })
  }
  const r = await chatWithUsage({ baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama', model: 'qwen' }, [{ role: 'user', content: 'q' }], { think: false, maxTokens: 10 })
  assert.equal(seen.url, 'http://localhost:11434/api/chat') // the /v1 is stripped
  assert.equal(seen.body.think, false)
  assert.equal(seen.body.options.num_predict, 10)
  assert.equal(r.content, 'hey')
  assert.deepEqual(r.usage, { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 })
})

test('format: Ollama native format, OpenAI response_format', async () => {
  const bodies = []
  globalThis.fetch = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body))
    return okJSON({ message: { content: '{}' }, choices: [{ message: { content: '{}' } }] })
  }
  await chatWithUsage({ baseUrl: 'http://localhost:11434', apiKey: 'x', model: 'm' }, [], { format: { type: 'object' } })
  await chatWithUsage({ baseUrl: 'https://api.x/v1', apiKey: 'x', model: 'm' }, [], { format: { type: 'object' } })
  assert.deepEqual(bodies[0].format, { type: 'object' })
  assert.deepEqual(bodies[1].response_format, { type: 'json_object' })
})

test('a non-OK response throws loudly with status and body', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' })
  await assert.rejects(chatWithUsage({ baseUrl: 'https://api.x/v1', apiKey: 'k', model: 'm' }, []), /HTTP 500 boom/)
})

test('a missing key is refused before any request fires', async () => {
  let called = false
  globalThis.fetch = async () => { called = true; return okJSON({ choices: [{ message: { content: '' } }] }) }
  await assert.rejects(chatWithUsage({ baseUrl: 'https://api.x/v1', model: 'm', apiKeyEnv: 'DEFINITELY_UNSET' }, []), /no API key/)
  assert.equal(called, false)
})

test('Ollama thinking is OFF by default; RETRIEVAL_THINK=1 opts back in (HK-12)', async () => {
  const bodies = []
  globalThis.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return okJSON({ message: { content: '' }, prompt_eval_count: 0, eval_count: 0 }) }
  delete process.env.RETRIEVAL_THINK
  await chatWithUsage({ baseUrl: 'http://localhost:11434', apiKey: 'x', model: 'm' }, [])
  process.env.RETRIEVAL_THINK = '1'
  await chatWithUsage({ baseUrl: 'http://localhost:11434', apiKey: 'x', model: 'm' }, [])
  assert.equal(bodies[0].think, false) // default OFF (HK-12)
  assert.equal(bodies[1].think, true) // opt-in
})

test('429 is retried (bounded) and then succeeds', { timeout: 10000 }, async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return calls === 1 ? { ok: false, status: 429, text: async () => 'slow down' } : okJSON({ choices: [{ message: { content: 'ok' } }], usage: {} })
  }
  const r = await chatWithUsage({ baseUrl: 'https://api.x/v1', apiKey: 'k', model: 'm' }, [])
  assert.equal(calls, 2) // one retry, then success
  assert.equal(r.content, 'ok')
})
