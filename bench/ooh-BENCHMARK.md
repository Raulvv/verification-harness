# OOH benchmark specification — v1.2.1

Date: 2026-10-30. Package: v1.2.1, 2026-10-30. Status: frozen public package; private held-out test; corrected harness.
This is the single document that defines the benchmark’s scope, labels,
metrics, scoring, aggregation contract, baselines, and limits. If a number is
published, this spec plus the README caveats must back it.

## 1. Scope

A **closed-corpus, document-grounded, factual/calculated/abstention** benchmark
built from the U.S. Bureau of Labor Statistics **Occupational Outlook Handbook**
(2023–33 snapshot).

It is not:

- an open-domain or full-wiki benchmark;
- a prose, creative, or general-reasoning benchmark;
- an accuracy-leadership or SOTA claim;
- a public leaderboard (submission-only for now).

It measures answer correctness, calibrated `NOT FOUND`, citation support,
citation breadth/candidate coverage, deterministic aggregation, and cost.

## 2. Corpus

- 48 occupation pages, 24 categories × 2.
- Wayback captures nearest **2025-01-01**; per-page URLs/timestamps in
  `bench/corpus/ooh-v1/manifest.json`.
- 46 pages report median annual pay; 2 are N/A (Musicians and Singers;
  Fishing and Hunting Workers).
- Public domain (U.S. Government work); provenance in
  `bench/corpus/ooh-v1/SOURCE.md`.
- Compact view: `bench/ooh-table-v1.md` (48 rows; 46 with pay).

## 3. Splits

| Split | Size | Access | Labels |
|---|---:|---|---|
| Pilot | 20 | public | human-reviewed |
| Public aggregation dev | 14 | public | human-approved 14/14 |
| Held-out test questions | 100 | public | none (questions only) |
| Held-out test labels | 100 | **private** | condition, gold, evidence, sources |

Test composition: **40 answerable / 20 partial / 40 unanswerable**; two global
aggregation questions (46-candidate and 25-candidate). The test questions are in
`bench/ooh-test-questions.jsonl`; labels are in
`bench/results/ooh-test-private-v2.jsonl` (gitignored).

## 4. Conditions

Answerability is **from this corpus**, not the world.

- **answerable** — the page(s) state the fact(s); may require calculation.
- **partial** — one part is stated, one part is absent from the snapshot.
- **unanswerable** — the requested fact is absent (state/city/employer/
  historical/2033-specific where only a decade average exists).

## 5. Contexts

| context | what the reader sees | purpose |
|---|---|---|
| table | 48-row Quick Facts table | controlled full-candidate view |
| pages | 48 pages, fixed K=3 reference window | distractor/retrieval stress |
| page excerpt | 6k head + question-relevant tail, K=3 | corrected local context |
| full pages | all 48 pages (20k cap) | full-context ablation |
| aggregate table | 46 paid rows, deterministic reducer | proof-carrying global answers |
| aggregate pages | all 48 pages parsed, completeness guard | proof on documents |

The page local run is not full wiki; it is a 48-page fixed-window test. The 2026-10-30 correction uses `excerpt`; the old 6k head is the historical context. Full 20k pages are an ablation: they recover the annual openings but regress `088`/`089`.

## 6. Metrics

- **Answer correctness:** answerable / partial / unanswerable counts; partial
  requires stated parts and explicit missing parts.
- **Abstention:** correct `NOT FOUND` on unanswerable; false abstentions on
  answerable.
- **Citation support:** two metrics: title/row support and byte-verbatim
  segments. The old 60/60/58/60 number is title/row support, not a byte claim;
  the v2 audit shows composite receipts and lower segment counts. The v1.1
  metric is under revision.
- **Citation breadth / coverage:** cited candidates / expected candidates for
  aggregation; public dev coverage 46/46 paid, 48/48 all, 2/2 selected sums.
- **Aggregation correctness:** exact winner/value for max/min, exact count/sum,
  filter correctness, and completeness.
- **Cost:** receipt words, model tokens, latency.
- **Version/context honesty:** the reported context mode (table/pages) and
  model must be stated; proxies labelled as proxies.

## 7. Scoring rule

`bench/ooh-score-v2.py` implements the frozen rule: **helpful abstention, no
external knowledge**.

- **Answerable:** require the asked fields; extra gold context is not required.
- **Partial:** every stated part present; every missing part explicitly absent.
- **Unanswerable:** non-empty; explicitly says the requested specific value is
  absent; national context allowed; no external/historical knowledge.
- `--strict` is a sensitivity mode, not the headline rule.

The scorer is a heuristic; the maintainer audits disagreements. The test labels
are never sent to submitters.

## 8. Aggregation contract

For a global/aggregate question:

1. Materialize the **complete candidate set** (table or page map).
2. Apply the **completeness guard**; if coverage is short, return
   `partial`/`NOT FOUND`, never a global claim.
3. Apply a **deterministic reducer**: max, min, sum, count, filter.
4. Return the **full candidate table as the receipt**, one source per row.
5. Bypass the minimal-receipt trimmer; the table is the proof.
6. Report `citation_breadth = cited / expected`.

Public dev reference coverage: 46/46 paid, 48/48 all, 2/2 selected sums. The generic
library is `kit/lib/answer/aggregate.mjs`; the CLI is
`retrieval-kit ask --aggregate --table <rows.json> --spec <spec.json>`.

## 9. Arms and baselines

- **Harness local:** contract-only reader + contract receipts (byte-verbatim segments) + minimal
  receipts; table or page window.
- **Harness aggregate:** deterministic reducer + completeness guard + full
  candidate receipt.
- **B:** RAG-cite baseline; **Q:** quote prompt; **DA:** current harness.
- **Readers:** DeepSeek V4.1 Flash and Sonnet 5.5; the shipped default remains
  GLM-5.3-Flash. The old naive/Mimo proxy table is historical v1.1 context,
  not part of the corrected matrix.

Corrected reference results (private test, v2 labels, one seed, 2026-10-30;
counts only, no labels):

| Reader | Arm | Local 98 | + page aggregate | + table aggregate | False | Cost |
|---|---|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | B | 94 | — | — | 5 | $0.11 |
| Sonnet 5.5 | B | 94 | — | — | 4 | $1.10 |
| DeepSeek V4.1 Flash | DA | **98** | **100** | **100** | **0** | **$0.23** |
| Sonnet 5.5 | DA | 94 | **96** | **96** | 4 | **$1.80** |

The local column excludes the two globals; the aggregate columns add them
deterministically. **Page aggregate is primary; table is the control.**
DeepSeek B and Sonnet B tie at 94 (DeepSeek ~10x cheaper; Sonnet one fewer
false). DeepSeek DA 100 vs Sonnet DA 96 at ~7.8x lower cost, 0 vs 4 false.
The Sonnet DA’s +2 over Sonnet B is the aggregate only; the DeepSeek DA’s +6
is +4 local and +2 aggregate. The aggregate is not a reader win.

Citation **title/row support** in the older v1.1 context: harness 60/60 table,
59/60 pages; baselines 0/60. That is **not** a byte-verbatim claim. v2 gives
table 37/60 verbatim segments (37/60 contiguous) and pages 38/60 segments
(26/60 contiguous). The old v1.1 page run was 99/100 (`test-030` false
abstention); the corrected page aggregate is 100/100 for DeepSeek and 96/100
for Sonnet. Public dev: 14/14 table and pages. Held-out two-document sums:
three questions (`test-019`, `test-081`, `test-089`); private audit. These are
**not** an accuracy leadership claim; the benchmark is not an accuracy
leaderboard. The old naive/Mimo proxy table is historical v1.1 context and is
not part of the corrected matrix.

## 10. Reproducibility

```bash
DEV=1 node bench/ooh-aggregate-spike.mjs
DEV=1 PAGES=1 node bench/ooh-aggregate-spike.mjs
```

The public dev run self-checks gold and coverage. The 100-item test is
submission-only; see `bench/ooh-SUBMISSION.md`. The internal harness/merge
runners and private outputs are not shipped; private-test scores are
maintainer-audited, not reproducible from this tree.

## 11. Test protocol

- Submitters receive the public questions and corpus, not the labels.
- Submit one JSONL row per test id with `id`, `answer`, `notFound`, and
  preferably `quote`, `legs`, `coverage`.
- The maintainer runs the private scorer and audits disagreements.
- No training on the test questions or labels.
- No public leaderboard yet; submissions are reviewed manually.

## 12. Limits and falsifiers

- 48 pages, 100 test items, two global aggregation questions (46- and
  25-candidate); not full wiki.
- OOH numbers are BLS estimates for 2023–33; frozen snapshot.
- Two page citation misses are retrieval coverage, not aggregation.
- No claim that the harness is more accurate than frontier models.
- Falsifiers: frontier model matches accuracy; aggregation receipt is copied
  without the benchmark; external replication fails; users do not value the
  proof layer; page coverage cannot be made complete at scale.

## 13. Version and provenance

- Version: **1.2.1**, benchmark frozen 2026-10-24; harness corrected 2026-10-30; package 2026-10-30.
- Manifest: `bench/ooh-MANIFEST.json` (public files + hashes; private test
  boundary).
- Prior art / positioning: The benchmark is not an accuracy leaderboard.
- License: corpus U.S. Government work (public domain); code under repository
  `LICENSE`; content terms in `LICENSE-CONTENT`.
