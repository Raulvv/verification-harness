# Changelog — retrieval-kit

## Unreleased

## 0.2.0 — DA default + GLM-5.3-Flash

### Changed

- **Default is the current harness (DA)**: the `v45` quote contract + the
  mechanical gate + the absence check. `--source` keeps the lighter Source
  receipt; `--no-absence` keeps the gate-only stage. `--quote` remains an alias
  for `v45`.
- **Default reader is GLM-5.3-Flash** on an OpenAI-compatible endpoint (the
  example config uses the OpenCode gateway; `OPENCODE_API_KEY`). The zero-config
  local fallback is still `qwen3.5:4b`; the best local is `qwen3.8-27b` q4.
- The absence check moved from the benchmark into `kit/lib/answer/absence.mjs`
  and is shared by `ask` and `bench/arm-compare.mjs`; absent claims are
  decomposed, searched over the full corpus, and re-read with any
  counter-document.
- `config --source` / `config --no-absence`; `--json` now includes `absence` and
  `usage`; the human receipt shows absence status.
- Tests: 206 (was 201); the default/source/absence/GLM-Flash paths are covered.


### Added

- **Citation metadata** on the assembled receipt (additive): `--json` now
  carries `citations[]` with `document_index`, `title`, `rel`, `quote`,
  `start_char_index`/`end_char_index` (0-indexed, exclusive end), `exact`,
  `section`, `context`, and `kind` (`prose`/`table`/`row`). The human receipt
  groups evidence by source and section instead of one flat `Quote:` line; the
  canonical `Q:/Source:/Quote:` text is unchanged. `--max-quotes-per-doc <n>`
  caps quotes per source (opt-in; approximates the ALCE/LongCite convention).
- Opt-in strict verbatim verifier: `verify(..., { strict: true })` and
  `kit/bin/verify.mjs --strict`. It tolerates only whitespace runs and one
  wrapping quote pair; short quotes must be complete lines. Default behavior is
  unchanged.
- **Evidence-first answering (opt-in)**: `askOneShot(..., { evidenceFirst: true })`
  runs two calls — a quote-only pass, then an answer pass whose context holds
  the quotes and no documents — so the answer/quote binding is a one-way
  dependency instead of a same-call request. `unanchoredNumbers` flags answer
  numbers the quotes do not contain (versions, dates, sections, ledger row ids
  and number words normalized; arithmetic over quoted operands anchored), and
  `evidenceAnchor: 'abstain'` turns an unanchored answer into an honest NOT
  FOUND. The default stays single-pass.
- **Graded tri-state gate** (default for `--sufficient`): the judge scores
  quote→answer support 1–5 (schema-constrained) and the score is banded —
  `score < lo` abstains (`not_found`), `lo..hi-1` is shown flagged
  (`unverified`), `score >= hi` is `verified`. Frozen bands `lo=2, hi=5`
  (measured on HotpotQA dev 301–600: +11pp unknown abstention for +3pp
  answerable, 95.6% verified precision). Reader-answered-but-no-score →
  `unverified` (`fail_reason: judge_no_score`), never dropped. `--lo`/`--hi`
  override; `--judge-cmd`/injected judges keep the binary contract.
- Judge evidence defaults to the **whole window** (`--judge-evidence
  window|receipt|union`); a `judge == reader` note warns on self-preference.
- A **schema-constrained judge**: `model.mjs` now accepts a strict JSON schema
  (`jsonSchema` → `response_format: json_schema` on hosted, `format` on Ollama),
  and `sufficiency.mjs` exposes `judgeGrade` (a 1–5 support score forced through
  the schema). A judge can no longer return prose/reasoning in place of the
  verdict (measured: regex parsing failed on reasoning models — deepseek/glm/kimi
  each hid the digit differently; the schema fixes it).
- `ask --unverified` (env `RETRIEVAL_UNVERIFIED`): with `--sufficient`, an
  INSUFFICIENT verdict keeps the answer and flags it instead of abstaining — a
  **tri-state** result (`state`: `verified` / `unverified` / `not_found`), also
  in `--json`. Lets the gate flag uncertain answers rather than drop them.
- `ask --judge-evidence receipt|union` (env `RETRIEVAL_JUDGE_EVIDENCE`): the
  sufficiency judge sees the receipt's own quote by default, or the union of
  every cited document's question-relevant lines — for synthesis corpora where
  one quote under-supports the answer (ledger B64/B65).

### Fixed

- A reader call that fails — missing key, HTTP error, unparseable output — is
  now an explicit `state: "error"` (`reader_error`, `gate: not checked`,
  non-zero exit), not a verified abstention. Previously the fallback
  `Q: NOT FOUND` receipt passed the gate as a "correct abstention": a dead
  call with 0 tokens looked identical to an honest refusal. A workspace that
  names an `apiKeyEnv` whose variable is not exported now fails at resolve
  time with the variable name.
- The CLI refuses unknown flags and valued bare flags loudly
  (`unknown flag: --quote.`, `--quote is a bare flag — it takes no value`);
  previously a typo (`--quote.`) silently dropped the flag and ran the wrong
  tier. The valid set is echoed in the error.
- `--minimal-receipt` is now honored by `retrieval-kit ask` (it was documented
  but silently ignored there — only the battery runner consumed it). The
  receipt minimizer was also fixed to rebuild from verbatim units only: the
  old pipe-flattening stitched a non-verbatim quote that the kit's own gate
  rejected, so a minimized receipt could never re-verify.
- Root-level `Source: Title (date) · file.md` receipts now parse as one
  locator; the gate no longer splits the title on words like “and”.
- `askOneShot(..., { docs })` accepts a pre-selected window, so arm D can use
  the exact B/C documents.
- `judgeByCommand` now uses `spawnSync` and tolerates EPIPE when the detector
  exits successfully without reading stdin. This removes the intermittent test
  failure.

### Changed

- **Multi-part questions are handled by default.** Every answer prompt now
  instructs: answer the stated parts, explicitly name the missing parts, and
  reserve `NOT FOUND` for questions with no stated part. The "silence is not a
  negative" rule is scoped to that case. The dead `partialRule` option is
  removed. Measured on the corrected 20-item pilot: D partials **9/12 → 12/12**
  and answerable 18→21 at the same wrong-shown level.
- `askOneShot` returns the aggregated `usage` object, and token/cost accounting
  now includes the reference-retriever vet call (it was a real reader call but
  was invisible to `tokens`/cost). `bench/arm-compare.mjs` reports per-arm
  tokens and provider cost (`$/q`, `$total`) when the endpoint returns
  `usage.cost`.
- **`reference` is now the shipped default retriever** — deterministic,
  embedder-free, and the mode the benchmark numbers were measured under;
  `--retriever reference` no longer has to be spelled out. `dense`/`router`
  remain opt-in and fail loud with the fix when the local embedder is
  unreachable, and an unknown `--retriever` value is refused instead of
  silently degrading (`lib/cli/resolve.mjs`).
- Removed the dead retriever paths: `selectFuse` (BM25/RRF), `selectUnion`,
  and the standalone opt-in `iterative` retriever. `router` keeps its
  NOT-FOUND second hop (`escalate`); `fuse`/`union` were unreachable from the
  CLI and unused by the benchmark. The frozen facade drops the two exports.

- `rehomeLegs` now records the minimal claim **span** (the sentence/table
  cell containing the anchor) beside the full-line `quote`; `liftSpan` handles
  wrapped lines and table cells. The reference-first path passes spans to the
  binder/verifier and keeps full lines for the receipt.
- README now states the corpus-agnostic path explicitly (**bring your own
  corpus**: `config --corpus <dir>` / `retrieval.config.json` `source`), and
  the demo-corpus note no longer points at a `corpus/manifest.json` — the
  OOH benchmark reads a frozen snapshot (`bench/corpus/ooh-v1/`).
- README keeps kit usage and private-corpus guidance up front; the pre-OOH
  1.0/2.0 claims moved to `HISTORY.md` (shipped in the package), so the
  front page carries only OOH claims.
- Confluence fixtures and test corpora sanitized for publication: the
  space key, the CQL title term (including URL-encoded forms in
  `next`/`self` links), and every project/client codename and real
  process line carried in synthetic test fixtures were replaced with
  generic values (`DEMO`, `Fixture topic`, `Service_Onboarding_*`,
  `Vendor_*`); envelope shapes and metadata values remain verbatim
  dumps, and the fixtures README records the sanitization.

## 0.1.0 — 2026-10-06

Refactor per the retrieval-kit refactor epic. Behaviour-preserving:
no answer, receipt, gate verdict or measured number changes.

### Added

- `kit/index.mjs` — the public facade (the only supported import), frozen by
  `kit/test/structure/exports-surface.test.mjs`.
- `npm run kit:coverage`; the offline suite now runs in CI
  (`.github/workflows/offline.yml`).
- Characterization tests for the default path: dense/fuse/union selection,
  the router/iterative second hop, the model boundary and embeddings.

### Changed

- Layered `kit/lib/**`: `retrieval/`, `answer/`, `receipts/`, `corpus/`,
  `text/`; every external consumer now imports `kit/index.mjs`.
- `askOneShot` split into named stages; one tier registry replaces the twin
  prompt/schema ternaries.
- Shared primitives de-duplicated: stopwords, morphology, corpus walker, quote
  matcher, CLI args, result reader.

### Fixed

- `collectPages` no longer spins on a live cursor that yields no items (HK-8).
- The locate index re-indexes a changed corpus instead of serving stale scores
  (HK-10).
- The gate's corpus-title check is memoized per corpus identity (HK-11).
- Ollama thinking defaults OFF as documented; an inline `auth` is accepted
  (HK-12).
- `.retrieval-index/` and `.retrieval-mirror/` are gitignored (HK-9).
- Dead config keys (`labelsPath`, `resultsDir`, `layaModel`) removed; `ask.mjs`
  no longer falls back to a hardcoded model.
