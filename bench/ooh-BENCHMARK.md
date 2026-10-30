# OOH benchmark specification — v1.2.2

Date: 2026-10-30. Package: v1.2.2, 2026-10-30. Status: frozen public package; private test labels; post-correction consolidation; the current 100 is development-informed, not held out; clean held-out deferred.
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
| Test questions (post-correction; not held out) | 100 | public | none (questions only) |
| Test labels (post-correction; not held out) | 100 | **private** | condition, gold, evidence, sources |

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

Post-correction reference results (private test, v2 labels, 3 seeds, 2026-10-30;
counts only, no labels; development-informed, not held out):

| Reader | B local | DA local | DA + page | DA + table | B false | DA false | B $/100 | DA $/100 | DA/B |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | 93.7 | **98.0** | **100** | **100** | 4.7 | **1.0** | $0.11 | **$0.24** | **2.24× pass** |
| Sonnet 5.5 | 93.7 | **98.0** | **100** | **100** | 4.0 | **1.0** | $0.51 | $1.96 | **3.84× fail** |
| GLM-5.3-Flash (default) | 86.3 | **95.3** | **97** | **97** | 11.0 | 4.3 | $0.04 | **$0.09** | **2.25× pass** |

The local column is 98 questions; the aggregate columns add the 2 deterministic
globals. **Page aggregate is primary; table is the control.** The local headline
is DeepSeek DA 98 vs B 94, not 100. DeepSeek and Sonnet DA tie at 98 local /
100 system; DeepSeek is ~8.2× cheaper on DA. B ties at 94; Sonnet DA’s premium
fails the 2.5× / $0.50 rule. Exact McNemar on local correctness is 4–5
discordant vs 0, p=0.0625–0.125; suggestive, not separated. The aggregate is
not a reader win.

Citation **title/row support** in the older v1.1 context: harness 60/60 table,
59/60 pages; baselines 0/60. That is **not** a byte-verbatim claim. v2 gives
table 37/60 verbatim segments (37/60 contiguous) and pages 38/60 segments
(26/60 contiguous). The old v1.1 page run was 99/100 (`test-030` false
abstention); the post-correction page aggregate is 100/100 for DeepSeek and
Sonnet, 97/97 for the GLM default. Public dev: 14/14 table and pages. Post-correction two-document sums:
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

- Version: **1.2.2**, benchmark frozen 2026-10-24; post-correction 3-seed consolidation 2026-10-30; package 2026-10-30.
- Manifest: `bench/ooh-MANIFEST.json` (public files + hashes; private test
  boundary).
- Prior art / positioning: The benchmark is not an accuracy leaderboard.
- License: corpus U.S. Government work (public domain); code under repository
  `LICENSE`; content terms in `LICENSE-CONTENT`.
