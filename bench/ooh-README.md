# OOH benchmark — v1.1.8

A neutral, public-corpus, citation-first benchmark built from the U.S. Bureau
of Labor Statistics **Occupational Outlook Handbook** (2023–33 edition).

Status: **public package + private held-out test**, benchmark frozen 2026-10-24; package v1.1.8, 2026-10-26. The
public dev set is for iteration; the 100-item test labels are private and must
not be trained on or published.

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
| Held-out test labels | 100 | **private**; frozen; not in the public tree | `bench/results/ooh-test-private.jsonl` (gitignored) |

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
- Baselines: naive deepseek (no contract) and **Mimo 2.6 Flash proxy** (no
  contract). GPT-4o was unavailable; Mimo is a proxy, not GPT-4o.
- Reported results are on the private test; the public dev set is reproducible.

Headline (private test, human-corrected):

| context | harness | naive | Mimo proxy |
|---|---:|---:|---:|
| full 46-row table | **100/100** | 88/100 | 96/100 |
| 48 pages, fixed window | **99/100** with aggregate | 89/100 | 89/100 |

Citation **title/row support**: harness 60/60 table and 59/60 pages; baselines
0/60. That is **not** a byte-verbatim claim. The v2 audit gives table
37/60 verbatim segments (37/60 contiguous) and pages 38/60 segments (26/60
contiguous). Many receipts are composite; the table local receipt is a row
selection. The v1.1 page run is **99/100**: `test-030` false-abstained; the
old v1.0 page 100 was a single run and is not a stable claim. The harness is
**not** an accuracy leader; the differentiator is proof, abstention, and
aggregation coverage. The default verifier is deliberately tolerant; use
`node kit/bin/verify.mjs ... --strict` (or `verify(..., { strict: true })`) for
literal case/punctuation. Published OOH numbers use the default tolerant mode.

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

The benchmark is public; the same kit runs on a private folder. Do not put
private documents or labels in this repository.

```bash
# local Ollama model; no cloud egress
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1

# simplest embedder-free retrieval; full byte-verbatim receipt
node kit/bin/retrieval-kit.mjs ask "What is the refund window?" \
  --retriever reference --quote
```

- `--retriever reference` needs no embedding model; `dense`/`router` need
  Ollama `nomic-embed-text`.
- `--quote` returns the full verbatim receipt; the default `source-v45` returns
  a Source receipt.
- `--json` for machines; `--minimal-receipt` for shorter local receipts.
- Hosted OpenAI-compatible endpoints use `--base-url` and
  `RETRIEVAL_API_KEY`; never store a literal key in the workspace.
- Full kit usage and limits: `kit/README.md`.

## Reader model setup (kit only)

The public benchmark and dev commands need **no model**. Only
`retrieval-kit ask` needs one. There is **no default hosted model** and **no
Opencode dependency**; any OpenAI-compatible `/chat/completions` endpoint works.

Defaults when no config or flags are set:

| Setting | Default | Notes |
|---|---|---|
| Base URL | `http://localhost:11434/v1` | Assumes Ollama |
| Model | `qwen3.5:4b` | Only when the base URL looks like Ollama |
| API key | `ollama` | Other endpoints need `RETRIEVAL_API_KEY` or `--api-key-env` |
| Retriever | `router` | Needs local `nomic-embed-text`; use `--retriever reference` without it |
| Tier | `source-v45` | `--quote` switches to `v45` |

### Option A — Ollama

```bash
ollama pull qwen3.5:4b
ollama pull nomic-embed-text   # only for dense/router

node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1 \
  --retriever reference

node kit/bin/retrieval-kit.mjs ask \
  "What is the refund window?" --retriever reference --quote
```

### Option B — hosted OpenAI-compatible endpoint

```bash
export RETRIEVAL_API_KEY="..."
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model "<model-id>" \
  --base-url "https://your-endpoint/v1" \
  --retriever reference
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
  --base-url "http://localhost:8000/v1" \
  --retriever reference
```

### What the errors mean

- `no corpus` — run `config --corpus <dir>` or pass the folder to `ask`.
- `no chat model` — the base URL is not Ollama and you omitted `--model`.
- `no api key` — set `RETRIEVAL_API_KEY`, use `--api-key-env <VAR>`, or point at a local model.
- `the default retriever needs a local embedder` — use `--retriever reference`, or pull `nomic-embed-text`.
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
- Strong-baseline protocol: `bench/ARM-COMPARE.md`; offline plumbing check:
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
- OOH numbers are BLS estimates for 2023–33; frozen snapshot, not current data.
- State/city/employer/historical/2033-specific questions are intentionally
  unanswerable when the snapshot does not state them.
- No accuracy/SOTA claim. Current models and validation-centered RAG systems
  can match closed-corpus factual accuracy; see the limitations below.
- The page run has one false abstention (`test-030`) in v1.1; the old page 100
  was a single run. The old 60/60/58/60 number is title/row support, not
  byte-verbatim. Aggregation and abstention are the strongest evidence.
