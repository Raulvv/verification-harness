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

## Current result — post-correction 100 (3 seeds, 2026-10-30)

The current 100 is **post-correction and development-informed — not held out**.
The excerpt builder, scorer fixes, and aggregate route were chosen after seeing
this set. The clean held-out set is deferred. **3 seeds**, v2 labels, page
aggregate primary, table control.

The local column is 98 questions (the 2 globals excluded). The system columns
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

Historical results, including the old 6k held-out, the one-seed post-correction
matrix, and the pilot, are in [`HISTORY.md`](HISTORY.md). The full arm report is
`bench/ARM-COMPARE-REPORT.md`.

## Hard-set stress tests (separate from the 100)

Two frozen, human-approved stress sets are kept apart from the main 100 and are
not pooled with it.

**H2 — 100 derived-2033 reader questions.** Three seeds, DeepSeek V4.1 Flash,
no aggregate route. DA 71–75, B 15–20, A 0. DA beats B on 51–58 questions per
seed and loses none; false accepts 10–12 vs 31–45 for B. This is a reader
result: the 2033 figure has to be derived from the jobs and change lines.

**H3 — 100 structured questions**: multi-condition count/sum/extremum, top-k,
equality, negation, signed difference, 17 ambiguity, 15 partial. Reader-only,
DA answers 21/83, plain RAG 17/83, bare 2/83. The gap is full-table
aggregation, not reading. With the deterministic reducer enabled, DA answers
83/83: 68 from the reducer over all 46 paid rows and 15 partial from the
reader. That is a harness capability result, not a reader-skill result.

H3 was human-approved and frozen before the reducer was implemented. The
reducer reproduces all 68 answerable golds offline with no model call; the 17
ambiguity items are outside the reader run and still need the specification
layer. The top-k scorer bug found during this work is fixed (array golds
previously scored vacuously).

**The deterministic reducer is sound; the extractor is not yet safe on natural
language.** The parser alone routed **18/30** reviewed paraphrases and **0/4**
blind natural questions; everything routed was correct (18/18). A
schema-validated extractor — model proposes a spec, schema rejects unknown
fields/ops/titles, reducer computes — then reached **30/30** reviewed
paraphrases, **3/4** blind items, and **H3 100/100**. Those are development
sets.

The clean 10-question v2, frozen after the extractor, scored **6/10 with two
false accepts**:

- “beat inflation” was silently mapped to employment growth and answered **25**.
- “2 worst by projected growth” returned the **two best**, because top-k only
  sorts descending; the rank-2 tie was also ignored.

Two schema gaps (work experience, compound max+min) refused safely, and 4/10
router calls returned empty content because hidden reasoning consumed the token
budget. Schema validation checks shape, not meaning.

After fixes — declared-field grounding, `order: asc`, and a 4,000-token router
budget — the same v2 set (development, not clean) goes **8/10 with zero false
accepts**: 3/5 answerable, 5/5 traps refused, 0/10 JSON failures. The two
remaining misses are the schema gaps. H3 stays **100/100**. The clean claim
still requires a fresh v3 set. Reports:
[`V2-REPORT.md`](bench/formal/competitive/V2-REPORT.md),
[`H3-PARAPHRASE-REPORT.md`](bench/formal/competitive/H3-PARAPHRASE-REPORT.md).
Details and commands:
[`bench/formal/competitive/README.md`](bench/formal/competitive/README.md);
full tables: [`bench/ARM-COMPARE-REPORT.md`](bench/ARM-COMPARE-REPORT.md).

## Citation-quality control (QAMPARI)

Outside OOH, ALCE's QAMPARI is the all-answerable control. On 200 questions DA
matches B: F1 17.5 vs 17.4 (paired +0.1 [−2.5, +2.6]), citation support 68.3
vs 70.4 paired (−2.2, interval includes zero), coverage 79.5 vs 80.0, quote
validity **99.7%** (371/372). DA emits fewer, slightly more precise answers.
**No accuracy gain, no harm.**

The earlier 30-question “+13 citation support” was a pooling artifact; paired
per question it was +4.7 [−0.3, +13.0], and at 200 it is −2.2. This is why the
absence test — SQuAD 2.0, 100 answerable + 100 unanswerable — is the next
experiment. The judge is local MiniCheck, not ALCE's GPT-4, so absolute numbers
are not leaderboard-comparable. Details:
[`bench/formal/alce/README.md`](bench/formal/alce/README.md).

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

## Formal verification path (opt-in)

`ask` can delegate to an external deterministic verifier. The default path is
unchanged; the verifier is a JSON-in/JSON-out command you supply, so the kit
stays standalone.

```bash
node kit/bin/retrieval-kit.mjs ask \
  --formal-cmd "cd bench/formal && .venv/bin/python -m formal.cli --stdin-json" \
  --corpus bench/corpus/ooh-v1 \
  "This is the best career for someone who wants stability."
```

```text
Q: This is the best career for someone who wants stability.
A: Using the default definitions
   `stability = 1×projected growth + 0.0001×employment change + 0.0001×annual openings`
   and `best = highest stability score`, the top-ranked occupation is
   Software Developers, Quality Assurance Analysts, and Testers (score 63.8).

Assumptions:
  - stability = 1×projected growth + 0.0001×employment change + 0.0001×annual openings [default]
  - best = highest stability score [default]

Evidence:
  [1] Software Developers, Quality Assurance Analysts, and Testers · computer-and-information-technology__software-developers · outlook_pct  (gate: verified)
      Job Outlook, 2023-33 | 17% (Much faster than average)
  [2] Software Developers, Quality Assurance Analysts, and Testers · computer-and-information-technology__software-developers · change  (gate: verified)
      Employment Change, 2023-33 | 327,900
  [3] Software Developers, Quality Assurance Analysts, and Testers · computer-and-information-technology__software-developers · annual_openings  (gate: verified)
      About 140,100 openings for software developers, quality assurance analysts, and testers are projected each year, on average, over the decade.

formal: ENTAILED_UNDER_ASSUMPTIONS · spec spec-v1 · ded593b4...
```

`--no-defaults` requires explicit definitions instead of registry defaults. If a
claim needs a definition that is not supplied, the output is
`NEEDS_SPECIFICATION` and the answer asks for it; it is never guessed. This is
the Phase 0/1 specification layer, not a general prose parser.

Positioning: this is a deterministic verifier for **closed structured claims**,
not a replacement for HHEM, MiniCheck, or LettuceDetect on general prose. The
competitive assessment and the gaps are in
`bench/formal/EPIC-FORMAL-002.md` §1.7.

The product path is reader-first: a reader answer goes through
`formal/extract.py` (prose → typed claims) and then the formal verifier. The
`ask --formal` command is a demo/debug path for the same verifier; it is not the
only way to use it.

### Current formal pilot (2026-11-04)

The formal layer has a **human-audited pilot**, not a final benchmark claim.

| Set | Contradicted | False accepts | False rejects | Coverage | One-sided 95% upper bound |
|---|---:|---:|---:|---:|---:|
| 160 public synthetic | 80 | **0** | 1 | 0.74 | 3.7% |
| 80 DeepSeek natural (subset of 320) | 8 | **0** | 0 | 1.00 | 31.2% |
| 160 two-reader natural (subset of 320) | 15 | **0** | 0 | 1.00 | 18.1% |
| **320 four-reader natural (audited)** | **26** | **0** | **0** | **1.00** | **10.9%** |
| Synthetic + natural | 106 | **0** | — | — | 2.8% |

The four-reader natural set is DeepSeek 4.1 Flash DA + Sonnet 5.5 DA +
GLM-5.3-Flash DA + Qwen 3.8 27B DA, human-audited and corrected: **1.00 binary,
0.99 exact, 0 false accepts, 0 false rejects, 1.00 coverage**. The 0.99 exact is
four `partial` answers judged `CONTRADICTION`; the binary endpoint is correct.
The 80 and 160 rows are historical subsets; the 320 row is the audited set.

On the same 320 natural claims, the general detectors are materially weaker:

| System | Binary | Exact | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **1.00** | 0.99 | **0** | **0** | **1.00** |
| MiniCheck | 0.72 | 0.24 | 13 | 75 | 1.00 |
| LettuceDetect | 0.21 | 0.21 | 186 | 66 | 1.00 |
| HHEM-2.1-Open | 0.76 | 0.25 | 4 | 73 | 1.00 |

The synthetic set's coverage is 0.74 because formal abstains on the 40
contradicted absence claims (`INCOMPLETE`); its binary accuracy is 1.00. The
one false reject is the top-coded Physicians maximum, where the source says
“equal to or greater than $239,200”.

**What this supports:** a deterministic verifier for closed structured claims
can be the assurance layer for a reader, with a mechanically checkable
false-accept record on a pilot. **What it does not support:** a population
false-accept rate, general NLI, open-world absence, question-held-out
evaluation, a second domain, or replacement of the detectors. The natural set
is reader-held-out, not question-held-out; one auditor labelled it; the same
100 development-informed questions are used. The 26 natural contradicted claims
are below the pre-registered minimum of 40, so this is still a pilot.

Reproduce the public synthetic slice:

```bash
cd bench/formal
.venv/bin/python -m formal.competitive \
  --claims competitive/pilot-160-human.jsonl \
  --detector competitive/detectors/minicheck-160.jsonl \
  --detector competitive/detectors/lettucedetect-160.jsonl \
  --detector competitive/detectors/hhem-160.jsonl
```

The natural slices are local and gitignored; only aggregate results are
published. Details: [`bench/formal/EPIC-FORMAL-002.md`](bench/formal/EPIC-FORMAL-002.md),
[`bench/formal/competitive/PILOT-160-REPORT.md`](bench/formal/competitive/PILOT-160-REPORT.md),
[`bench/formal/competitive/PRE-REGISTRATION.md`](bench/formal/competitive/PRE-REGISTRATION.md),
and [`bench/formal/EPIC-FORMAL-003.md`](bench/formal/EPIC-FORMAL-003.md).

### CUAD legal pilot

The formal layer also has a public legal-benchmark adapter for **CUAD v1**:
510 commercial contracts, 41 clause categories, official 408/102 split. It is a
deterministic clause-presence baseline with a quote and a closed-corpus coverage
receipt, not a legal-advice system.

| Operating point | Precision | Recall | Micro F1 | False accepts | False rejects | Quote support |
|---|---:|---:|---:|---:|---:|---:|
| Balanced | 0.882 | 0.660 | 0.755 | 110 (3.7% of absent) | 423 | 0.552 |
| Precision-first | 0.911 | 0.568 | 0.700 | 69 (2.4% of absent) | 537 | 0.602 |

The optional Legal-BERT encoder is more precise but much more conservative:
**precision 0.947, recall 0.415, micro F1 0.577, 29 false accepts, 728 false
rejects, quote support 0.602**. It does not solve the weak categories; it
mostly abstains on them.

This is a baseline, not a CUAD leaderboard result. The detector is TF-IDF, not a
legal language model; the weak categories are the ones that need legal
interpretation.

The public CUAD fine-tuned checkpoint `akdeniz27/roberta-base-cuad` is the
reader comparison: **macro AUPR 0.531, P@80 0.308, P@90 0.129** on the official
test split. That is in the published RoBERTa-base/RoBERTa-large range, below
DeBERTa-xlarge. The harness result is the absence/threshold tradeoff: no-answer
false accepts fall from **34.5% at the zero threshold** to **7.5% at best F1**
and **3.0% at a precision-first threshold**, at **21% coverage**. Details:
[`bench/formal/legal/CUAD-QA-REPORT.md`](bench/formal/legal/CUAD-QA-REPORT.md)
and [`bench/formal/legal/CUAD-PILOT.md`](bench/formal/legal/CUAD-PILOT.md).

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

## Historical results

See [`HISTORY.md`](HISTORY.md) for the pre-correction 6k result, the one-seed
post-correction matrix, and the pilot-v2 ranked tables.

## Known limitations

Named explicitly, because the alternative is letting a reader over-read the
numbers.

- **Solo study, lab-scale comparison.** One person wrote the questions, built
  the system, and scored it. The closest published work — IBM's STAIR, arXiv
  2609.03874 — is an 18-textbook, six-domain, tens-of-thousands-of-questions
  lab effort. The gap is real; this study was not sized to win it.
- **One corpus, one domain, one snapshot.** 48 BLS pages. Nothing here
  establishes the same result on legal, financial, or internal-policy corpora.
- **Three seeds, three readers — post-correction.** The current 100 is 3 seeds,
  DeepSeek, Sonnet, and the GLM default; the ranked pilot is the development
  fit. Three seeds reduce run noise but do not make this a held-out set; the
  clean held-out set is deferred.
- **Underpowered historical headline.** The old 6k B/C/D headline was 2 versus 8
  wrong-shown rows; p=0.070; the Wilson intervals overlap. The corrected
  post-correction matrix is at the top; the pilot is a consolidation, not a
  separation proof.
- **Coverage and partials.** On the pre-fix held-out, D covers less on the
  shown count (46 vs 55) and handles partials worse (17/20 vs 20/20). The
  ranked pilot is the current measurement: DA is 100% coverage on Sonnet/GLM,
  97% on GLM-Flash, 94% on DeepSeek, 100% on the 27B, 69% on the 4B; the 27B
  and 4B lose partials (6/12 and 0/12). The held-out D row is the historical pre-correction record; the corrected
  post-correction matrix is at the top. The gate buys verification, not a large
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
  public pilot, not the post-correction 100. Built for extractive answers over stable
  corpora; synthesized prose over long documents over-refuses.
- **Citation completeness is model-enforced.** The gate verifies the quotes
  that are shown, not that every operand a calculation used was quoted. In the
  ranked pilot, DA coverage is 100% on Sonnet/GLM, 97% GLM-Flash, 94%
  DeepSeek, 100% 27B, 69% 4B; Q is 53–88% on the hosted readers and 82% on the
  27B. B carries no quotes. Support is a manual claim-level audit (AI
  adjudication, not human); the automated MiniCheck over-refused.
- **Author-defined ceiling.** "88% of the reachable ceiling" uses a 52-item
  ceiling we defined. A descriptive denominator, not a law.
- **Formal pilot is not a final claim.** The formal verifier has 0 observed
  false accepts on 106 human-audited contradicted claims, but the natural-only
  set has 26 contradicted claims (10.9% one-sided 95% upper bound), one
  auditor, and the same development-informed 100 questions. The OOH natural
  set is one corpus and one snapshot; CUAD is a public second-domain baseline,
  not a private legal pilot. The result is reader-held-out, not
  question-held-out. It does not establish general NLI, open-world absence, or
  a population false-accept rate.

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

**Ask.** A funded experiment (clean held-out set, independent replication,
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
- `bench/formal/` — the opt-in deterministic verification layer: reader-first
  extraction, Z3 entailment, specification receipts, coverage, router, and the
  competitive pilot. See `bench/formal/README.md`.
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
