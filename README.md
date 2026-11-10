# verification-harness — receipts for retrieval-augmented answers

> Repository: `verification-harness` · system: `retrieval-kit` (`kit/`) ·
> benchmark: `ooh-citation-first-benchmark` (`bench/`)

This repository is one system and one study. **The system** is a citation-first
retriever: every shown answer carries a byte-verbatim quote from a named file,
and a mechanical gate re-opens that file and checks the quote before the answer
is shown. **The study** is the OOH benchmark — a frozen, public-corpus
evaluation that happens to use the U.S. Bureau of Labor Statistics
Occupational Outlook Handbook as its corpus. OOH is the testbed, not the
product.

Status: kit v0.2.0; benchmark v1.2.2, consolidation 2026-10-30. The current 100
is post-correction and development-informed, not held out; the clean 60-question
set is deferred. The 100-item labels are private and must not be trained on or
published. The old 6k/pilot rows are historical and not comparable.

**Claims and reproduction.** Every figure quoted in the companion article *The
Trust Postmortem* — distributed separately — is a row in
[`docs/PROVENANCE.md`](docs/PROVENANCE.md), with its data under `provenance/`. Verify
everything with one command: **`npm run verify`** (claim recomputation,
manifest integrity, and the full test batteries). This repository is
independently verifiable: no other repo is needed to check any number.

## The problem

RAG answers are unauditable: a plausible wrong number looks exactly like a
correct one. The defect is the interface, not the model tier — a frontier
reader makes the error rarer, not impossible, and rarer errors are the ones
people trust. Cheap, small readers make it frequent, which is why the
benchmark stresses them. A prose citation ("per the onboarding doc…") is a
claim about the evidence, not the evidence. An entailment judge is a second
opinion. Neither lets you re-check the answer later without trusting a system.

## The contract

The reader answers under a verbatim-quote contract: every claim ships a
byte-verbatim quote from a named file and line. Before an answer is shown, a
mechanical gate — plain string matching, no model, no API call — re-opens that
file and checks the quote is actually there. No verbatim quote, no answer: the
system emits `NOT FOUND`, which is a first-class, receipted answer, not an
error.

Hardening (2026-10-29): the gate now verifies each structured citation leg,
and the string fallback no longer lets one leg borrow another leg's quote
fragments. An earlier Sonnet run scored 75/81 through a raw-index reporting
artifact; the assembled citations are 81/81 exact. No benchmark result changes.

What you get is a property: **every shown answer can be independently
re-verified by a human or a script in seconds**, today and after the corpus,
the model, and the vendor have changed.

## Current result — post-correction 100 (3 seeds, 2026-10-30)

The current 100 is **post-correction and development-informed — not held out**.
The excerpt builder, scorer fixes, and aggregate route were chosen after seeing
this set. The clean held-out set is deferred. **3 seeds**, v2 labels, page
aggregate primary, table control.

Arm **B** is plain RAG (status quo); **DA** adds the verbatim-quote contract,
the mechanical gate, and the absence check. The local column is 98 questions
(the 2 globals excluded). The system columns
add the 2 deterministic aggregate answers. Values are per-100 means across 3
seeds; B has no aggregate.

| Reader | B local | DA local | DA + page | DA + table | B false | DA false | B $/100 | DA $/100 | DA/B |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | 93.7 | **98.0** | **100** | **100** | 4.7 | **1.0** | $0.11 | **$0.24** | **2.24× pass** |
| Sonnet 5.5 | 93.7 | **98.0** | **100** | **100** | 4.0 | **1.0** | $0.51 | $1.96 | **3.84× fail** |
| GLM-5.3-Flash (default) | 86.3 | **95.3** | **97** | **97** | 11.0 | 4.3 | $0.04 | **$0.09** | **2.25× pass** |

The local headline is **DeepSeek DA 98 vs B 94**, not 100. The 100 is the system
with the 2 deterministic aggregate answers; B does not get them. The exact
McNemar on local correctness is 4–5 discordant pairs vs 0, p=0.0625–0.125; on
local false accepts, p=0.0625–0.25. The system’s 0 vs 4.7 false accepts gives
p=0.03–0.125. **This is suggestive, not separated.** The same holds for Sonnet:
98 vs 94 local, 1 vs 4 false, p=0.0625–0.125.

What the 3 seeds say:

- **DeepSeek and Sonnet DA tie at 98 local and 100 with aggregate.** DeepSeek
  is ~8.2× cheaper on DA ($0.24 vs $1.96) and ~4.8× cheaper on B ($0.11 vs
  $0.51). The reader gap is not established.
- **DeepSeek B and Sonnet B tie at 94.** The DA premium is 2.24× for DeepSeek,
  3.84× for Sonnet; the Sonnet DA premium fails the 2.5× / $0.50 rule.
- **GLM-5.3-Flash, the shipped default, is now measured:** B 86, DA 95 local,
  97 with aggregate; 11 vs 4.3 false accepts. The old 88/82 is historical.
- **The 2 aggregate answers are deterministic.** They are not reader wins and
  should not be used as the headline.
- **No clean held-out claim.** This is the post-correction development set; the
  clean 60-question/second-corpus test is deferred.

The generic fixes that preceded these seeds: “do not give” is now an abstention
phrase in scoring, and the absence re-read triggers when the gate says
`abstained: true` even if the answer text is not phrased as a refusal. These are
generic harness fixes, not test-specific prompt tuning.

**The kill rule:** DA must be ≤2.5× same-reader B per 100 and ≤$0.50/100,
wrong-shown must be no worse than B, and coverage at least 80% of the reachable
ceiling. DeepSeek and GLM pass the cost rule; **Sonnet DA fails** (3.84×,
$1.96). The default reader remains **GLM-5.3-Flash**.

**Bare control.** Arm **A** (question only, no documents, no harness) was run on
the same post-correction 100, 3 seeds, all three readers. Per-100 means over the
98 local questions (same normalization as the table above): DeepSeek **27.9**
correct with **69.0** false accepts; Sonnet **40.1** with **41.8**; GLM **37.4**
with **53.1**. Bare readers answer 15.8–19.3% of answerable questions — B
answers 86–94% on the same items — so the corpus, not recall, produces the
headline. The bare failure mode is a family gradient: DeepSeek fabricates,
Sonnet abstains (and is the only one handling partials, 25%). Method, budget
disclosure, and the truncation rule: `bench/ARM-COMPARE-REPORT.md`
§ Bare-reader control.

Historical results, including the old 6k held-out, the one-seed post-correction
matrix, and the pilot, are in [`HISTORY.md`](HISTORY.md). The full arm report is
`bench/ARM-COMPARE-REPORT.md`. The analytical backing — stress tests, the
absence study, the formal pilot, and the limitations — is in
[`docs/EVIDENCE.md`](docs/EVIDENCE.md).

## Quickstart

Requirements: `git`, Node 18+, and Python 3.10+ (Python only for the benchmark
scripts). No `npm install` is needed. A chat model is needed only for `ask`;
the benchmark checks run without one.

```bash
git clone https://github.com/Raulvv/verification-harness.git
cd verification-harness

# plumbing + deterministic dev runs — no model, no network needed
npm run ooh:smoke

# default reader: GLM-5.3-Flash via the OpenCode gateway
export OPENCODE_API_KEY="..."
node kit/bin/retrieval-kit.mjs ask bench/corpus/ooh-v1 \
  "What is the median annual pay for registered nurses?"

# local fallback (Ollama), same DA default:
node kit/bin/retrieval-kit.mjs ask bench/corpus/ooh-v1 \
  "What is the median annual pay for registered nurses?" \
  --base-url http://localhost:11434/v1 --model qwen3.5:4b

# lighter Source receipt / gate-only stage:
node kit/bin/retrieval-kit.mjs ask bench/corpus/ooh-v1 \
  "What is the median annual pay for registered nurses?" --source
node kit/bin/retrieval-kit.mjs ask bench/corpus/ooh-v1 \
  "What is the median annual pay for registered nurses?" --no-absence
```

The first command answers from the frozen OOH snapshot with a verified quote
receipt and the absence check. The local fallback is the fast demo; the 4B is
below the contract threshold. Point `ask` at your own folder instead, and it is
your corpus.

## Use it on your own private corpus

The benchmark is public; the same kit runs on a private folder. Do not put
private documents or labels in this repository. Seal the workspace once:

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
- `--source` returns the lighter Source receipt; the default is the full `v45` receipt + absence; `--no-absence` returns
  a Source receipt.
- `--json` for machines; `--minimal-receipt` for shorter local receipts.
- `--json` also carries a `citations` array: `document_index`, `rel`, `quote`,
  `start_char_index`/`end_char_index` (0-indexed, exclusive end), `exact`,
  `section`, `context`, `kind`. Offsets are `null` when only the tolerant
  matcher lands the quote.
- `--max-quotes-per-doc <n>` caps quotes per source (opt-in; an approximation
  of the ALCE/LongCite "at most 3 per statement" convention).
- Hosted OpenAI-compatible endpoints use `--base-url` and
  `RETRIEVAL_API_KEY`; never store a literal key in the workspace.
- Full kit usage and limits: `kit/README.md`.

## Reader model setup (kit only)

The public benchmark and dev commands need **no model**. Only
`retrieval-kit ask` needs one. The boundary is OpenAI-compatible
(`/chat/completions`); the default config points at the OpenCode gateway for
GLM-5.3-Flash. Any compatible endpoint works; the kit is not tied to a vendor.

Defaults when no config or flags are set:

| Setting | Default | Notes |
|---|---|---|
| Base URL | `https://opencode.ai/inference/openai/v1` | The default reader's gateway |
| Model | `glm-5.3-flash` | The best cost/efficient reader in the pilot |
| API key | `OPENCODE_API_KEY` | Set it in the shell; never committed |
| Retriever | `reference` | Embedder-free; `dense`/`router` need Ollama `nomic-embed-text` |
| Tier | `v45` + absence | `--source` = Source receipt; `--no-absence` = gate-only |
| Local fallback | `qwen3.5:4b` on `http://localhost:11434/v1` | Fast demo; below the contract threshold |
| Best local | `qwen3.8-27b` q4 | 24/24 answerable, 0/60 wrong, 6/12 partials, ~29 s/q |

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

- `no corpus` — run `config --corpus <dir>`, or call `ask <dir> "<question>"` to pass a folder one-off.
- `no chat model` — the base URL is not Ollama and you omitted `--model`.
- `no api key` — set `RETRIEVAL_API_KEY`, use `--api-key-env <VAR>`, or point at a local model.
- `no api key — <VAR> is not set` — the sealed workspace names that variable; export it in this shell, or the call fails before any model request.
- `gate: not checked — reader failed` — the model call produced no parseable answer (bad key, HTTP error, empty output); this is an error, not an abstention, and the CLI exits non-zero.
- `the dense retriever needs a local embedder` (also `router`) — use the default `reference`, or pull `nomic-embed-text`.
- `unknown retriever` — `--retriever` accepts `reference|dense|router`; anything else is refused.
- `unknown flag: --quote.` — flags are exact and kebab-case; the mistake is named and the valid set is echoed. A `--quote.` typo refuses here instead of silently running the source tier.
- `--quote is a bare flag` — bare-only flags (`--quote`, `--sufficient`, `--json`, `--minimal-receipt`, …) take no value.
- `connection refused` — Ollama is not running at the default base URL; start it or configure a hosted endpoint.
- `model not found` — pull the requested Ollama model or set `--model`.
- No automatic fallback: a missing model, key, or Ollama service fails loud; it does not switch to a hosted model.

## Retrievers

- **`reference`** (default) — deterministic phrase + IDF term selection over a
  memoized corpus index. No model, no embedder, no API call.
- **`dense`** — cosine ranking over a local embedding index (Ollama
  `nomic-embed-text`), cached under `<corpus>/.retrieval-index/`.
- **`router`** — dense first; a NOT FOUND read takes one second hop and
  re-reads. Opt-in, because it inherits the embedder requirement.

An unknown `--retriever` value is refused rather than silently degraded. The
retriever is a swappable layer: the quote gate applies to whatever window the
retriever returns.

## Documentation map

- [`docs/EVIDENCE.md`](docs/EVIDENCE.md) — the why behind the numbers: stress
  tests, the absence study, the formal pilot, known limitations, and the ask.
- [`docs/PROVENANCE.md`](docs/PROVENANCE.md) — the claims registry: every
  figure quoted in the companion article, with its evidence and tier.
- [`kit/README.md`](kit/README.md) — full kit usage and limits.
- [`bench/ooh-README.md`](bench/ooh-README.md) — the benchmark: corpus,
  questions, scorer, arm comparison.
- [`HISTORY.md`](HISTORY.md) — pre-correction results, kept for the record.

## Repository layout

- `kit/` — `retrieval-kit`: the citation-first retriever, gate, and CLI. Runs
  standalone; published as its own package.
- `docs/` — [`EVIDENCE.md`](docs/EVIDENCE.md) (the why behind the numbers) and
  [`PROVENANCE.md`](docs/PROVENANCE.md) (the claims registry).
- `bench/` — the OOH benchmark: corpus, questions, scorer, arm comparison, and
  its own README/spec/manifest.
- `bench/formal/` — the opt-in deterministic verification layer: reader-first
  extraction, Z3 entailment, specification receipts, coverage, router, and the
  competitive pilot. See `bench/formal/README.md`.
- **Not shipped:** `drafts/` — local article/email working copies, gitignored by design.
- `kit/retrieval.config.example.json`, `.env.example` — the default corpus +
  GLM-Flash/DA configuration example; `bench/arm-table.mjs` regenerates the
  ranked tables.
- `package.json` — benchmark scripts (`npm run verify`, `ooh:test`, `ooh:aggregate`,
  `ooh:smoke`, `kit:test`, `arm:fake`, …).

## License and provenance

The corpus is a U.S. Government work (public domain). Code is under the
repository `LICENSE`; article/content terms are in `LICENSE-CONTENT`. The
100-item test labels are private: do not publish or train on them. No
accuracy/SOTA claim is made; the strongest evidence is abstention,
aggregation coverage, and mechanically verifiable receipts.
