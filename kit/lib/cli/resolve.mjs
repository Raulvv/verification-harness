// The `ask` resolution ladder (RN-G02): flags → env → nearest sealed workspace
// → safe defaults. No hand-edited config is required; an unresolvable chat
// model fails loud with the one-line fix. The embedder is optional (RN-G03):
// dense/router when it is reachable, the deterministic `reference` retriever
// otherwise.
import { resolve } from 'node:path'
import { findWorkspace, corpusOf } from './workspace.mjs'

const DEFAULT_BASE = 'http://localhost:11434/v1'
const DEFAULT_EMBED = 'nomic-embed-text'
const DEFAULT_LOCAL_MODEL = 'qwen3.5:4b'
const DEFAULT_TIER = 'source-v45'
const QUOTE_TIER = 'v45'
const DEFAULT_JUDGE = 'qwen3.5:9b'

export const isOllamaUrl = (u) => /:11434|ollama/i.test(u || '')
export const ollamaRoot = (baseUrl) => String(baseUrl || DEFAULT_BASE).replace(/\/$/, '').replace(/\/v1$/, '')

// Is the embedder reachable and does it list the model? Injectable for tests.
export async function probeEmbedder(baseUrl, embedModel, { fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetchImpl(`${ollamaRoot(baseUrl)}/api/tags`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return false
    const names = ((await res.json()).models ?? []).map((m) => m.name)
    return names.some((n) => n === embedModel || n.startsWith(embedModel + ':'))
  } catch {
    return false
  }
}

export async function resolveAsk({ flags = {}, env = process.env, cwd = process.cwd(), probe } = {}) {
  const ws = findWorkspace(cwd)
  const wc = ws?.config ?? {}

  const baseUrl = flags.baseUrl ?? env.RETRIEVAL_BASE_URL ?? wc.baseUrl ?? DEFAULT_BASE
  const embedModel = flags.embedModel ?? env.RETRIEVAL_EMBED_MODEL ?? wc.embedModel ?? DEFAULT_EMBED
  // The embedder is always local Ollama (see lib/retrieval/embed.mjs, which uses
  // OLLAMA_URL) — independent of the chat model's base URL. Probe THERE, never
  // the chat endpoint.
  const embedBaseUrl = env.OLLAMA_URL ?? wc.embedBaseUrl ?? 'http://localhost:11434'
  const tier = flags.quote ? QUOTE_TIER : (flags.tier ?? wc.tier ?? DEFAULT_TIER)
  const ollama = isOllamaUrl(baseUrl)
  const apiKey = flags.apiKey ?? env.RETRIEVAL_API_KEY ?? (ollama ? 'ollama' : null)
  const apiKeyEnv = flags.apiKeyEnv ?? wc.apiKeyEnv ?? null
  const model = flags.model ?? env.RETRIEVAL_MODEL ?? wc.model ?? (ollama ? DEFAULT_LOCAL_MODEL : null)

  const corpusRoot = flags.corpus ? resolve(cwd, flags.corpus) : ws ? corpusOf(ws) : null
  if (!corpusRoot) {
    throw new Error('no corpus — run `retrieval-kit config --corpus <dir>` once, or pass a folder / --corpus')
  }
  if (!model) {
    throw new Error('no chat model — pass --model, set RETRIEVAL_MODEL, or run `retrieval-kit config --model <id>`')
  }
  if (!apiKey && !apiKeyEnv && env.RETRIEVAL_API_KEY == null && !ollama) {
    throw new Error('no api key — set RETRIEVAL_API_KEY, pass --api-key-env <VAR>, or point --base-url at a local model')
  }

  // The shipped default is `router` (dense → abstain → iterative). There is no
  // silent fallback: if the embedder the router needs is unreachable, fail loud
  // with the fix. `--retriever reference` is the explicit embedder-free path.
  let retriever = flags.retriever ?? wc.retriever ?? null
  if (!retriever) {
    const reachable = await (probe ?? probeEmbedder)(embedBaseUrl, embedModel)
    if (!reachable) {
      throw new Error(`the default retriever needs a local embedder at ${ollamaRoot(embedBaseUrl)} (run \`ollama pull ${embedModel}\`) — or pass --retriever reference`)
    }
    retriever = 'router'
  }

  // Optional sufficiency judge (RN: honest abstention is a judge, not a regex).
  // Local Ollama by default; the model is explicit because reliability scales
  // with judge capability.
  const sufficient = Boolean(flags.sufficient ?? wc.sufficient)
  // Tri-state: with --sufficient, an INSUFFICIENT verdict abstains by default;
  // --unverified keeps the answer but flags it (verified / unverified / not found).
  const unverified = Boolean(flags.unverified ?? env.RETRIEVAL_UNVERIFIED ?? wc.unverified)
  const judgeBaseUrl = flags.judgeBaseUrl ?? env.RETRIEVAL_JUDGE_BASE_URL ?? wc.judgeBaseUrl ?? 'http://localhost:11434/v1'
  const judge = {
    baseUrl: judgeBaseUrl,
    apiKey: isOllamaUrl(judgeBaseUrl) ? 'local' : (env.RETRIEVAL_API_KEY ?? undefined),
    model: flags.judge ?? env.RETRIEVAL_JUDGE ?? wc.judge ?? DEFAULT_JUDGE,
  }
  // A command judge (an external grounding detector) wins over the chat judge.
  const judgeCmd = flags.judgeCmd ?? env.RETRIEVAL_JUDGE_CMD ?? wc.judgeCmd ?? null
  // What the judge sees: the whole retrieved window (default, measured best —
  // B87), the receipt's own evidence, or the union of every cited document.
  const judgeEvidence = flags.judgeEvidence ?? env.RETRIEVAL_JUDGE_EVIDENCE ?? wc.judgeEvidence ?? 'window'
  // The graded gate bands (frozen, B95): abstain score<lo, unverified lo..hi-1,
  // verified score>=hi. lo=2, hi=5 on HotpotQA dev 301-600.
  const gateLo = Number(flags.lo ?? env.RETRIEVAL_GATE_LO ?? wc.gateLo ?? 2)
  const gateHi = Number(flags.hi ?? env.RETRIEVAL_GATE_HI ?? wc.gateHi ?? 5)
  // Optional corpus allowlist (the battery restricts to a named file set).
  const corpusFiles = flags.files ? String(flags.files).split(',').map((s) => s.trim()).filter(Boolean) : (wc.files ?? null)
  return { corpusRoot, model: { baseUrl, apiKey: apiKey ?? undefined, apiKeyEnv: apiKeyEnv ?? undefined, model }, modelId: model, embedModel, retriever, tier, sufficient, unverified, judge, judgeCmd, judgeEvidence, gateLo, gateHi, corpusFiles }
}
