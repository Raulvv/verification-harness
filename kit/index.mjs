// kit/index.mjs — the kit's PUBLIC FACADE (RN-K03).
//
// This is the only supported import for consumers outside `kit/`. Everything
// under `kit/lib/**` is internal and may move; this surface is frozen by
// `kit/test/structure/exports-surface.test.mjs`. Add a symbol here
// deliberately, with a matching edit to that guard — never by reaching into
// `lib/` from a consumer.
//
// The parent repo's bench (`bench/**`) and scripts still import `kit/lib/**`
// by deep path today; migrating every consumer to this
// facade is Iteration 4 of the kit refactor epic. This file
// only re-exports — it changes no behaviour.

// ── config + model boundary ────────────────────────────────────────────────
export { loadConfig } from './lib/config.mjs'
export { chatWithUsage } from './lib/model.mjs'

// ── answer orchestration ───────────────────────────────────────────────────
export { askOneShot } from './lib/answer/oneshot.mjs'
export { askAggregate } from './lib/answer/aggregate.mjs'
export { parseOneShot } from './lib/answer/parse.mjs'
export { rehomeLegs, assembleOneShot, assembleSource } from './lib/answer/assemble.mjs'
export {
  ONESHOT_SCHEMA, ONESHOT_SCHEMA_NOQUOTE, ONESHOT_SCHEMA_SENTENCE, ONESHOT_SCHEMA_SOURCE,
  PROMPT, PROMPT_NOQUOTE, PROMPT_SENTENCE, PROMPT_SOURCE, PROMPT_SOURCE_V45, PROMPT_V45,
  transcriptish,
} from './lib/answer/prompt.mjs'

// ── retrieval: window selection, dense/BM25 fusion, vet, deterministic locate ─
export { selectByReference, mdFiles, snippetFor, stem, splitId } from './lib/retrieval/window.mjs'
export { denseIndex, selectByDense, selectFuse, selectUnion } from './lib/retrieval/dense.mjs'
export { pruneByRelevance } from './lib/retrieval/vet.mjs'
export { locate, rank } from './lib/retrieval/locate.mjs'
export { questionTerms } from './lib/retrieval/terms.mjs'

// ── receipts: the mechanical truth ─────────────────────────────────────────
export { verify } from './lib/receipts/gate.mjs'
export { scoreItem, scoreAll } from './lib/receipts/score.mjs'
export { splitLegs, citeDate, monthYear, parseCite } from './lib/receipts/cite.mjs'
export { norm, ABSTAIN_TERMS, liftEvidence, evidenceMatches, abstainLine, parseAnswer } from './lib/receipts/text.mjs'

// ── corpus: source materialization, metadata, embeddings ───────────────────
export { normalizeSource, ADAPTERS, detectAdapter, syncSource } from './lib/corpus/source.mjs'
export { runTwg, collectPages } from './lib/corpus/twg.mjs'
export { htmlToText } from './lib/corpus/html.mjs'
export { resolveTitle, resolveDate, resolveMeta } from './lib/corpus/meta.mjs'
export { EMBED_MODEL, embedTexts, normalize, dot } from './lib/retrieval/embed.mjs'
