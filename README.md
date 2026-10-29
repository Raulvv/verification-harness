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

Status: kit v0.2.0; benchmark v1.2.0, frozen 2026-10-24; ranked pilot 2026-10-29.
The public dev set is for iteration; the 100-item test labels are private and
must not be trained on or published. The ranked pilot is the best consolidation
until the held-out 100 is re-run (blocked on those labels).

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
fragments. An earlier Sonnet DA 75/81 was a raw-index reporting artifact; the
assembled citations are 81/81 exact. No benchmark result changes.

What you get is a property: **every shown answer can be independently
re-verified by a human or a script in seconds**, today and after the corpus,
the model, and the vendor have changed.

**What the gate checks** — file exists at the cited path, title and date match
the resolved metadata, the quote exists (tolerant matcher by default; literal
byte-for-byte with `--strict`), and an abstention has the right shape. **What
it does not check** — whether the quote supports the claim. That is the
judge's class, and conflating the two is how "verified" starts meaning
"probably true."

A reader that **fails** (missing key, HTTP error, unparseable output) is
reported as an error — `gate: not checked`, non-zero exit — never as a
verified abstention. A dead call and an honest `NOT FOUND` must not look the
same.

The shipped default is the **current harness (DA)**: the quote contract
(`v45`) + the mechanical gate + the absence check. The default reader is
**GLM-5.3-Flash** via an OpenAI-compatible endpoint (the repo's example config
uses the OpenCode gateway; set `OPENCODE_API_KEY`). The lighter **Source
receipt** (`source-v45`) is the `--source` opt-in; `--no-absence` is the
gate-only stage; `--strict` is the literal matcher. Local fallbacks:
`qwen3.5:4b` (fast demo; below the contract threshold) and
`qwen3.8-27b` q4 (the best local, slower). Every verification path is offline
and model-free.

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

## The OOH benchmark — the frozen corpus; the ranked pilot is the current baseline

The benchmark is a closed-corpus, document-grounded, factual/calculated/
abstention evaluation built from 48 BLS Occupational Outlook Handbook pages
(2023–33 edition, Wayback snapshot nearest 2025-01-01, public domain). It
measures answer correctness, calibrated `NOT FOUND`, citation support,
aggregation coverage, and cost — over 40 answerable / 20 partial / 40
unanswerable held-out items.

The system's evidence is the arm comparison: same reader, same corpus, same
retrieved K=3 window.

| Arm | Answerable correct | Wrong shown (audited) | Partial correct | Coverage |
|---|---:|---:|---:|---:|
| B — plain RAG with citations | 27/40 | 8/100 | **20/20** | **55/100** |
| C — B + entailment judge | 20/40 | 3/100 | 5/20 | 28/100 |
| D — quote contract + gate | 27/40 | **2/100** | 17/20 | 46/100 |

> **Pre-fix held-out record.** This table predates the partial-rule fix; the
> current harness (DA) has not run on the held-out 100. It is not the headline;
> the ranked pilot below is the best consolidation until the rerun.

D tied plain RAG on answerable accuracy, abstained correctly on 40/40
unanswerable items, and showed fewer wrong answers (2 vs 8). Its correct shown
was **84 vs B's 85**: the raw coverage gap (46/100 vs 55/100) is mostly B's
extra wrong answers. The apparent partial deficit (17/20 vs 20/20) was a
**pre-fix prompt bug** — the partial rule was never wired into the v45 prompt.
After the fix, the corrected pilot gives D **21/24 answerable, 12/12 partials,
1/60 wrong** versus B 20/24, 12/12, 4/60 (correct shown 57 vs 56). The
held-out table above predates the fix; a rerun is blocked on the private
labels. (A citation rerun gave D 20/24 and 3/60 wrong versus the fixed run's 21/24 and 1/60; pilot variance.) On the pre-registered citation run, the simple "quote every claim"
prompt (Q) was 95.2% exact on raw quotes (100% shown) but covered only 66.7% of
required operands and left 7 shown answers with no quote; B carries 0 quotes
(41/60 file mentions, 19/60 none). The contract+gate (D) showed 45/45 exact
quotes and no wrong+invalid, but coverage was 85.7% and 5 absence claims were
false (`pilot-06`/`pilot-08`) — the gate guarantees the receipt, not absence or
truth. A manual claim-level audit finds every positive claim supported (Q
13/13, D 36/36); the automated MiniCheck support over-refused and is not the
measure.

**Latest pilot-v2 — ranked all arms (3 seeds, 60 rows/arm).** Every arm,
including the local 27B. Ranking: total correct across answerable + partial +
unanswerable, then fewer false accepts, then citation coverage, then exactness.
**`D*` is the gate-only ablation (the earlier harness stage); `DA` is the
current harness; they are one harness, not two competitors.** The 27B is local
q4.

| # | Reader | Arm | Ans | Part | Unans | Total | Wrong | Shown | Cov | Exact |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Sonnet 5.5 | DA | 24/24 | 12/12 | 24/24 | 60/60 | 0/60 | 36/60 | 36/36 (100%) | 81/81 (100%) |
| 2 | GLM-5.3 | DA | 24/24 | 11/12 | 24/24 | 59/60 | 0/60 | 36/60 | 36/36 (100%) | 68/68 (100%) |
| 3 | GLM-5.3-Flash | DA | 22/24 | 12/12 | 24/24 | 58/60 | 1/60 | 35/60 | 34/35 (97%) | 64/64 (100%) |
| 4 | DeepSeek V4.1 Flash | DA | 22/24 | 12/12 | 24/24 | 58/60 | 1/60 | 35/60 | 33/35 (94%) | 49/49 (100%) |
| 5 | Sonnet 5.5 | D* | 21/24 | 12/12 | 24/24 | 57/60 | 0/60 | 33/60 | 30/33 (91%) | 74/74 (100%) |
| 6 | GLM-5.3-Flash | D* | 21/24 | 12/12 | 24/24 | 57/60 | 1/60 | 34/60 | 30/34 (88%) | 59/59 (100%) |
| 7 | Sonnet 5.5 | Q | 21/24 | 12/12 | 24/24 | 57/60 | 1/60 | 34/60 | 30/34 (88%) | 55/55 (100%) |
| 8 | GLM-5.3 | D* | 21/24 | 10/12 | 24/24 | 55/60 | 3/60 | 36/60 | 30/36 (83%) | 68/68 (100%) |
| 9 | GLM-5.3 | Q | 20/24 | 12/12 | 23/24 | 55/60 | 4/60 | 36/60 | 30/36 (83%) | 59/59 (100%) |
| 10 | 27B qwen3.8 (local) | DA | 24/24 | 6/12 | 24/24 | 54/60 | 0/60 | 30/60 | 30/30 (100%) | 57/57 (100%) |
| 11 | DeepSeek V4.1 Flash | D* | 18/24 | 12/12 | 24/24 | 54/60 | 0/60 | 30/60 | 30/30 (100%) | 35/37 (95%) |
| 12 | 27B qwen3.8 (local) | Q | 15/24 | 12/12 | 24/24 | 51/60 | 6/60 | 33/60 | 27/33 (82%) | 48/48 (100%) |
| 13 | 27B qwen3.8 (local) | D* | 18/24 | 6/12 | 24/24 | 48/60 | 0/60 | 24/60 | 24/24 (100%) | 42/42 (100%) |
| 14 | 4B qwen3.5 | DA | 24/24 | 0/12 | 21/24 | 45/60 | 15/60 | 39/60 | 27/39 (69%) | 63/63 (100%) |
| 15 | 4B qwen3.5 | D* | 21/24 | 3/12 | 21/24 | 45/60 | 15/60 | 39/60 | 24/39 (62%) | 57/57 (100%) |
| 16 | 4B qwen3.5 | Q | 18/24 | 0/12 | 24/24 | 42/60 | 0/60 | 18/60 | 18/18 (100%) | 21/21 (100%) |
| 17 | GLM-5.3-Flash | Q | 19/24 | 6/12 | 15/24 | 40/60 | 20/60 | 45/60 | 24/45 (53%) | 35/35 (100%) |
| 18 | DeepSeek V4.1 Flash | Q | 13/24 | 2/12 | 24/24 | 39/60 | 6/60 | 21/60 | 14/21 (67%) | 15/15 (100%) |
| 19 | Sonnet 5.5 | A | 17/24 | 4/12 | 9/24 | 30/60 | 27/60 | 51/60 | — | — |
| 20 | GLM-5.3-Flash | A | 9/24 | 2/12 | 12/24 | 23/60 | 36/60 | 48/60 | — | — |
| 21 | 4B qwen3.5 | A | 0/24 | 0/12 | 18/24 | 18/60 | 30/60 | 33/60 | — | — |
| 22 | DeepSeek V4.1 Flash | A | 10/24 | 1/12 | 6/24 | 17/60 | 43/60 | 54/60 | — | — |
| 23 | GLM-5.3 | A | 9/24 | 2/12 | 6/24 | 17/60 | 43/60 | 54/60 | — | — |

| # | Reader | Arm | tok/q | s/q | $/q | $/60 |
|---:|---|---|---:|---:|---:|---:|
| 1 | Sonnet 5.5 | DA | 4,805 | 2.1 | $0.0030 | $0.18 |
| 2 | GLM-5.3 | DA | 3,514 | 4.6 | $0.0038 | $0.23 |
| 3 | GLM-5.3-Flash | DA | 3,549 | 4.2 | $0.0005 | $0.03 |
| 4 | DeepSeek V4.1 Flash | DA | 3,316 | 2.4 | $0.0013 | $0.08 |
| 5 | Sonnet 5.5 | D* | 4,135 | 2.2 | $0.0024 | $0.15 |
| 6 | GLM-5.3-Flash | D* | 3,282 | 4.2 | $0.0007 | $0.04 |
| 7 | Sonnet 5.5 | Q | 3,529 | 1.7 | $0.0045 | $0.27 |
| 8 | GLM-5.3 | D* | 3,260 | 4.5 | $0.0048 | $0.29 |
| 9 | GLM-5.3 | Q | 2,610 | 3.9 | $0.0037 | $0.22 |
| 10 | 27B qwen3.8 (local) | DA | 3,036 | 28.7 | 0* | 0* |
| 11 | DeepSeek V4.1 Flash | D* | 2,990 | 1.8 | $0.0012 | $0.07 |
| 12 | 27B qwen3.8 (local) | Q | 2,387 | 19.7 | 0* | 0* |
| 13 | 27B qwen3.8 (local) | D* | 2,779 | 24.2 | 0* | 0* |
| 14 | 4B qwen3.5 | DA | 3,284 | 2.7 | 0* | 0* |
| 15 | 4B qwen3.5 | D* | 2,730 | 3.1 | 0* | 0* |
| 16 | 4B qwen3.5 | Q | 2,282 | 1.7 | 0* | 0* |
| 17 | GLM-5.3-Flash | Q | 2,846 | 5.3 | $0.0005 | $0.03 |
| 18 | DeepSeek V4.1 Flash | Q | 2,677 | 2.0 | $0.0013 | $0.08 |
| 19 | Sonnet 5.5 | A | 316 | 3.1 | $0.0027 | $0.16 |
| 20 | GLM-5.3-Flash | A | 417 | 3.4 | $0.0002 | $0.01 |
| 21 | 4B qwen3.5 | A | 76 | 0.2 | 0* | 0* |
| 22 | DeepSeek V4.1 Flash | A | 614 | 1.9 | $0.0007 | $0.04 |
| 23 | GLM-5.3 | A | 670 | 6.5 | $0.0028 | $0.17 |

\* local API cost 0; hardware/electricity excluded. The 27B medians are
19.7 / 24.2 / 28.7 s/q; the `arm-compare` means were 23.2 / 26.3 / 31.4.
**A** bare; **Q** quote prompt, ungated; **DA** current harness; **D\*** gate-only
ablation; **27B** local q4. Wrong shown = false accept; a flagged partial miss
sits in Partial. Coverage = shown answers whose quotes cover every required
operand/stated part; Exact = byte-exact quotes/quotes.

The current harness wins the total on every reader: 60, 59, 58, 58 for the
capable hosted readers, 54 on the 27B, 45 on the 4B. On the 27B, **DA 54 > Q 51
> D\* 48**; DA adds six answerable rows over D\* (18→24) but partials stay
6/12, while Q answers 12/12 partials and pays six false accepts and 82%
coverage. The 27B current harness matches DeepSeek Flash on answerable/
unanswerable/wrong (24/24, 24/24, 0/60 vs 22/24, 24/24, 1/60), loses partials
(6/12 vs 12/12) and speed (28.7 vs 2.4 s/q), and the current-harness total is 54
vs 58. The 4B is a trap: DA 24/24 hides 15/60 false accepts and 0/12 partials.
Full table and caveats: `bench/ARM-COMPARE-REPORT.md` § Latest comparison.

**Current harness.** The ranked table above is the current baseline. DA is the
current harness; D* is the gate-only stage and is not a competitor. The 27B
local DA is 54/60, Q 51, D* 48; the 4B is 45/60 and below the contract
threshold. The 27B Q answers 12/12 partials but pays 6/60 false accepts; D/DA
have 6/12 partials and 0/60 false accepts. GLM-Flash DA is 58/60 at $0.03/60
versus Sonnet DA 60/60 at $0.18; DeepSeek DA 58/60 at $0.08. The held-out 100
is pre-fix and not the current result; the ranked pilot is the best
consolidation until the rerun. Read it with the 20-item / 3-seed / one-corpus /
correlated-seed discounts; it is an assurance layer, not an accuracy upgrade.

## Known limitations

Named explicitly, because the alternative is letting a reader over-read the
numbers.

- **Solo study, lab-scale comparison.** One person wrote the questions, built
  the system, and scored it. The closest published work — IBM's STAIR, arXiv
  2609.03874 — is an 18-textbook, six-domain, tens-of-thousands-of-questions
  lab effort. The gap is real; this study was not sized to win it.
- **One corpus, one domain, one snapshot.** 48 BLS pages. Nothing here
  establishes the same result on legal, financial, or internal-policy corpora.
- **One seed, one reader — the held-out only.** The held-out 100 is one
  DeepSeek Flash run; the ranked pilot is 3 seeds, 5 readers, and is the current
  baseline. Three seeds are the bar for a separation claim; the held-out does
  not meet it.
- **Underpowered held-out headline.** 2 versus 8 wrong-shown rows; p=0.070; the
  Wilson intervals overlap. "Comparable, not proven superior" is the correct
  reading. The pilot is a consolidation, not a separation proof.
- **Coverage and partials.** On the pre-fix held-out, D covers less on the
  shown count (46 vs 55) and handles partials worse (17/20 vs 20/20). The
  ranked pilot is the current measurement: DA is 100% coverage on Sonnet/GLM,
  97% on GLM-Flash, 94% on DeepSeek, 100% on the 27B, 69% on the 4B; the 27B
  and 4B lose partials (6/12 and 0/12). The held-out D row predates the fix; a
  rerun is blocked on private labels. The gate buys verification, not a large
  coverage gain.
- **Not pre-registered.** Four partial labels and two scorer phrasings were
  corrected post-hoc — all disclosed.
- **Single human auditor.** One person audited the wrong rows; the second rater
  was a model and weakly concordant (12/18).
- **Private labels.** External re-scoring is limited to published hashes; only
  the dev set is inspectable.
- **Builder = evaluator.** Same author for questions, system, and scoring.
  Disclosure and a shipped scorer mitigate; they do not remove it.
- **Reader and task scope.** The gate needs a reader that follows the
  contract, and its comparative benefit depends on the failure mode. The 4B
  fails the contract (DA 15/60 false accepts; 0/12 partials); the 27B DA is
  24/24 answerable, 0/60 wrong, 6/12 partials; the 27B Q answers 12/12
  partials but pays 6/60 false accepts. GLM-5.3's fabrications were caught;
  Sonnet 5.5's false absences were not. All frontier evidence is a 20-item
  public pilot, not the held-out 100. Built for extractive answers over stable
  corpora; synthesized prose over long documents over-refuses.
- **Citation completeness is model-enforced.** The gate verifies the quotes
  that are shown, not that every operand a calculation used was quoted. In the
  ranked pilot, DA coverage is 100% on Sonnet/GLM, 97% GLM-Flash, 94%
  DeepSeek, 100% 27B, 69% 4B; Q is 53–88% on the hosted readers and 82% on the
  27B. B carries no quotes. Support is a manual claim-level audit (AI
  adjudication, not human); the automated MiniCheck over-refused.
- **Author-defined ceiling.** "88% of the reachable ceiling" uses a 52-item
  ceiling we defined. A descriptive denominator, not a law.

What survives all of this is the narrower claim: **the gate is mechanically
checkable at inference time.** Whether a quote exists in the cited file does
not depend on the benchmark's statistical power. The *comparative* claim — no
accuracy cost versus plain RAG — is the one still owed a pre-registered,
multi-seed, second-corpus run.

**When not to use it.** If your reader is cautious (errors are false
absences, not fabrications), or your buyers do not need an independent audit
trail, plain RAG with citations is cheaper and at least as accurate on this
evidence. The gate's case is specific: confident fabricators, high-stakes
wrong answers, and a requirement to re-check the receipt later.

**Ask.** A funded experiment (held-out 100 rerun, private labels/annotation,
human second rater, API/compute, local GPU) and a consultancy pilot where the
harness fits best (governance/audit on a real corpus, with CTO and
mid-management tech leads), plus allocated working time. The trial has a kill
rule written down first: proceed only if wrong-shown is no worse than the
current RAG **and** coverage is at least 80% of the reachable ceiling **and**
cost is within the current setup. Miss any one and we stop. See
`drafts/receipts-not-confidence.md` and `drafts/email-cto-quotes-not-accuracy.md`
(local, gitignored).

## Repository layout

- `kit/` — `retrieval-kit`: the citation-first retriever, gate, and CLI. Runs
  standalone; published as its own package.
- `bench/` — the OOH benchmark: corpus, questions, scorer, arm comparison, and
  its own README/spec/manifest.
- `drafts/` — local article/email working copies (gitignored; never published).
- `kit/retrieval.config.example.json`, `.env.example` — the default corpus +
  GLM-Flash/DA configuration example; `bench/arm-table.mjs` regenerates the
  ranked tables.
- `package.json` — benchmark scripts (`ooh:test`, `ooh:dev`, `ooh:smoke`,
  `kit:test`, `arm:fake`, …).

## License and provenance

The corpus is a U.S. Government work (public domain). Code is under the
repository `LICENSE`; article/content terms are in `LICENSE-CONTENT`. The
100-item test labels are private: do not publish or train on them. No
accuracy/SOTA claim is made; the strongest evidence is abstention,
aggregation coverage, and mechanically verifiable receipts.
