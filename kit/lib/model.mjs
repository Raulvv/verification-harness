// OpenAI-compatible model access — the "bring your own models" surface.
// Any endpoint that speaks /chat/completions works (hosted API, Ollama,
// vLLM, a proxy) — the contract is what matters, not the vendor.
//
// Ollama is special-cased: its OpenAI-compat layer ignores the thinking
// switches, while its native /api/chat honors "think": false. Hidden
// reasoning was eating the output budget (a "2+2?" probe burned 60+
// reasoning tokens and never answered) — local models go native with
// thinking OFF (RETRIEVAL_THINK=1 re-enables it).
import { setTimeout as sleep } from 'node:timers/promises'
import { randomBytes } from 'node:crypto'

function keyFor(m) {
  if (m.apiKey) return m.apiKey
  if (m.apiKeyEnv && process.env[m.apiKeyEnv]) return process.env[m.apiKeyEnv]
  if (process.env.RETRIEVAL_API_KEY) return process.env.RETRIEVAL_API_KEY
  throw new Error(`no API key for ${m.label ?? m.model} (set ${m.apiKeyEnv ?? 'RETRIEVAL_API_KEY'})`)
}

function isOllama(m) {
  return m.native === true || /:11434/.test(m.baseUrl || '') || /ollama/i.test(m.baseUrl || '')
}

// normalize Ollama's native response to the OpenAI shape the caller expects
function normalizeOllama(j) {
  const msg = j.message ?? {}
  return {
    choices: [{ message: { role: 'assistant', content: msg.content ?? '', reasoning: msg.reasoning ?? '' } }],
    usage: {
      prompt_tokens: j.prompt_eval_count ?? 0,
      completion_tokens: j.eval_count ?? 0,
      total_tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0),
    },
  }
}

async function complete(m, body) {
  const ollama = isOllama(m)
  const base = m.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '')
  const url = ollama ? base + '/api/chat' : m.baseUrl.replace(/\/$/, '') + '/chat/completions'
  // Thinking is OFF by default (the design above): a caller that omits `think`
  // gets no hidden reasoning. An explicit body.think always wins;
  // RETRIEVAL_THINK=1 opts back in. (HK-12 — precedence used to make the
  // default ON, contradicting the comment.)
  const { think: thinkOpt, jsonSchema, ...bodyRest } = body
  const wantThink = thinkOpt ?? process.env.RETRIEVAL_THINK === '1'
  const payload = ollama
    ? {
        model: m.model,
        messages: body.messages ?? [],
        stream: false,
        think: wantThink,
        ...(body.format ? { format: body.format } : jsonSchema ? { format: jsonSchema } : {}),
        options: { temperature: body.temperature ?? 0, ...(body.max_tokens ? { num_predict: body.max_tokens } : {}) },
      }
    : {
        // `think` is Ollama-only; hosted OpenAI-compatible endpoints reject it
        // (measured: GLM 400s on it, DeepSeek tolerates it — don't gamble).
        model: m.model,
        ...bodyRest,
        // A strict schema constrains the answer to the allowed shape (a judge
        // must return {verdict}/{score}, never prose); a bare format only asks
        // for json_object. Not every model honors json_schema (deepseek returns
        // empty) — the judge must be one that does.
        ...(jsonSchema
          ? { response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema: jsonSchema } } }
          : body.format ? { format: undefined, response_format: { type: 'json_object' } } : {}),
      }
  for (let attempt = 0; ; attempt++) {
    const headers = { 'content-type': 'application/json', authorization: m.auth ?? `Bearer ${keyFor(m)}` }
    // The opencode zen gateway routes by session id; without it the request 400s.
    if (m.provider === 'opencode' || /opencode\.ai/.test(m.baseUrl || '')) headers['x-opencode-session'] = 'ses_' + randomBytes(12).toString('hex')
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (res.status === 429 && attempt < 2) { await sleep(2000 * (attempt + 1)); continue }
    if (!res.ok) throw new Error(`${m.model}: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`)
    const j = await res.json()
    return ollama ? normalizeOllama(j) : j
  }
}

export async function chatWithUsage(m, messages, opts = {}) {
  const data = await complete(m, {
    messages,
    temperature: opts.temperature ?? 0,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.think !== undefined ? { think: opts.think } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.jsonSchema ? { jsonSchema: opts.jsonSchema } : {}),
  })
  return { content: data.choices?.[0]?.message?.content ?? '', usage: data.usage ?? {} }
}
