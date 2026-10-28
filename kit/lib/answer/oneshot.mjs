// One-shot answering — orchestration only: words select a window
// (window.mjs), reasoning vets it (vet.mjs), ONE model call reads the window
// and answers in prose, and the receipt (Q / Source / Quote) is assembled
// mechanically from the quotes it copied (assemble.mjs). Evidence is
// mechanical (quotes byte-verified); speech is free.
//
//   askOneShot(model, corpusRoot, question) -> { final: { text }, … }
//
// Split into named stages (epic retrieval-kit-refactor Iteration 3):
//   selectWindow → vet → (iterate) → read → (route / second chance) → assemble.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chatWithUsage } from '../model.mjs'
import { selectByReference } from '../retrieval/window.mjs'
import { selectByDense } from '../retrieval/dense.mjs'
import { pruneByRelevance } from '../retrieval/vet.mjs'
import { PROMPT, PROMPT_NOQUOTE, PROMPT_SENTENCE, PROMPT_SOURCE, PROMPT_SOURCE_V45, PROMPT_V45, ONESHOT_SCHEMA, ONESHOT_SCHEMA_NOQUOTE, ONESHOT_SCHEMA_SENTENCE, ONESHOT_SCHEMA_SOURCE, QUOTE_SCHEMA, ANSWER_EVIDENCE_SCHEMA, PROMPT_QUOTE, PROMPT_ANSWER_EVIDENCE, transcriptish } from './prompt.mjs'
import { parseOneShot, parseQuote } from './parse.mjs'
import { assembleOneShot, assembleSource, rehomeLegs } from './assemble.mjs'
import { unanchoredNumbers } from '../receipts/text.mjs'

// The one place a tier is named (It. 3). The prompt builder, its schema and
// the receipt assembler are chosen TOGETHER, so adding a tier can no longer
// desync the prompt from its schema (the old parallel ternary chains).
const TIERS = {
  full: { build: PROMPT, schema: ONESHOT_SCHEMA, assemble: 'oneshot' },
  v45: { build: PROMPT_V45, schema: ONESHOT_SCHEMA, assemble: 'oneshot' },
  noquote: { build: PROMPT_NOQUOTE, schema: ONESHOT_SCHEMA_NOQUOTE, assemble: 'oneshot' },
  sentence: { build: PROMPT_SENTENCE, schema: ONESHOT_SCHEMA_SENTENCE, assemble: 'oneshot' },
  source: { build: PROMPT_SOURCE, schema: ONESHOT_SCHEMA_SOURCE, assemble: 'source' },
  'source-v45': { build: PROMPT_SOURCE_V45, schema: ONESHOT_SCHEMA_SOURCE, assemble: 'source' },
}
const tierFor = (style) => TIERS[style] ?? TIERS.full

// Iterative retrieval asks the model for the missing hop as a short query.
const BRIDGE_PROMPT = (q, parts) => [
  'Question: ' + q, '', 'Documents:', ...parts, '',
  'What single SHORT search query (a few words — the missing entity or fact) would find the information needed to answer the question? Reply with ONLY the query text.',
].join('\n')

// Layer 0 selection: the default retriever is `reference` (deterministic, no
// embedder); `dense`/`router` opt into the embedding index. The CLI refuses an
// unknown choice at resolve time; a direct library call with one falls back to
// the safe default.
async function selectWindow(retriever, corpusRoot, question, opts) {
  if (retriever === 'dense' || retriever === 'router') {
    return selectByDense(corpusRoot, question, { corpus: opts.corpus, _embed: opts._embed })
  }
  return selectByReference(corpusRoot, question, { corpus: opts.corpus })
}

// Read every candidate into memory, dropping transcript-poisoned files.
const pickDocs = (corpusRoot, loc, opts) => loc.candidates
  .map((c) => ({ rel: c.rel, content: readFileSync(join(resolve(corpusRoot), c.rel), 'utf8') }))
  .filter((d) => !transcriptish(d.content))
  .slice(0, opts.limit ?? 12)

// The second hop: ask the model for the missing entity/fact as a SHORT query,
// retrieve again, union with the base. Recovers the hop a single dense shot
// never sees (HotpotQA bridge 87%→94% recall@6, B45).
async function escalate(corpusRoot, question, base, opts, chat) {
  const baseDocs = pickDocs(corpusRoot, base, opts)
  const baseParts = baseDocs.map((d, i) => `=== DOC ${i + 1}: ${d.rel} ===\n${d.content}`)
  let bridge = ''
  try {
    const r = await chat([{ role: 'user', content: BRIDGE_PROMPT(question, baseParts) }], { maxTokens: 40, think: false })
    bridge = String(r.content ?? '').trim().split('\n')[0].slice(0, 80)
  } catch { bridge = '' }
  if (!bridge) return base
  const loc2 = await selectByDense(corpusRoot, bridge, { corpus: opts.corpus, _embed: opts._embed })
  const rels = [...new Set([...base.candidates.map((c) => c.rel), ...loc2.candidates.map((c) => c.rel)])].slice(0, opts.limit ?? 12)
  const matchOf = new Map([...(base.matches ?? []), ...(loc2.matches ?? [])].map((x) => [x.rel, x]))
  return { candidates: rels.map((rel) => ({ rel })), matches: rels.map((rel) => matchOf.get(rel) ?? { rel, matched: 'iterative', snippet: '' }), method: 'iterative' }
}

// Two attempts, cause-agnostic: a constrained decode can stall mid-JSON
// (measured: f-3 cut mid-identifier at 2k bytes — not our token cap). The
// second attempt asks for a tight answer; if that too breaks, the failure is
// loud and the receipt is an honest NOT FOUND.
async function runRead(chat, tier, question, docs) {
  const parts = docs.map((d, i) => `=== DOC ${i + 1}: ${d.rel} ===\n${d.content}`)
  const call = (compact) => chat([{ role: 'user', content: tier.build(question, parts, compact) }], { maxTokens: 4000, think: false, format: tier.schema })
  let usage = {}
  const failures = []
  for (const compact of [false, true]) {
    try {
      const res = await call(compact)
      usage = res.usage ?? usage
      return { parsed: parseOneShot(res.content), usage, failures }
    } catch (e) {
      failures.push(String(e?.message ?? e))
    }
  }
  return { parsed: null, usage, failures }
}

// Evidence-first pass A: quotes only, no prose, over the same window.
async function runQuote(chat, question, docs) {
  const parts = docs.map((d, i) => `=== DOC ${i + 1}: ${d.rel} ===\n${d.content}`)
  const call = (compact) => chat([{ role: 'user', content: PROMPT_QUOTE(question, parts, compact) }], { maxTokens: 4000, think: false, format: QUOTE_SCHEMA })
  let usage = {}
  const failures = []
  for (const compact of [false, true]) {
    try {
      const res = await call(compact)
      usage = res.usage ?? usage
      return { parsed: parseQuote(res.content), usage, failures }
    } catch (e) {
      failures.push(String(e?.message ?? e))
    }
  }
  return { parsed: null, usage, failures }
}

// Evidence-first pass B: prose from the quotes alone. The documents are NOT in
// this context — the only way a fact reaches the answer is through a quote.
async function runAnswerEvidence(chat, question, quotes) {
  const call = (compact) => chat([{ role: 'user', content: PROMPT_ANSWER_EVIDENCE(question, quotes, compact) }], { maxTokens: 4000, think: false, format: ANSWER_EVIDENCE_SCHEMA })
  let usage = {}
  const failures = []
  for (const compact of [false, true]) {
    try {
      const res = await call(compact)
      usage = res.usage ?? usage
      return { parsed: parseOneShot(res.content), usage, failures }
    } catch (e) {
      failures.push(String(e?.message ?? e))
    }
  }
  return { parsed: null, usage, failures }
}

async function runEvidenceFirst(chat, question, docs, allow = []) {
  const q = await runQuote(chat, question, docs)
  if (!q.parsed || q.parsed.notFound || !q.parsed.quotes.length) return { parsed: null, usage: q.usage, failures: q.failures }
  const { kept } = rehomeLegs(docs, q.parsed.quotes)
  if (!kept.length) return { parsed: null, usage: q.usage, failures: q.failures }
  const evidence = kept.map((l) => ({ doc: l.doc, quote: l.quote }))
  const a = await runAnswerEvidence(chat, question, evidence)
  const usage = {
    prompt_tokens: (q.usage.prompt_tokens ?? 0) + (a.usage.prompt_tokens ?? 0),
    completion_tokens: (q.usage.completion_tokens ?? 0) + (a.usage.completion_tokens ?? 0),
  }
  if (q.usage.cost != null || a.usage.cost != null) usage.cost = (q.usage.cost ?? 0) + (a.usage.cost ?? 0)
  const failures = [...q.failures, ...a.failures]
  if (!a.parsed || a.parsed.notFound) return { parsed: null, usage, failures }
  const unanchored = unanchoredNumbers(a.parsed.answer, evidence.map((e) => e.quote), { allow })
  return { parsed: { ...a.parsed, quotes: evidence }, usage, failures, evidence, unanchored }
}

export async function askOneShot(m, corpusRoot, question, opts = {}) {
  const t0 = Date.now()
  const retriever = opts.retriever ?? 'reference'
  const tier = tierFor(opts.promptStyle)
  const chat = opts._chat ?? ((msgs, o) => chatWithUsage(m, msgs, o))

  // the double pass: words select (pass 1), reasoning vets (pass 2) —
  // matches whose phrase/paragraph doesn't bear on the question are discarded
  // before composition.
  const providedDocs = Array.isArray(opts.docs) ? opts.docs : null
  let loc = providedDocs
    ? { candidates: providedDocs.map((d) => ({ rel: d.rel })), method: 'provided' }
    : await selectWindow(retriever, corpusRoot, question, opts)
  let vetted = { dropped: [] }
  const tSelect = Date.now() - t0
  // Speed gate (measured 2026-10-01, broadened 2026-10-01): the vet is a whole
  // model call — ~1.8 s, 20% of the Confluence run — while selection is free
  // (0.8%). A window of ONE candidate is already as small as any prune could
  // make it; skip the call. Windows of 2+ keep the vet.
  const singleCandidate = loc.candidates?.length === 1
  let tVet = 0
  // dense already ranks by relevance — the lexical-vet pass (built to prune
  // wide word-match windows) drops the right file on a homogeneous corpus, so
  // it is skipped for the dense retriever.
  if (retriever === 'reference' && loc.matches?.length && !singleCandidate) {
    vetted = await pruneByRelevance(m, question, loc.matches, { _chat: opts._vet })
    loc = { ...loc, candidates: vetted.kept.map((x) => ({ rel: x.rel })) }
    tVet = Date.now() - t0 - tSelect
  }
  let docs = providedDocs ?? pickDocs(corpusRoot, loc, opts)
  const tLocate = Date.now() - t0
  const t1 = Date.now()
  let parsed = null
  let usage = {}
  let failures = []
  let evidence = null
  let unanchored = []
  if (opts.evidenceFirst === true) {
    const r = await runEvidenceFirst(chat, question, docs, opts.evidenceAllow ?? [])
    usage = r.usage
    failures = r.failures
    evidence = r.evidence ?? null
    unanchored = r.unanchored ?? []
    parsed = r.parsed
    if (parsed && opts.evidenceAnchor === 'abstain' && unanchored.length) {
      parsed = { answer: `NOT FOUND — the corpus does not state ${question}`, quotes: [], sources: [], notFound: true }
      evidence = null
      unanchored = []
    }
    // A failed quote pass (or an answer pass that abstained) falls back to the
    // single-pass read by default, so coverage never drops silently; pass
    // evidenceFallback:false to make the evidence boundary absolute.
    if (!parsed && opts.evidenceFallback !== false) {
      ({ parsed, usage, failures } = await runRead(chat, tier, question, docs))
    }
  } else {
    ({ parsed, usage, failures } = await runRead(chat, tier, question, docs))
  }

  // Router (opt-in, `dense`'s upgrade): dense first; the abstention IS the
  // router — only when the first read says NOT FOUND do we take the second hop
  // and re-read. A non-abstention is never re-windowed, so a confident dense
  // answer pays nothing extra.
  if (retriever === 'router' && parsed?.notFound && loc.candidates?.length) {
    const esc = await escalate(corpusRoot, question, loc, opts, chat)
    if (esc !== loc) {
      const escDocs = pickDocs(corpusRoot, esc, opts)
      const r2 = await runRead(chat, tier, question, escDocs)
      if (r2.parsed && !r2.parsed.notFound) { docs = escDocs; parsed = r2.parsed; usage = r2.usage; failures = r2.failures }
    }
  }

  // Second chance (2026-10-01): a NAMED window that ABSTAINS is retried ONCE
  // over the wider content search — the reference trap (a title phrase matched
  // while the fact lived inside another doc). Only a non-abstention from the
  // wide pass replaces the result.
  if (retriever === 'reference' && loc.method === 'reference' && parsed?.notFound) {
    const wide = selectByReference(corpusRoot, question, { corpus: opts.corpus, forceFallback: true })
    if (wide.matches?.length) {
      const wv = await pruneByRelevance(m, question, wide.matches, { _chat: opts._vet })
      wide.candidates = wv.kept.map((x) => ({ rel: x.rel }))
      const wideDocs = pickDocs(corpusRoot, wide, opts)
      const r2 = await runRead(chat, tier, question, wideDocs)
      if (r2.parsed && !r2.parsed.notFound) { docs = wideDocs; parsed = r2.parsed; usage = r2.usage; failures = r2.failures; vetted = wv }
    }
  }
  const tModel = Date.now() - t1
  // Cost/token accounting includes the selection-vet call: it is a real reader
  // call, and hiding it made D's cost look smaller than it is.
  const vetUsage = vetted.usage ?? null
  if (vetUsage) {
    usage = {
      ...usage,
      prompt_tokens: (usage.prompt_tokens ?? 0) + (vetUsage.prompt_tokens ?? 0),
      completion_tokens: (usage.completion_tokens ?? 0) + (vetUsage.completion_tokens ?? 0),
    }
    if (vetUsage.cost != null) usage.cost = (usage.cost ?? 0) + vetUsage.cost
  }
  const tokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
  if (!parsed) {
    return {
      question, attempts: docs.map((d) => ({ rel: d.rel })), final: { text: `Q: NOT FOUND\nSource: NOT FOUND\nQuote: NOT FOUND` },
      parseFailures: failures.map((f) => 'oneshot: ' + f), usage, timings: { select_ms: tSelect, vet_ms: tVet, locate_ms: tLocate, model_ms: tModel, total_ms: Date.now() - t0 }, tokens,
    }
  }
  const assembled = tier.assemble === 'source'
    ? assembleSource(corpusRoot, question, docs, parsed)
    : assembleOneShot(corpusRoot, question, docs, parsed, { minimizeReceipt: opts.minimizeReceipt === true, maxQuotesPerDoc: opts.maxQuotesPerDoc })
  return {
    question, attempts: docs.map((d) => ({ rel: d.rel })), docs, parsed,
    final: { text: assembled.text }, legs: assembled.legs, citations: assembled.citations ?? [],
    droppedLegs: assembled.dropped, windowDropped: vetted.dropped, window: docs.map((d) => d.rel),
    evidence, unanchored, evidenceFirst: opts.evidenceFirst === true,
    parseFailures: [], usage, timings: { select_ms: tSelect, vet_ms: tVet, locate_ms: tLocate, model_ms: tModel, total_ms: Date.now() - t0 }, tokens,
  }
}
