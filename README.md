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

Status: kit v0.1.0; benchmark v1.1.15, frozen 2026-10-24. The public dev set is
for iteration; the 100-item test labels are private and must not be trained on
or published.

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

Known gap (2026-10-29): the gate currently validates at row level. A Sonnet DA
audit found six second-leg quote fragments missing while the row passed. The
headline table reports the exact-quote audit (75/81 on Sonnet DA); a per-quote
gate is the next hardening step.

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

Two switches are worth naming:

- **The shipped CLI default is a Source receipt** (`source-v45`): the gate
  verifies path, title, and date. There is no quote line to check.
- **`--quote` switches to the `v45` tier**: the full byte-verbatim quote,
  which is the mode the benchmark's harness arm was run in. The default
  matcher forgives case, emphasis, whitespace, and joined segments;
  `--strict` (`verify(..., { strict: true })`) is the literal mode.

Every combination is offline and model-free at verification time.

## Quickstart

Requirements: `git`, Node 18+, and Python 3.10+ (Python only for the benchmark
scripts). No `npm install` is needed. A chat model is needed only for `ask`;
the benchmark checks run without one.

```bash
git clone https://github.com/Raulvv/verification-harness.git
cd verification-harness

# plumbing + deterministic dev runs — no model, no network needed
npm run ooh:smoke

# zero config: a folder is a workspace (needs a local Ollama model)
node kit/bin/retrieval-kit.mjs ask bench/corpus/ooh-v1 \
  "What is the median annual pay for registered nurses?" --quote
```

The second command answers from the frozen OOH snapshot with a verified quote
receipt. Point `ask` at your own folder instead, and it is your corpus.

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
- `--quote` returns the full verbatim receipt; the default `source-v45` returns
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
`retrieval-kit ask` needs one. There is **no default hosted model** and **no
Opencode dependency**; any OpenAI-compatible `/chat/completions` endpoint works.

Defaults when no config or flags are set:

| Setting | Default | Notes |
|---|---|---|
| Base URL | `http://localhost:11434/v1` | Assumes Ollama |
| Model | `qwen3.5:4b` | Only when the base URL looks like Ollama |
| API key | `ollama` | Other endpoints need `RETRIEVAL_API_KEY` or `--api-key-env` |
| Retriever | `reference` | Embedder-free; `dense`/`router` need Ollama `nomic-embed-text` |
| Tier | `source-v45` | `--quote` switches to `v45` |

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

## The OOH benchmark — the corpus we validate on

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

**Latest pilot-v2 headline (A / Q / DA, 3 seeds, 60 rows/arm).** A is the bare
reader — no documents, no harness, no prompt. Q is retrieval + "quote every
claim," ungated. DA is the quote contract + gate + absence check.

| Reader | Arm | Answerable | Partial | Unanswerable | Wrong shown | Shown | Coverage | Exact |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 4B qwen3.5 | A | 0/24 | 0/12 | 18/24 | 30/60 | 33/60 | — | — |
| 4B qwen3.5 | Q | 18/24 | 0/12 | 24/24 | 0/60 | 18/60 | 18/18 | 21/21 |
| 4B qwen3.5 | DA | 24/24 | 0/12 | 21/24 | 15/60 | 39/60 | 27/39 | 63/63 |
| Sonnet 5.5 | A | 17/24 | 4/12 | 9/24 | 27/60 | 51/60 | — | — |
| Sonnet 5.5 | Q | 21/24 | 12/12 | 24/24 | 1/60 | 34/60 | 30/34 | 55/55 |
| Sonnet 5.5 | DA | 24/24 | 12/12 | 24/24 | 0/60 | 36/60 | 36/36 | 75/81 |
| GLM-5.3 | A | 9/24 | 2/12 | 6/24 | 43/60 | 54/60 | — | — |
| GLM-5.3 | Q | 20/24 | 12/12 | 23/24 | 4/60 | 36/60 | 30/36 | 59/59 |
| GLM-5.3 | DA | 24/24 | 11/12 | 24/24 | 0/60 | 36/60 | 36/36 | 68/68 |
| DeepSeek V4.1 Flash | A | 10/24 | 1/12 | 6/24 | 43/60 | 54/60 | — | — |
| DeepSeek V4.1 Flash | Q | 13/24 | 2/12 | 24/24 | 6/60 | 21/60 | 14/21 | 15/15 |
| DeepSeek V4.1 Flash | DA | 22/24 | 12/12 | 24/24 | 1/60 | 35/60 | 33/35 | 49/49 |

| Reader | Arm | tok/q | s/q (median) | $/q | $/60 |
|---|---|---:|---:|---:|---:|
| 4B qwen3.5 | A / Q / DA | 76 / 2,282 / 3,284 | 0.2 / 1.7 / 2.7 | 0* | 0* |
| Sonnet 5.5 | A / Q / DA | 316 / 3,529 / 4,805 | 3.1 / 1.7 / 2.1 | $0.0027 / $0.0045 / $0.0030 | $0.16 / $0.27 / $0.18 |
| GLM-5.3 | A / Q / DA | 670 / 2,610 / 3,514 | 6.5 / 3.9 / 4.6 | $0.0028 / $0.0037 / $0.0038 | $0.17 / $0.22 / $0.23 |
| DeepSeek V4.1 Flash | A / Q / DA | 614 / 2,677 / 3,316 | 1.9 / 2.0 / 2.4 | $0.0007 / $0.0013 / $0.0013 | $0.04 / $0.08 / $0.08 |

\* local reader: API cost 0; hardware/electricity not included. **Coverage** is
shown answers whose quotes cover every required operand/stated part; **Exact**
is byte-exact quotes/quotes. **Wrong shown** is a false accept (shown, not
correct, not flagged); flagged partial misses appear in Partial. **D footnote**
(gate only, existing v2): 4B 21/24, 15/60; DeepSeek 18/24, 0/60; GLM-5.3 21/24,
3/60; Sonnet 21/24, 0/60. It isolates what DA's absence check adds. B is not in
the headline: it is filename-citation-only and carries 0 quotes, so it is not a
fair quote-contract comparator (appendix only). A→Q changes retrieval and the
prompt; Q→DA is the harness step. 20 items, correlated seeds, public pilot; the
held-out 100 above is pre-fix and separate. Full table:
`bench/ARM-COMPARE-REPORT.md` § Latest comparison.

**Sonnet replication (same protocol).** Q: 21/24 answerable, 12/12 partials,
1/60 wrong; D: 21/24, 12/12, 0/60. Both 100% exact quotes; coverage Q 88.2%,
D 90.9%; manual positive support Q 45/45, D 62/69 (the gaps are extra details
not in the quotes). The simple prompt misses the 90% coverage bar by 1.8
points on Sonnet, versus 23 on Flash — the simple prompt's strength is
reader-dependent, while the gate's pass/fail check is not.

**D-absence (Sonnet) — the strongest arm.** Gate + absence check (re-read with
a full-corpus counter-document): 24/24 answerable, 12/12 partials, 24/24
unanswerable, 0/60 wrong, 75/81 exact quotes (93%; six second-leg fragments
missing while the gate passes), 36/36 coverage, 77/83 positive support, 21/21
absence claims true. It fixed `pilot-06` and `pilot-08`. Caveats: the Flash
prototype had one regression, it triggers on every unanswerable/partial (many
no-op re-reads), costs 4,805 tok/q and 2.1 s/q median (2.9 mean) versus D's
4,135 and 2.2, and the trigger widening was post-hoc. Prototype, not
pre-registered.

**Reader capability progression (D vs DA).** 4B: DA fixes `pilot-06` but
partials collapse (3/12 → 0/12) and 15/60 false accepts remain — below the
contract threshold. Flash: DA 22/24 versus D 18/24, but one false accept (D 0).
GLM-5.3: DA 24/24, 0 wrong, 100% coverage, 11/12 partials. Sonnet 5.5: DA
24/24, 12/12, 0 wrong, 100% coverage. The absence check's value scales with
reader capability: DA is the best arm on GLM/Sonnet, mixed on Flash, and no
rescue for the 4B. DA costs more time/tokens (Sonnet 4,805 tok/q vs D 4,135).

**What we can claim.** The gate passes every shown D/DA row, but it is not yet
a per-quote guarantee: 93–100% of quote fragments are byte-exact. On Sonnet DA,
75/81 (93%) are exact and six second-leg fragments are missing while the gate
passes — a known gate gap. DA is the best arm on capable readers
(GLM-5.3 full and Sonnet: 24/24 answerable, 0/60 wrong, 100% coverage);
GLM-5.3-Flash is strong but not equal (22/24, 1/60 wrong, 97%) at ~1/7 the
cost. The gate cuts wrong-shown for fabricating readers but not false absences;
the simple quote prompt is reader-dependent (66.7% Flash, 88.2% Sonnet); reader
capability, not the "Flash" label, is the determinant. Local: GLM-5.3-Flash
needs ~100GB (1-bit) / 128–150GB (3-bit) / 162–210GB (4-bit) — a 128–256GB
unified box, not a 24/48GB GPU; full GLM-5.3 is 223–810GB and DeepSeek V4.1
Flash is 763B/~510GB with a 614GB VRAM minimum (8×H200 class). We cannot claim
a universal best arm, accuracy SOTA, the post-fix held-out, local quantized
equivalence, statistical separation, or that every quote fragment is
validated on every shown row (the Sonnet DA gate gap). Full table:
`bench/ARM-COMPARE-REPORT.md` § Latest comparison.

Read the table with its discounts: one corpus, one seed, not pre-registered,
B vs D p=0.070 — **comparable, not proven superior.** The harness is not an
accuracy leader; the differentiator is proof, abstention, and aggregation
coverage. It is an **assurance layer, not an accuracy upgrade**: verification
itself is free, but the quote contract costs ~1.2–1.7× tokens and time (about
$1.6–2.3 per 1,000 questions for D vs $0.9–1.7 for B on the pilots).

**Reader robustness (2026-10-29 pilots).** The defect is the interface, not the
model tier, so the same arms were rerun on the public 20-item pilot. The
benchmark reader itself (DeepSeek V4.1 Flash, three seeds) reproduced the
held-out direction: D 2/60 wrong shown versus B 4/60 (one B row an empty
output), answerable 18/24 versus 20/24, partials 7/12 versus 9/12. GLM-5.3
(three seeds) reproduced the held-out signature: D **0/60** wrong shown versus
B 4/60 (three substantive, one empty output), unanswerable 24/24, partials tied
9/12, answerable 18/24 versus 21/24. Sonnet 5.5 (two 3-seed replications) did
**not**: D 2–3/60 versus B 3/60, answerable 20/24 versus 21/24, partials 7–8/12
versus 9/12 — a tie. The failure modes explain it: GLM's confident fabrications
are the gate's class; Sonnet's false *absences* ("carpenters' pay is not
stated" when it is) leave no string to reject. A 27B local reader tied too and
refused partials it could answer. The gate's comparative benefit is therefore
reader- and failure-mode-dependent — the mechanical check itself is not. Full
tables, audits, costs, and hashes: `bench/ARM-COMPARE-REPORT.md` § Reader
robustness. These reader pilots predate the partial-rule fix, so their D
partial numbers are understated.

**Absence check (prototype).** An entity-aware full-corpus re-read on absence
claims fixed six false-absence/false-abstention rows on the corrected pilot,
but introduced one wrong row in three seeds. Promising, not shipped; the
partial-rule fix is the clean improvement. Details: report.


Full benchmark detail — corpus, splits, scoring rule, headline numbers,
citation-support audit, submission process — lives in **`bench/ooh-README.md`**.
Protocol and held-out report: `bench/ARM-COMPARE.md`,
`bench/ARM-COMPARE-REPORT.md`. Spec and provenance: `bench/ooh-BENCHMARK.md`,
`bench/ooh-MANIFEST.json`.

```bash
# 14 aggregate dev items, table / all 48 pages (deterministic, no model)
DEV=1 node bench/ooh-aggregate-spike.mjs
DEV=1 PAGES=1 node bench/ooh-aggregate-spike.mjs
```

## Known limitations

Named explicitly, because the alternative is letting a reader over-read the
numbers.

- **Solo study, lab-scale comparison.** One person wrote the questions, built
  the system, and scored it. The closest published work — IBM's STAIR, arXiv
  2609.03874 — is an 18-textbook, six-domain, tens-of-thousands-of-questions
  lab effort. The gap is real; this study was not sized to win it.
- **One corpus, one domain, one snapshot.** 48 BLS pages. Nothing here
  establishes the same result on legal, financial, or internal-policy corpora.
- **One seed, one reader.** DeepSeek V4.1 Flash, one held-out run. Three seeds
  are the bar for a separation claim; none is claimed.
- **Underpowered headline.** 2 versus 8 wrong-shown rows; p=0.070; the Wilson
  intervals overlap. "Comparable, not proven superior" is the correct reading.
- **Coverage and partials.** On the pre-fix held-out, D covers less on the
  shown count (46 vs 55) and handles partials worse (17/20 vs 20/20). After the
  partial-rule fix, the corrected pilot is 12/12 vs 12/12 and correct shown 57
  vs 56. The held-out D row predates the fix; a rerun is blocked on private
  labels. The reader pilots also predate it. The gate buys verification, not a
  large coverage gain.
- **Not pre-registered.** Four partial labels and two scorer phrasings were
  corrected post-hoc — all disclosed.
- **Single human auditor.** One person audited the wrong rows; the second rater
  was a model and weakly concordant (12/18).
- **Private labels.** External re-scoring is limited to published hashes; only
  the dev set is inspectable.
- **Builder = evaluator.** Same author for questions, system, and scoring.
  Disclosure and a shipped scorer mitigate; they do not remove it.
- **Reader and task scope.** The gate needs a reader that follows the
  contract, and its comparative benefit depends on the failure mode. A 4B fails
  the contract (40% false accepts); a 27B abstains on partials it could answer;
  GLM-5.3's fabrications were caught (0/60 versus 4/60); Sonnet 5.5's false
  absences were not (3 versus 3 of 60, two replications). All frontier evidence
  is a 20-item public pilot, not the held-out 100. Built for extractive answers
  over stable corpora; synthesized prose over long documents over-refuses.
- **Citation completeness is model-enforced.** The gate verifies the quotes
  that are shown, not that every operand a calculation used was quoted. On the
  pre-registered run, Q covered 14/21 shown answers (66.7%) and D 30/35
  (85.7%); 3 D answers were wrong yet carried a valid quote. B carries no
  quotes. Support is a manual claim-level audit (Q 13/13, D 36/36 positives);
  the automated MiniCheck over-refused.
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

**Ask.** A time-boxed spike on your own corpus, with a kill rule written down
first: proceed only if wrong-shown is no worse than your current RAG **and**
coverage is at least 80% of the reachable ceiling (the answerable + partial
items your docs can actually answer) **at** cost within your current setup.
Miss any one and you stop.

## Repository layout

- `kit/` — `retrieval-kit`: the citation-first retriever, gate, and CLI. Runs
  standalone; published as its own package.
- `bench/` — the OOH benchmark: corpus, questions, scorer, arm comparison, and
  its own README/spec/manifest.
- `drafts/` — local article/email working copies (gitignored; never published).
- `package.json` — benchmark scripts (`ooh:test`, `ooh:dev`, `ooh:smoke`,
  `kit:test`, `arm:fake`, …).

## License and provenance

The corpus is a U.S. Government work (public domain). Code is under the
repository `LICENSE`; article/content terms are in `LICENSE-CONTENT`. The
100-item test labels are private: do not publish or train on them. No
accuracy/SOTA claim is made; the strongest evidence is abstention,
aggregation coverage, and mechanically verifiable receipts.
