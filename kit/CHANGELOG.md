# Changelog — retrieval-kit

## Unreleased

### Added

- Opt-in strict verbatim verifier: `verify(..., { strict: true })` and
  `kit/bin/verify.mjs --strict`. It tolerates only whitespace runs and one
  wrapping quote pair; short quotes must be complete lines. Default behavior is
  unchanged.

### Fixed

- Root-level `Source: Title (date) · file.md` receipts now parse as one
  locator; the gate no longer splits the title on words like “and”.
- `askOneShot(..., { docs })` accepts a pre-selected window, so arm D can use
  the exact B/C documents.

- `judgeByCommand` now uses `spawnSync` and tolerates EPIPE when the detector
  exits successfully without reading stdin. This removes the intermittent test
  failure.

### Changed

- `rehomeLegs` now records the minimal claim **span** (the sentence/table
  cell containing the anchor) beside the full-line `quote`; `liftSpan` handles
  wrapped lines and table cells. The reference-first path passes spans to the
  binder/verifier and keeps full lines for the receipt.

- README now states the corpus-agnostic path explicitly (**bring your own
  corpus**: `config --corpus <dir>` / `retrieval.config.json` `source`), and
  the demo-corpus note no longer points at a `corpus/manifest.json` — the
  OOH benchmark reads a frozen snapshot (`bench/corpus/ooh-v1/`).
- README now keeps kit usage and private-corpus guidance only; historical
  pointers and the old claims ledger are not part of this
  benchmark-only package.
- Confluence fixtures and test corpora sanitized for publication: the
  space key, the CQL title term (including URL-encoded forms in
  `next`/`self` links), and every project/client codename and real
  process line carried in synthetic test fixtures were replaced with
  generic values (`DEMO`, `Fixture topic`, `Service_Onboarding_*`,
  `Vendor_*`); envelope shapes and metadata values remain verbatim
  dumps, and the fixtures README records the sanitization.

### Added

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

### Changed

- `rehomeLegs` now records the minimal claim **span** (the sentence/table
  cell containing the anchor) beside the full-line `quote`; `liftSpan` handles
  wrapped lines and table cells. The reference-first path passes spans to the
  binder/verifier and keeps full lines for the receipt.

- README now states the corpus-agnostic path explicitly (**bring your own
  corpus**: `config --corpus <dir>` / `retrieval.config.json` `source`), and
  the demo-corpus note no longer points at a `corpus/manifest.json` — the
  OOH benchmark reads a frozen snapshot (`bench/corpus/ooh-v1/`).
- README now keeps kit usage and private-corpus guidance only; historical
  pointers and the old claims ledger are not part of this
  benchmark-only package.
- Confluence fixtures and test corpora sanitized for publication: the
  space key, the CQL title term (including URL-encoded forms in
  `next`/`self` links), and every project/client codename and real
  process line carried in synthetic test fixtures were replaced with
  generic values (`DEMO`, `Fixture topic`, `Service_Onboarding_*`,
  `Vendor_*`); envelope shapes and metadata values remain verbatim
  dumps, and the fixtures README records the sanitization.

### Added

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
