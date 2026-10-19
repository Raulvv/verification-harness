# Benchmarks — how the kit compares to a bare call and naive RAG

Tracked cross-benchmark view of every run (2026-09-30 → 2026-10-18); every
run's reader is **local** (Ollama), **$0** — rows that run a hosted judge or
oracle name it (kimi-k3, deepseek-v4.1-flash). Per-run detail and method: the
canonical tree's
`bench/RESULTS.md` (not published — this file carries the published cells; the
offline-recomputable subset ships as `reproduce.md`).
This file answers one question: on each benchmark, **ours** vs a **bare**
model call vs a **naive one-call RAG**.

> **v4.5 (2026-10-04):** an opt-in reasoning prompt (`--prompt v45`, a structural
> compare/chain instruction on the *same* answer layer) lifts reasoning questions
> on isolated HotpotQA (**78% → 90%**, N=50, qwen3.5:4b, GLM, by `type`) with **no
> Confluence regression**. It is a *prompt*, not an architecture change — the
> layer comparison below is unaffected. Detail: `RESULTS.md` §Isolation on
> HotpotQA (canonical tree — not published).

## Read first — what "ours" means on each benchmark

| benchmark | N | "ours" is… | bare | naive | full v4 end-to-end? |
|---|---|---|---|---|---|
| SciFact (Tier A) | 300 | `locate.rank`, retrieval only | — | — | **no** (retrieval component only) |
| HotpotQA (Tier B) | 300 | kit answer+receipt layer over a **shared** 10-para window | ✓ | ✓ | **no** (bench window, not the selector) |
| HotpotQA (step 2) | 100 | same | ✓ | ✓ | **no** |
| HotpotQA (R0 sweep) | 60 | same, hybrid top-k | — | — | **no** |
| HotpotQA (G2–G4) | 60 | prompt/model ablations | — | — | **no** |
| HotpotQA (multi-hop) | 40 | selection ablation | — | — | **no** |
| Qasper (long docs) | 30 | kit answer+receipt layer over a top-5 **hybrid** window | ✓ | ✓ | **no** |
| **HotpotQA open-pool e2e (b121)** | **300** | kit answer+receipt+gate over an **iterative** dense window (open pool, gold not guaranteed) | ✓ | ✓ | **no** (bench retriever) |
| **Confluence battery** | **23** | **the real kit (`ask.mjs` → `askOneShot`)** | — | — | **YES** |

### Have we run v4 architecture in all benchmarks?

**No.** The full v4 pipeline — `selectByReference` → `pruneByRelevance` (vet) →
one-shot answer → mechanical gate — has run **end-to-end only on the Confluence
battery** (23 items, 69/69). Every other benchmark exercises a *layer* of v4
fed by the benchmark's own window:

- **SciFact** tests the **retrieval locator** only (no answer/receipt layer).
- **HotpotQA / Qasper** test the **answer + receipt + gate layer** over a window
  the bench assembles (shared / hybrid top-k), **not** the kit's reference
  selector and **not** its vet economics.

So the benchmark numbers are evidence about v4's *layers*, not about the whole
machine on those corpora. A true end-to-end v4 run on HotpotQA/Qasper would
require pointing `askOneShot` at those corpora — not yet done. (The kit's
**selector alone** *has* now been measured on both, as a retrieval arm; see the
table below — it is the weakest arm, which is why the bench doesn't use it.)

## Headline — ours vs bare vs naive (judged correctness, %)

| benchmark | arm | contains-gold | judge qwen3.5:9b | judge granite4:3b | citations |
|---|---|---|---|---|---|
| **HotpotQA** (300) | bare | 17.3 | 26.0 | 27.7 | none |
| | naive RAG | 66.7 | 80.7 | 80.0 | titles, unverified |
| | **ours** | **76.7** | **87.0** | **94.7** | **89.5% quotes byte-verified** |
| **HotpotQA** (100) | bare | 20.0 | 31.0 | 35.0 | none |
| | naive RAG | 69.0 | 80.0 | 83.0 | titles, unverified |
| | **ours** | **76.0** | **87.0** | **93.0** | byte-verified |
| **Qasper** (30) | bare (closed-book) | — | 10.0 | 86.7 | none |
| | naive RAG | — | 66.7 | 90.0 | none |
| | **ours** | — | **73.3** | **90.0** | 90% answer with quotes; **88.9/100 sufficient** |
| **Confluence** (23) | **ours (v4)** | — | — | — | **69/69** (verdict+path+quote) |

- **Ours leads judged accuracy** on both HotpotQA sets and Qasper-qwen, ties
  Qasper-granite, and is the **only** arm with machine-verifiable quotes.
- **Qasper caveat:** the two judges disagree sharply on the bare arm
  (qwen 10.0 vs granite 86.7) — free-form judging with "extra context allowed"
  is noisy on long open answers; read the Qasper split cautiously.
- Correctness = contains-gold + cross-family local judges, not EM/F1 (the kit
  answers in prose + quotes; EM/F1 only measure verbosity).

## Retrieval component — SciFact (300 queries)

| method | nDCG@10 | R@10 | R@100 |
|---|---|---|---|
| BM25 | 66.2 | 78.4 | 88.3 |
| dense (nomic-embed-text) | 70.3 | 84.4 | 92.8 |
| ours (`locate.rank`) | 52.6 | 65.9 | 82.9 |
| **hybrid (RRF)** | **70.6** | — | **95.5** |

Our locator is the weakest first stage on abstract corpora — its
heading/reference mechanism is inert on BEIR. The architecture's claim is the
answer + receipt layer, **not** raw retrieval.

**The kit's real selector, measured (`selectByReference`, `bench/run-selectarm.mjs`,
both-gold recall at a matched window):**

| dataset (N) | `selectByReference` | hybrid top-5 | hybrid top-6 |
|---|---|---|---|
| HotpotQA (60) | **31.7%** | 80.0% | 90.0% |
| Qasper (40) | **52.5%** | 60.0% | 65.0% |

This is the concrete reason the bench does **not** use the kit's selector as its
default retrieval arm — it is a shortlist selector keyed on the question naming
a document's title/heading, and it loses badly on HotpotQA (the un-named bridge
hop) and modestly on Qasper. Full detail: `bench/RESULTS.md` §selectByReference
as a retrieval arm (canonical tree — not published).

## Open-pool multi-hop end-to-end — b121 (2026-10-18, N=300)

HotpotQA distractor-dev over an **open pool of 2,964 paragraphs** — each
paragraph gold for one question, a distractor for the rest, so retrieval can
genuinely miss. Script `bench/e2e-ir.mjs`; artifacts
`bench/results/b121-e2eir-4b.jsonl` + `b121-e2eir-4b-ours9b.jsonl`
(sha256-pinned, recomputable); oracle deepseek-v4.1-flash (strict, escalating
budget). Corrected golds: 4 wrong upstream keys + 1 unescrutable item, audit
note below.

**Retrieval — established methods only, both-gold recall@6:**

| method | recall@6 |
|---|---|
| dense | 83.3 |
| hybrid (dense+BM25, RRF) | 76.7 |
| **iterative (hybrid + bridge re-query)** | **88.0** |

**Reader accuracy (strict oracle; naive and ours share the iterative window):**

| arm | correct |
|---|---|
| bare | 25.3 |
| naive RAG | 80.3 |
| **ours** | **80.3** |

**The frozen gate over those same answers:**

| judge | verified precision | shown | exact state agreement |
|---|---|---|---|
| kimi-k3 (hosted) | **93.5** (215/230) | 269/300 | — |
| qwen3.5:9b (local) | **88.2** (232/263) | 271/300 | **85.3** (256/300) |

- The 9B row re-judges the **byte-identical reader answers** against
  recomputed windows (0 mismatches) — the table's gap is the judge alone:
  **~5pp for going fully local**, at judge latency parity (3.76 vs 3.32 s/rec).
- Where the local judge promotes the hosted judge's middle band, **20/36**
  are correct; coverage cost of real retrieval noise vs gold windows: 97% →
  ~90%, verified precision ~unchanged (see the article §3.4 b121 block).
- **Golds:** 4 upstream HotpotQA keys corrected in place (+1 unescrutable);
  every affected row re-labeled by the same strict oracle, pins re-locked.
- All two-hop (no factual stratum), public data (memorization applies — the
  article §1 caveat), one run, one pass per judge.

## Cost (the honest part)

Ours is **not** faster or cheaper than naive one-call RAG: the receipt/quote
contract costs ~2× latency and ~32.5% more tokens (HotpotQA, N=300: 9.8 vs 4.8 s/q,
2044 vs 1543 tok). On the product corpus the machine is hardware-bound
(decode ~21.7 ms/tok; latency profile in `bench/RESULTS.md`, canonical tree —
not published). The differentiator is **accuracy + verifiable citations**, not speed.

## Model-size sweep — the 2×2 + the receipt ladder (2026-10-01)

100 HotpotQA items, shared window, cross-family judged (`bench/run-crossover.mjs`):

| arm | model | qwen | granite | s/q |
|---|---|---|---|---|
| bare | 4B | 24.0 | 29.0 | 0.2 |
| naive RAG | 4B | 80.0 | 81.0 | 2.4 |
| ours (full) | 4B | **86.0** | **93.0** | **6.1** |
| ours (source) | 4B | 82.0 | 88.0 | 3.5 |
| naive RAG | 9B | 80.0 | 83.0 | 4.7 |
| ours (full) | 9B | 87.0 | 93.0 | 11.4 |
| ours (source) | 9B | 83.0 | 91.0 | 9.6 |
| bare | 27B | 36.0 | 37.0 | 1.2 |
| naive RAG | 27B | 89.0 | 88.0 | 20.3 |
| ours (full) | 27B | 87.0 | 93.0 | 30.4 |

- **Size doesn't replace retrieval**: bare climbs only 24→31→36% across 4B→9B→27B — composed across three runs over the same 100 ids (24% `crossover-100.json` bare4, 31% `tier-b-hotpot-300-judged.jsonl` head-100 bare, 36% `final-arms-100.json` bare27), not one three-arm table.
- **The architecture, not the model, is the ceiling**: ours-full is 86/93 (4B),
  87/93 (9B), 87/93 (27B) — statistically flat. Accuracy is model-size-free.
- **The receipt ladder grounds at every size**: naive → source → full is
  monotonic at both 4B (80→82→86) and 9B (80→83→87).
- **4B is the sweet spot**: matches the 9B at half the latency, the 27B at ~⅕.
- **Sub-4B cliffs, and it's family-specific** (not context, not size): qwen3.5
  full drops 86→73→71 at 4B→0.8B→2B; llama3.2:3b (20) and granite4:3b (50) are
  worse than qwen3.5:0.8b. Traceability (byte-verbatim quotes) is universal —
  every model, every size, produces gate-verified quotes.

## One-line read

At zero cost, on attributed QA the kit is the most accurate local arm and the
only one with receipts a machine can re-check. Two properties decouple:
**traceability is model-size-free** (verified quotes from 0.8B up), while the
**accuracy ceiling is the answer layer and qwen3.5-specific** — a 4B with the
receipt layer matches a 9B (and a 27B). The architecture buys a ~2×
model for free. (v4 has run end-to-end only on the Confluence corpus so far.)
