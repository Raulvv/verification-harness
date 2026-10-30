# OOH benchmark — v1.2.1

> Repository: `verification-harness` · package: `ooh-citation-first-benchmark`
>
> Submitters: the scoring rule below is authoritative. This file is the
> benchmark's own README (corpus, splits, scoring, reproduction). The repository
> root `README.md` describes the citation system the benchmark evaluates.

A neutral, public-corpus, citation-first benchmark built from the U.S. Bureau
of Labor Statistics **Occupational Outlook Handbook** (2023–33 edition).

Status: **public package + private held-out test**; benchmark frozen 2026-10-24, harness corrected 2026-10-30; package v1.2.1. The public dev set is for iteration; the 100-item test labels are private and must not be trained on or published. The old 6k/full-page held-out rows are historical and not comparable to the corrected excerpt results.

## Quickstart

Requirements: `git`, Node 18+, and Python 3.10+. No `npm install` is needed.
Ollama is optional and only for running a local model. For `ask`, see
[Reader model setup](#reader-model-setup-kit-only).

```bash
git clone https://github.com/Raulvv/verification-harness.git
cd verification-harness
npm run ooh:smoke
npm run ooh:dev
npm run ooh:dev:pages
```

`ooh:smoke` runs the public tests plus both dev runs. The dev runs are
deterministic and need no API key or model. They write ignored JSONL files under
`bench/results/`. The private 100-item labels are not in this repository.

For a private corpus, see [Use it on your own private corpus](#use-it-on-your-own-private-corpus).

## What this benchmark is

A **closed-corpus, document-grounded, factual/calculated/abstention**
benchmark. It is not an open-domain, full-wiki, prose, or general-model
benchmark. It measures:

- answer correctness on answerable / partial / unanswerable questions;
- calibrated `NOT FOUND`;
- citation support: title/row support and byte-verbatim segments (v2 audit; metric under revision);
- citation breadth / candidate coverage;
- table vs 48-page fixed-window context;
- deterministic aggregation (max / min / sum / count / filter);
- cost and latency.

## Corpus

- 48 occupation pages, 24 categories × 2; Quick Facts + Pay + Job Outlook +
  education + Similar Occupations.
- Snapshot: Internet Archive Wayback captures nearest **2025-01-01**; per-page
  timestamps/URLs in `bench/corpus/ooh-v1/manifest.json`.
- Public domain (U.S. Government work). See `bench/corpus/ooh-v1/SOURCE.md`.
- 46 pages report a median annual pay; 2 are N/A (Musicians and Singers;
  Fishing and Hunting Workers).
- Compact view: `bench/ooh-table-v1.md` (48 rows; 46 with pay).
- Rebuild: `python bench/ooh-build.py` (needs `beautifulsoup4`), then
  `python bench/ooh-parse.py`.

## Splits

| Split | Size | Status | File |
|---|---:|---|---|
| Pilot | 20 | public; human-reviewed | `bench/ooh-pilot.jsonl` / `bench/ooh-pilot-validation.jsonl` |
| Public aggregation dev | 14 | public; human-approved 14/14 | `bench/ooh-dev-aggregation.jsonl` / `bench/ooh-dev-validation.json` |
| Held-out test questions | 100 | public questions; **private labels** | `bench/ooh-test-questions.jsonl` |
| Held-out test labels | 100 | **private**; frozen; not in the public tree | `bench/results/ooh-test-private-v2.jsonl` (gitignored) |

Test composition: 40 answerable / 20 partial / 40 unanswerable; two global
aggregation questions (46-candidate and 25-candidate). Test labels are private;
use the public pilot and dev set for development.

## Scoring rule

`bench/ooh-score-v2.py` implements the frozen rule: **helpful abstention, no
external knowledge**.

- **Answerable:** require the asked fields; extra gold context is not required.
- **Partial:** every stated part present; every missing part explicitly absent.
- **Unanswerable:** non-empty; explicitly says the requested specific value is
  absent; national context allowed; no external/historical knowledge.
- `--strict` is available for sensitivity; it is not the headline rule.

## Harness and baselines

- Harness local: contract-only reader + contract receipts (byte-verbatim segments) + minimal
  receipts; table or 48-page fixed window.
- Harness aggregate: deterministic reducer + completeness guard + full
  candidate receipt; table or page map.
- Reader baselines: **B** RAG-cite, **Q** quote prompt, **DA** current harness;
  **Sonnet 5.5** and **DeepSeek V4.1 Flash** are the current readers. The old
  naive/Mimo proxy table is historical v1.1 context, not the current matrix.
- Reported results are on the private test; the public dev set is reproducible.

Headline (private test, v2 labels, one seed, corrected 2026-10-30):

| Reader | Arm | Local 98 | + page aggregate | + table aggregate | False | Cost |
|---|---|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | B | 94 | — | — | 5 | $0.11 |
| Sonnet 5.5 | B | 94 | — | — | 4 | $1.10 |
| DeepSeek V4.1 Flash | DA | **98** | **100** | **100** | **0** | **$0.23** |
| Sonnet 5.5 | DA | 94 | **96** | **96** | 4 | **$1.80** |

**Page aggregate is primary; table aggregate is the control.** The local column
excludes the two global items; the aggregate columns add them deterministically.
DeepSeek B and Sonnet B tie at 94; DeepSeek is ~10x cheaper, Sonnet has one
fewer false accept. DeepSeek DA 100 vs Sonnet DA 96 at ~7.8x lower cost, 0 vs 4
false accepts. The +2 from Sonnet DA over Sonnet B is the aggregate only; the
DeepSeek DA adds 4 local rows plus the 2 aggregate. The two globals are not
reader wins.

The 2026-10-30 correction: the old 6k head hid the annual-openings facts;
the scorer missed `master’s`/`5 percent`; the two globals had no aggregate
route. The corrected excerpt + table/page aggregate fixes all three. Full 20k
pages were an ablation, not the fix: they recovered the annual openings but
regressed `088`/`089`.

Citation **title/row support** in the older v1.1 context: harness 60/60 table
and 59/60 pages; baselines 0/60. That is **not** a byte-verbatim claim. The v2
audit gives table 37/60 verbatim segments (37/60 contiguous) and pages 38/60
segments (26/60 contiguous). Many receipts are composite; the table local
receipt is a row selection. The corrected page/table aggregate is **100/100**
for DeepSeek and **96/100** for Sonnet; the old v1.1 page 99/100 (`test-030`
false abstention) is historical. The harness is **not** an accuracy leader; the
differentiator is proof, abstention, and aggregation coverage. The default
verifier is deliberately tolerant; use `node kit/bin/verify.mjs ... --strict`
(or `verify(..., { strict: true })`) for literal case/punctuation. Published OOH
numbers use the default tolerant mode.

## Reproduce the public dev set

```bash
# 14 aggregate dev items, table
DEV=1 node bench/ooh-aggregate-spike.mjs

# 14 aggregate dev items, all 48 pages
DEV=1 PAGES=1 node bench/ooh-aggregate-spike.mjs
```

Both runs self-check the gold and the public dev coverage: 46/46 paid,
48/48 all, 2/2 selected sums. The public dev form is
`bench/ooh-dev-validate.html`.

The 100-item test is submission-only; see `bench/ooh-SUBMISSION.md`.

## Use it on your own private corpus

Zero config is possible: **a folder is a workspace**. This runs the frozen
OOH snapshot with no `config` call (needs a local Ollama model):

```bash
node kit/bin/retrieval-kit.mjs ask bench/corpus/ooh-v1 \
  "What is the median annual pay for registered nurses?" --quote
```

The benchmark is public; the same kit runs on a private folder. Do not put
private documents or labels in this repository. To point at your own corpus,
or to keep settings beyond one call, seal the workspace once:

```bash
# local Ollama model; no cloud egress
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1

# the default retriever is embedder-free; --quote is the full byte-verbatim receipt
node kit/bin/retrieval-kit.mjs ask "What is the refund window?" --quote
```

- The default `reference` retriever needs no embedding model; `dense`/`router`
  opt into Ollama `nomic-embed-text` and fail loud without it.
- The default `v45` receipt includes the verbatim quote; `--source` returns the
  lighter Source receipt.
- `--json` for machines; `--minimal-receipt` for shorter local receipts.
- Hosted OpenAI-compatible endpoints use `--base-url` and
  `RETRIEVAL_API_KEY`; never store a literal key in the workspace.
- Full kit usage and limits: `kit/README.md`.

## Reader model setup (kit only)

The public benchmark and dev commands need **no model**. Only
`retrieval-kit ask` needs one. The default reader is **GLM-5.3-Flash** via an
OpenAI-compatible endpoint (the example uses the OpenCode gateway; set
`OPENCODE_API_KEY`). Any compatible `/chat/completions` endpoint works.

Defaults when no config or flags are set:

| Setting | Default | Notes |
|---|---|---|
| Base URL | `https://opencode.ai/inference/openai/v1` | The default reader gateway |
| Model | `glm-5.3-flash` | The best cost/efficient reader in the pilot |
| API key | `OPENCODE_API_KEY` | Set in the shell; never committed |
| Retriever | `reference` | Embedder-free; `dense`/`router` need Ollama `nomic-embed-text` |
| Tier | `v45` + absence | `--source` = Source receipt; `--no-absence` = gate-only |

### Option A — Ollama

```bash
ollama pull qwen3.5:4b
ollama pull nomic-embed-text   # only for --retriever dense|router

node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1

node kit/bin/retrieval-kit.mjs ask \
  "What is the refund window?" --quote
```

### Option B — hosted OpenAI-compatible endpoint

```bash
export RETRIEVAL_API_KEY="..."
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model "<model-id>" \
  --base-url "https://your-endpoint/v1"
```

### Option C — local non-Ollama server

vLLM, llama.cpp server, LM Studio, and similar OpenAI-compatible servers work.
The client always sends a Bearer header, so use a dummy key if the server does
not require auth:

```bash
export RETRIEVAL_API_KEY=local
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model "<served-model-id>" \
  --base-url "http://localhost:8000/v1"
```

### What the errors mean

- `no corpus` — run `config --corpus <dir>` or pass the folder to `ask`.
- `no chat model` — the base URL is not Ollama and you omitted `--model`.
- `no api key` — set `RETRIEVAL_API_KEY`, use `--api-key-env <VAR>`, or point at a local model.
- `the dense retriever needs a local embedder` (also `router`) — use the default `reference`, or pull `nomic-embed-text`.
- `unknown retriever` — `--retriever` accepts `reference|dense|router`; anything else is refused.
- `unknown flag: --quote.` — flags are exact and kebab-case; the mistake is named and the valid set is echoed. A `--quote.` typo refuses here instead of silently running the source tier.
- `--quote is a bare flag` — bare-only flags (`--quote`, `--sufficient`, `--json`, `--minimal-receipt`, …) take no value.
- `unknown flag: --quote.` — flags are exact and kebab-case; the mistake is named and the valid set is echoed. A `--quote.` typo refuses here instead of silently running the source tier.
- `--quote is a bare flag` — bare-only flags (`--quote`, `--sufficient`, `--json`, `--minimal-receipt`, …) take no value.
- No automatic fallback: a missing model or key fails loud.

`config` refuses literal keys; use `RETRIEVAL_API_KEY` or `--api-key-env`.
`config --show` and `config --reset` manage the sealed workspace. The kit writes
`.retrieval/` and `.retrieval-index/`; both are gitignored.

The benchmark reader was **DeepSeek V4.1 Flash**; `qwen3.5:4b` is only the kit's
local convenience default, not the benchmark model. Model quality is not
validated by the public package.

## Aggregate library / CLI

- Library: `kit/lib/answer/aggregate.mjs` (`askAggregate`).
- CLI: `retrieval-kit ask --aggregate --table <rows.json> --spec <spec.json> "question"`.
- OOH aggregate runner: `bench/ooh-aggregate-spike.mjs`.
- Strong-baseline protocol: `bench/ARM-COMPARE.md`; held-out report:
  `bench/ARM-COMPARE-REPORT.md`; offline plumbing check:
  `node bench/arm-compare.mjs --fake`.
- Private harness/scoring runners are maintainer-side and are not shipped in this public package; private-test scores are not reproducible from this tree.
- Scorer v2: `bench/ooh-score-v2.py` (title/row, verbatim segments, contiguous);
  v1 remains for historical outputs.
- Tests: `npm run kit:test`; clean-clone smoke: `npm run ooh:smoke`.

## Public package and provenance

- Benchmark spec: `bench/ooh-BENCHMARK.md` (scope, conditions, metrics,
  scoring, aggregation, limits).
- Manifest: `bench/ooh-MANIFEST.json` (version, public files, private test
  boundary, hashes).
- License: corpus is a U.S. Government work (public domain); code is under the
  repository `LICENSE`; article/content terms are in `LICENSE-CONTENT`.
- Do not publish or train on the private test labels.

## Caveats

- 48 pages, 100 test items, two global aggregation questions (46- and
  25-candidate); not full wiki.
- Corrected reader comparison (held-out 100, one seed, v2 labels, excerpt +
  aggregate): DeepSeek DA **100/100**, Sonnet DA **96/100**, both B arms
  **94/100**. DeepSeek DA $0.23 vs Sonnet DA $1.80; DeepSeek B $0.11 vs
  Sonnet B $1.10. The 2 global items are deterministic aggregate, not reader
  wins; DeepSeek B ties Sonnet B. Page aggregate is primary; table is the
  control. The old D-gate 2% vs B 8% result is the pre-correction historical
  row.
- OOH numbers are BLS estimates for 2023–33; frozen snapshot, not current data.
- State/city/employer/historical/2033-specific questions are intentionally
  unanswerable when the snapshot does not state them.
- No accuracy/SOTA claim. Current models and validation-centered RAG systems
  can match closed-corpus factual accuracy; see the limitations below.
- The v1.1 page run had one false abstention (`test-030`); the 2026-10-30
  corrected page aggregate is 100/100 for DeepSeek and 96/100 for Sonnet. The
  old 60/60/58/60 number is title/row support, not byte-verbatim. Aggregation
  and abstention are the strongest evidence.
