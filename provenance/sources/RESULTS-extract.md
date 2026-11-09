# RESULTS.md — evidence extract

Migrated 2026-11-09 from the private origin repository's `bench/RESULTS.md` (line ranges as of extraction).
Verbatim section extracts backing the claims in PROVENANCE.md, with the private corpus's name redacted to “private wiki”.

---

## [L530-574] Runtime tuning — the speed axis is exhausted (2026-10-01) [hardware]

## Runtime tuning — the speed axis is exhausted (2026-10-01)

Environment: **Apple M4 Max** (32-core GPU, Metal 4), 36 GB unified;
`qwen3.5:9b` **Q4_K_M**, **100% GPU**, ctx 32768. A/B of Ollama runtime knobs
on 4 heavy battery prompts (`bench/run-runtime-tune.mjs`):

| option set | prefill ms | prefill ms/tok | decode ms/tok |
|---|---|---|---|
| **default** | **8909** | **2.05** | 33.9 |
| ctx8k | 9236 | 2.13 | 33.4 |
| batch2048 | 10400 | 2.39 | 36.6 |
| batch2048+ctx8k | 10747 | 2.47 | 32.4 |
| batch512+ctx8k | 10014 | 2.30 | 33.0 |

**No knob helps** — `num_batch=2048` makes prefill *worse*; `num_ctx` is
roughly neutral. Combined with an already-fast quant and full GPU offload, the
runtime is at its best: faster answers require **different hardware** (bigger
GPU) or a **smaller model** (the 4B collapsed accuracy). A 27B Q4 (17 GB) fits
the 36 GB but decodes ~3× slower and was not better when tried. **Net: no
speed lever remains that does not spend accuracy.**

### Parallelism does not help (2026-10-01)

`bench/run-concurrency.mjs`: K=4 distinct ~document-sized prompts, run
sequentially vs concurrently (`Promise.all`), model pre-warmed:

| mode | wall ms | sum-of-calls ms |
|---|---|---|
| sequential | 21880 | 21880 |
| parallel (`Promise.all`) | 20202 | 49535 |

**Speedup 1.08× — none.** The calls genuinely overlapped (sum 49.5 s ≫ wall
20.2 s), but the single M4 Max GPU is saturated by one stream, so each
concurrent call inflates (~5.5 s → ~12.4 s) and wall time is unchanged. Two
consequences:

- Fanning the window out into **per-document** model calls would not be faster
  — same total GPU work, plus per-call overhead and *more* generated tokens.
- It would also break the design: the kit is deliberately **one call over the
  window** (synthesis + attributed receipts); per-doc reads lose cross-document
  synthesis and turn receipts into a merge problem.

Parallelism only pays with multiple GPUs/instances or an underutilized device —
not here (100% GPU, one stream).


---

## [L575-613] Does quoting change the answer? — quote A/B + four-arm judge (2026-10-01)

## Does quoting change the answer? — quote A/B + four-arm judge (2026-10-01)

The receipt costs ~2× latency and the quote is *decode* tokens (the expensive
kind, ~21.7 ms/tok). The question is whether that cost buys accuracy: does
requiring a verbatim quote change the answer? Measured two ways.

**Quote A/B** (`bench/run-quote-ab.mjs`): each golden item twice — the full
prompt (answer + verbatim quote) and `PROMPT_NOQUOTE` (answer only; every other
rule byte-identical). Verdict (answer holds the `expect` facts) **20/23 vs
19/23**, byte-identical text **3/23**, tokens **41300 → 37770 (−9%)**, latency
**294 s → 217 s (−26%)**. The three verdict diffs were all superficial (E3
"decouple"→"decoupling", F4 "14 Nov 22"→"14 November 2022", M4 where *noquote*
was better) — morphology/date-format, not facts.

**Four-arm judge** (`bench/run-quote-judge.mjs`, 21 answerable + 2 not-found,
cross-family qwen3.5:9b + granite4:3b):

| arm | answerable qwen | answerable granite | contains-gold | not-found abstains | tok/q |
|---|---|---|---|---|---|
| bare (closed-book) | 5% | 52% | 0% | 1/2 | 85 |
| old (verbatim quote) | **90%** | **100%** | 29% | 2/2 | 1796 |
| new (no quote) | **90%** | **100%** | 19% | 2/2 | 1642 |
| middle (source doc) | **90%** | **100%** | 19% | 2/2 | 1681 |

**Reading.** Quoting does **not** improve accuracy — old/new/middle are
identical on the judge; all three miss the same two hard items (F3 "95%",
T2 "stale list"). The only gap is `contains-gold` (29% vs 19%): forcing a
verbatim quote makes the answer *borrow the doc's exact words*, which the
substring metric rewards — a metric artifact, not an accuracy difference. Bare
is the floor (5% qwen; granite 52% is the known free-form judge noise), so the
corpus is load-bearing, the verbatim quote is not. The `middle` tier (answer +
`Source: doc`, no byte-quote) carries provenance at ~6% fewer tokens than
`full`; `new` is cheapest but drops provenance entirely.

**Consequence.** The receipt ladder is real and measured: `bare` (floor) →
`source` (provenance) → `full` (byte-verbatim, the differentiator when
traceability is demanded). Shipped as `--prompt source` (`PROMPT_SOURCE` +
`assembleSource`), not the default. The full-path battery stays **69/69**.


---

## [L742-771] Layer 3 — the human audit (2026-10-04) [24-row judge audit, 12/12]

### Layer 3 — the human audit (2026-10-04)

`bench/judge-audit.mjs` pooled 24 disagreements (plus judge-only lift wins),
added a third-family vote (`llama3.2:3b`), and the maintainer marked each answer
against the gold. Agreement with the human:

| signal | agrees with human |
|---|---|
| qwen (strict) | **79.2%** (19/24) |
| llama3.2:3b (third family) | 70.8% (17/24) |
| `contains` | 66.7% (16/24) — it said "no" on all 24, so this is the sample's base rate |
| granite | **16.7%** (4/24) — near-inverted |

**Finding: granite is not a trustworthy judge.** On disputes it says "correct"
where the human says wrong (granite=yes / qwen=no rows were wrong **12/12** in
the sample). Its larger lift figures (**+11.2 / +12.6**) are a yes-bias artifact
and must be **struck as corroboration**. qwen is the better arbiter (79%) but not
perfect — in the sample it passed two wrong `src4` answers and missed one right
one. The two sampled **judge-only receipt wins** (rows 2 and 7) were both
human-false: the judge-dependent part of the qwen lift is **unconfirmed**.

**Bounded:** 24 rows, deliberately enriched for disagreement — this measures the
judges *where they disagree*, not their overall accuracy (a uniform random
sample of the 500 is the unbiased estimate, if ever needed).

**Consequence:** the lift's trustworthy anchors are the model-free `contains`
signal (+6.6, p=0.003 — itself receipt-favourable) and qwen (+4.2, p≈0.05,
marginal). The granite-based larger estimate is dropped, and the article's
"+11 on the second judge" is corrected. Recorded in the ledger (§B10, §B11).


---

## [L772-796] Candidate judges — what could replace granite (2026-10-04)

### Candidate judges — what could replace granite (2026-10-04)

`bench/judge-candidates.mjs` runs candidate judges over the same 24 human-marked
rows. The qwen/granite/llama rows are controls and reproduced their recorded
values exactly (79.2 / 16.7 / 70.8) — the script is valid.

| judge | family | local? | agreement with the human |
|---|---|---|---|
| qwen3.5:9b (current primary) | qwen | yes | 79.2% |
| granite4:3b (old second) | IBM | yes | 16.7% |
| llama3.2:3b | Meta | yes | 70.8% |
| mistral:latest | Mistral | yes | 37.5% |
| qwen3.8-27b | qwen | yes | 87.5% |
| DeepSeek 4.1 Flash (hosted) | DeepSeek | no | **95.8%** |
| GLM 5.3 Flash (hosted; judges both local and hosted) | Zhipu | no | **95.8%** (23/24; per-row verdicts in `bench/judge-audit.json` `glm`) |

**The field exposes the real problem: no good local cross-family judge exists.**
The best local option (qwen3.8-27b, 87.5%) is still qwen — and the answer models
are qwen3.5, so a qwen judge is a **self-judge** (the 9B arms are judged by a
qwen 9B today). Only the hosted frontier model is both cross-family and good
(95.8%). Per-row frontier verdicts are recorded in `bench/judge-audit.json`
(`frontier`). "Substitute granite everywhere" on the local bench forces a
decision: a same-family local judge (better numbers, same blind spot) or a
hosted judge (cross-family, breaks the all-local claim).


---

## [L815-842] Cross-family re-judge — the lift shrinks (2026-10-04)

### Cross-family re-judge — the lift shrinks (2026-10-04)

The entire judge-dependent space — **548 `contains=0` cells** across the four
lift arms — re-judged with the validated cross-family frontier judge
(`bench/frontier-cells.mjs` → 7 slices → `bench/frontier-cells-score.mjs`).
Frontier and qwen agree on **86.9%** of those cells; the disagreement is exactly
the lift.

| judge | naive4→full4 | naive9→full9 |
|---|---|---|
| **frontier (independent, 95.8% on the human audit)** | **+1.4pp (p=0.53, n.s.)** | **+1.0pp (p=0.66, n.s.)** |
| **GLM 5.3 Flash (independent, 95.8% on the human audit)** | **+1.8pp (p=0.40, n.s.)** | **+0.6pp (p=0.82, n.s.)** |
| qwen (self-family for the qwen answer arms) | +4.2pp (p=0.046) | +4.2pp (p=0.038) |
| `contains` (model-free, receipt-favourable) | +6.6pp (p=0.003) | +7.8pp (p=0.0002) |

**Finding: under two independent cross-family judges the local accuracy lift is
~+1–2 points and NOT significant** (frontier +1.4/+1.0; GLM +1.8/+0.6; both
agree with qwen on ~86% of the cells). qwen's +4.2 was partly self-family
generosity — it rated the *naive* arm lower than the independent judges did,
inflating the gap. The receipt arm's
*absolute* accuracy (~85%) is stable across judges; the *lift* is not. The
`contains` lift (+6.6/+7.8) is real but receipt-favourable: the prompt makes the
answer echo the doc's words, which substring matching rewards.

**Consequence: the accuracy lift is not the pillar.** The mechanism's defensible
value is the machine-verifiable citation, honest abstention, and on-device /
zero egress — not a large accuracy gain. The article and one-pager are corrected.


---

## [L1392-1420] Hosted reader on the open corpus — HotpotQA is contaminated (2026-10-05)

### Hosted reader on the open corpus — HotpotQA is contaminated (2026-10-05)

`bench/rung2-hosted.mjs` — the "agent is the model" pattern: **DeepSeek 4.1
Flash** answers the *exact* kit prompts (dense / fuse / oracle windows, plus a
closed-book `bare` arm) on the pooled open corpus, N=25. Correctness vs gold
(contains + manual inspection of the disputed cells, all correct):

| arm | correct |
|---|---|
| **bare (closed-book, no docs)** | **~96%** |
| dense | ~96–100% |
| fuse | ~84% |
| oracle (gold window) | 100% |

**Closed-book ≈ oracle.** The bare answers are genuinely right (verified by eye:
Derrickson/Wood, Chief of Protocol, Animorphs, Big Stone Gap → Greenwich
Village, WINNER → YG Entertainment) — DeepSeek **knows** these HotpotQA facts
from training and never abstains.

**Finding.** On a public benchmark a capable model needs **no retrieval**:
`bare ≈ dense ≈ oracle`. The retrieval lift measured on HotpotQA (bare 36% →
91%) is a **weak-model effect**; accuracy on public data **cannot** measure the
architecture with a capable reader, and the selector (dense/fuse/reference) is
**moot** there. The architecture's accuracy value is **inverse to model
capability and to how public the corpus is**; the durable value is
**grounding/abstention**, which must be measured on a corpus the model does
**not** know (private/internal — e.g. the private wiki battery). N=25, one run;
the contamination point is qualitative and robust.


---

## [L1421-1494] Hosted reader on the PRIVATE corpus — retrieval is decisive (2026-10-05)

### Hosted reader on the PRIVATE corpus — retrieval is decisive (2026-10-05)

`bench/private-wiki-hosted.mjs` — DeepSeek 4.1 Flash answers the exact kit prompts
(reference / dense / fuse windows + closed-book `bare`) on the **private**
private wiki corpus (23 items); GLM-judged (independent of the reader).

| arm | correct | abstain |
|---|---|---|
| **bare (closed-book)** | **2/23 = 9%** | **87%** |
| reference | 22/23 = **96%** | 9% |
| dense | 21/23 = **91%** | 9% |
| fuse (dense+BM25) | 22/23 = **96%** | 9% |

**The mirror of HotpotQA.** On a private corpus a capable model **cannot** answer
from memory: bare **9%**, and it **abstains honestly 87%** of the time (no
confident hallucination). The window lifts it to **91–96% (+82–87pp)** — the
architecture's value, cleanly measured. With a capable reader the selector still
matters a little: **fuse = reference (96%) > dense (91%)** — dense's
named-corpus selection miss is **real, not just small-model** — and **fuse closes
it** while keeping dense's open-corpus reach.

**Fourth cell — a small local reader on the private corpus.** The same battery
with **qwen3.5:4b** (local, reference selector) gives **42/46 = 91%** — so on a
private corpus a **small** reader matches the capable one (91 vs 91–96). Model
capability substitutes for retrieval **only where the model already knows the
answers** (public); where it does not, both sizes need the window. The full 2×2
is now measured.

**Private vs naive RAG (2026-10-05).** Same reader, same dense window, same
judge, on the private corpus: capable DeepSeek gives **ours `source-v45` 23/23 =
100% = naive RAG 23/23 = 100%** (0 discordant); local 4B gives **ours 42/46 = 91%
vs naive 20/23 = 87%** (~1 item). So retrieval beats **bare** (9% → 91–100%), but
**any RAG does**; the architecture does **not** beat naive RAG on accuracy. The
differentiator is **traceability + abstention**, not accuracy over naive RAG. (A
second *real* private corpus is not available; the entity-obfuscated HotpotQA
attempt leaks and degrades retrieval — `bench/private2.mjs`, ledger B41.)

**Second corpus, unknown to the reader — a from-scratch synthetic world
(2026-10-05).** `bench/synth2.mjs` — 500 random-entity documents, 120 questions
(the facts are fictional, so the reader cannot know them), qwen3.5:4b,
contains-gold (model-free):

| arm | correct | tokens/q | s/q | abstain |
|---|---|---|---|---|
| bare (closed-book) | **0/120** | 104 | 0.7 | 51% |
| naive RAG (dense + plain) | 91/120 | 575 | 1.3 | 24% |
| **ours (`source-v45`)** | **91/120** | 929 | 1.9 | 16% |
| oracle (gold docs) | 120/120 | 557 | 1.3 | 0% |

`bare` 0/120 confirms the corpus is unknown; single-hop (90 q) is **100% for both
naive and ours**; **multi-hop (30 q) is naive 1/30 = ours 1/30, oracle 30/30** —
multi-hop is a **retrieval** failure (dense top-6 misses the second hop), not the
reader or the contract. **Ours costs ~1.6× naive's tokens for the same
accuracy.** Confirms B40: no accuracy advantage over naive RAG.

**Same corpus × a capable reader (hosted DeepSeek, `--prepare` worksheet):**
`bare` **0/120** (unknown even to a capable model) · **naive 91 = ours 91** ·
oracle 107. Single-hop 100% both; **multi-hop naive 1/30 = ours 1/30, oracle
17/30** — the capable model is *worse* at multi-hop than 4B (oracle 17 vs 30):
**capacity is not the lever, retrieval is.** Ours ~2× naive's prompt. Third
independent confirmation that **ours = naive RAG on accuracy** (B40/B42/B43).

**Cost (DeepSeek, `bench/deepseek-synth.mjs`; B43 recorded accuracy only):**

| arm | correct | tokens/q | s/q |
|---|---|---|---|
| bare (closed-book) | **0/120** | 379 | 4.0 |
| naive RAG | 92/120 | 613 | 2.4 |

The capable reader **matches the 4B's naive accuracy** (92 vs 91) at about the
same tokens, at **~2× the latency** (a hosted round-trip). Against the 4B's own
costs (bare 104 tok · 0.7 s; naive 575 · 1.3 s), the capable model buys **no
accuracy** here — only latency. The corpus is unknown to both (bare 0/120).


---

## [L1567-1586] Sufficiency gate — nothing beats the free abstention signal (2026-10-05)

### Sufficiency gate — nothing beats the free abstention signal (2026-10-05)

Routing iterative by a **gate** ("is the window sufficient, or escalate?").
Objective label = gold in the dense window; the set that matters = **confidently
wrong** (dense answered, gold absent) — the free `NOT FOUND` catches none.

| gate (HotpotQA bridge, 79) | overall | catches conf‑wrong | false‑escalation |
|---|---|---|---|
| **abstention (free)** | **70/79** | 0/7 | 2/69 |
| granite4:3b | 70/79 | 1/7 | 0/69 |
| qwen3.5:9b | 69/79 | 3/7 | 4/69 |
| qwen3.5:0.8b | 69/79 | 1/7 | 1/69 |
| **Jeeves (Jev-style, zero-shot)** | **65/79** | **0/7** | 4/69 |

**No zero-shot gate beats the free signal**, and the proper System-1 (Jeeves,
run locally on MPS/FP8) is no better out-of-domain. On the synthetic set there
are *zero* confidently-wrong cases (dense abstains on all multi-hop) — the gate
has nothing to add. **Router = abstention** (B48); a trained Jev-style head on
the sufficiency decision is the only unproven door (B49–B51).


---

## [L2061-2116] Corrections + the entailment gate (2026-10-08)

### Corrections + the entailment gate (2026-10-08)

Two more artifacts, fixed (B71):
- **27B `response\n` prefix.** `qwen3.8-27b` emits a literal template token before
  the answer; a first-line parser read `response`. Stripped: **0.515/0.450 →
  0.694/0.600** (between the 4B 0.603 and the 9B 0.705, not below the 4B). Its
  **19/100 abstentions with gold present are real** — it over-refuses.
- **raw SF-F1 `sources`.** The raw model leaves the JSON `sources` field empty
  (it fills `quotes`). On the **same** dense window, reading `quotes[].doc`:
  **4B rag 0.645 vs kit 0.603 · glm rag 0.594 vs kit 0.634** — **no consistent
  kit advantage on SF-F1**; the kit's win is quote *integrity*, not source choice.

**Entailment gate** (`bench/hotpot-gate.mjs`, 4B reader, gate glm-5.3-flash,
accuracy judge deepseek-v4-pro, N=100):

| set | raw | gated |
|---|---|---|
| gold-present accuracy (judge-scored) | **0.870** | 0.630 (24 false abstentions) |
| gold-removed abstention | 0.660 | **0.880** (caught 22/34 = 0.647) |
| combined accuracy | **0.765** | 0.755 |

- The receipt arms' missing answer-accuracy number: **0.870** (gold-present,
  cross-family judge) — EM 0 was a format artifact, not wrong answers.
- The gate catches **65% of fabrications** but costs **24% false abstentions**;
  **combined accuracy is flat**. Net-positive needs calibration, not a binary
  INSUFFICIENT→abstain.

### N=300 paired test + the offline gate (2026-10-08)

HotpotQA distractor, 10k paired bootstrap + exact McNemar on the same items
(`bench/hotpot-n300.mjs`):

| comparison | n | A | B | diff | McNemar p | boot95% CI |
|---|---|---|---|---|---|---|
| C1 abstention kit vs raw-dense-6 | 300 | 64.3 | 64.7 | +0.33pp | 1.0000 | [0.00, 1.00] |
| C2 entailment 4B vs glm | 262 | 69.1 | 90.1 | **+20.99pp** | **0.0000** | [15.27, 26.72] |
| C3 accuracy 4B vs 9B | 300 | 83.0 | 85.3 | +2.33pp | 0.2649 | [−1.00, 6.00] |

- **C1 is exactly tied** — the abstention "gap" was the metric artifact.
- **C2: glm's quote→answer entailment is +21pp** over the 4B (reader family
  matters; dropped-as-failure 60.2 vs 81.6, same +21pp).
- **C3: 9B ≈ 4B** on judge-scored accuracy (p=0.26). The old EM gap (0.603 vs
  0.705) was **span-format**, not correctness.

**Offline entailment gate** (`bench/hotpot-gate-offline.mjs`, re-judges stored
outputs — no regeneration):

| | raw | gated |
|---|---|---|
| gold-removed abstention | 0.643 | **0.937** (caught 88/107 = 82.2%) |
| gold-present accuracy | **0.823** | 0.607 (65 false abstentions = 21.7%) |
| combined | 0.733 | **0.772 (+3.9pp)** |

- At N=300 the gate is **net positive**: it trades **21.7% false abstentions**
  for catching **82% of fabrications**, for **+3.9pp combined accuracy**.


---

## [L2130-2280] Gate generalization + judge overlap + threshold sweep (2026-10-08) [NLI tau sweep]

### Gate generalization + judge overlap + threshold sweep (2026-10-08)

**Per-reader gate, non-reader judge** (`bench/hotpot-gate-readers.mjs`, gate
`deepseek-v4.1-flash`, acc `kimi-k3`, N=100):

| reader | abstained | raw-acc | entailment | gate false-abstention |
|---|---|---|---|---|
| 4B | 4 | 0.860 | 69.5% | 0.240 |
| 9B | 7 | 0.840 | 65.9% | 0.250 |
| glm | 7 | 0.880 | 81.5% | 0.160 |

- **Judge overlap (a flaw, now fixed):** the gate judge was `glm-5.3-flash`,
  which is also a reader. glm's entailment under the glm gate was ~90%; under a
  non-reader gate it is **81.5%**, while 4B is unchanged (69.5 vs 69.1). C2's
  +21pp was **partly self-preference**; the reader effect survives at ~+12pp.
  **The gate must use a non-reader judge.**
- **The gate generalizes across readers** (reader-agnostic): false-abstention
  0.24 / 0.25 / 0.16.

**Threshold sweep** (`bench/hotpot-threshold.py`, local `nli-deberta-v3-base`,
off stored outputs):

| τ | catch (gold-removed) | false-abstention (gold-present correct) |
|---|---|---|
| 0.05 | 0.690 | 0.402 |
| 0.50 | 0.750 | 0.471 |
| 0.95 | 0.790 | 0.586 |

- **No good NLI operating point** — the NLI false-abstains 40% of correct
  answers even at τ=0.05. The **binary LLM judge** (21.7% false at 82% catch)
  dominates; a graded LLM score would be needed for a real sweep.

**Product change — tri-state** (`ask --unverified`): with `--sufficient`, an
INSUFFICIENT verdict now **keeps the answer and flags it** instead of abstaining,
giving `state` ∈ {`verified`, `unverified`, `not_found`} (also in `--json`). This
recovers the gate's false abstentions as flagged answers.

### Graded gate + tri-state end-to-end (2026-10-08)

Graded quote→answer support (1–5, **non-reader** judge `deepseek-v4.1-flash`)
over the stored N=300 outputs (`bench/hotpot-graded.mjs`).

**Threshold sweep** (gold-removed answered 89 · gold-present correct 228):

| τ | catch (gold-removed) | false-abstention (gold-present correct) |
|---|---|---|
| 2 | 0.629 | 0.197 |
| 3 | 0.742 | 0.250 |
| 4 | 0.820 | 0.272 |
| 5 | 0.843 | 0.281 |

The graded LLM judge **dominates the local NLI** (0.69 catch at 0.40 false).

**Tri-state end-to-end** (verified ≥ τ, else unverified, reader-abstained =
not_found):

| τ=3 | count | correct | precision |
|---|---|---|---|
| verified | 183 | 171 | **0.934** |
| unverified (flagged) | 78 | 57 | 0.731 |
| not_found (reader abstained) | 39 | — | — |

At τ=4: verified **0.949** / unverified 0.721. Gold-removed: 66 flagged (τ=3),
23 wrongly "verified".

So the tri-state gives **verified ≈ 94–95% trustworthy**, **unverified ≈ 72%
(flagged)**, and **recovers the gate's false abstentions as flagged answers**;
residual risk is the 16–23 gold-removed fabrications that land in "verified".

**Two-judge consensus** (`bench/hotpot-graded-compare.mjs`; graders
`deepseek-v4.1-flash` × `kimi-k3`):

| τ | verified (deepseek) | verified (kimi) | consensus | agreement |
|---|---|---|---|---|
| 3 | 183 (0.934) | 197 (0.944) | 167 (**0.952**) | 0.847 |
| 4 | 175 (0.949) | 194 (0.943) | 164 (**0.957**) | 0.863 |

Requiring **both** judges to agree lifts verified precision to **~0.95–0.96**.

**Tri-state on a synthesis corpus** (`private-wiki-experiment/tristate.mjs`,
private wiki v45, 23 items, reader qwen3.5:9b, gate deepseek, correctness GLM):

```
raw correct 19/23 (0.826) · binary-gated 14/23 (0.609)
tri-state: verified 13 (prec 0.923) · unverified 7 (prec 0.714) · not_found 3
```

The binary gate's cost (19→14) is **fully recovered** by the tri-state, and the
flag separates trust (verified 92% vs unverified 71%) — same shape as HotpotQA.

### RGB negative rejection (2026-10-08)

RGB (Chen et al., AAAI 2024) `en_refine`, **negative-rejection** testbed: corpus =
each instance's negative docs only; the model must reject. N=300, reader
qwen3.5:9b, **non-reader** gate deepseek-v4.1-flash (`bench/rgb.mjs reject 300`).

| arm | rejection rate |
|---|---|
| raw (reader abstains) | 0.610 (183/300) |
| **binary gate** | **0.910** (273/300) |
| tri-state as strict rejector | 0.610 (flags 90 unverified, 27 verified) |

- **The gate nearly doubles negative rejection.** RGB's own baselines (ChatGPT
  Rej* 45%, ChatGLM2-6B 41%) are far lower — but our prompt explicitly invites
  `NOT FOUND` and the reader is 9B, so **not strictly comparable**.
- Tri-state is the wrong tool for strict rejection (coverage vs rejection).
- Residual: **27/300 verified on pure noise** — the gate's false-accept.

**False-accept guard** — two-judge consensus on the stored HotpotQA outputs
(gold-removed items the gate "verifies"): **23** (deepseek) / 22 (kimi) → **14
consensus** at τ=3; 16 / 21 → **12** at τ=4 (~40% fewer), while gold-present
verified precision rises 0.934 → **0.952**. Requiring two non-reader judges to
agree is the concrete way to shrink the residual false-accept.

### RGB noise robustness (2026-10-08)

RGB `en_refine` **noise** testbed (corpus = positives + negatives; contains-answer
scoring). N=300, reader qwen3.5:9b, non-reader gate deepseek-v4.1-flash:

| arm | accuracy |
|---|---|
| raw | 0.983 (295/300) |
| binary gate | 0.910 (273/300) |
| tri-state | 0.980 (294/300) |

**The gate is a rejection↔coverage trade.** With B81 (negative rejection: raw
0.610 → binary 0.910 → tri-state 0.610), the gate **lifts rejection +0.30** but
**costs noise robustness −0.07**; the **tri-state preserves coverage** (0.980)
while giving up strict rejection. So: binary gate when rejection matters, tri-state
when coverage does.

### Three-way abstention — the dial (2026-10-08)

On the stored N=300 graded scores (`bench/hotpot-threeway.mjs`): `not_found` if
score<lo, `unverified` if lo≤score<hi, `verified` if ≥hi (consensus).

| lo | hi | gold-REMOVED: nf / unv / ver(false-accept) | gold-PRESENT: nf(false-abst) / unv / ver(prec) |
|---|---|---|---|
| 1 | 4 | 0.703 / 0.257 / 0.040 | 0.130 / 0.323 / 0.547 (0.957) |
| 2 | 4 | 0.890 / 0.070 / 0.040 | 0.337 / 0.117 / 0.547 (0.957) |
| 3 | 4 | 0.923 / 0.037 / 0.040 | 0.390 / 0.063 / 0.547 (0.957) |

- **`lo` is the abstention knob**: it trades unknown-abstention (0.70→0.92)
  against known-false-abstention (0.13→0.39); `hi` sets verified precision
  (~0.96). The **false-accept floor is ~4%** at every setting.
- **Better point than both** the binary gate (unknown 0.94 / known 0.22) and the
  tri-state (unknown 0.64 / known 0.00): **lo=1, hi=4** → abstains **70% of the
  unknown, 13% of the known**, verified 96%.
- The limit is **separability** — `score=1` mixes weakly-supported-but-correct
  with unsupported, so you can't abstain there without false abstentions.


---

## [L2281-2313] Sufficiency gate — fresh validation (parent section preamble, B95–B114)

## Sufficiency gate — fresh validation, reader/judge characterization, private corpus (2026-10-13 → 2026-10-14, B95–B114)

The arc behind the shipped `--sufficient` tri-state gate. Claims + provenance:
ledger B95–B114; script map: [`bench/README.md`](README.md).

### Fresh, frozen-config validation (B95–B101)

Config **frozen before the run** (`gate-config.json`: abstain score<2, unverified
2–4, verified ≥5; judge `kimi-k3`, window evidence, schema-constrained; reader
`qwen3.5:4b`, v45). HotpotQA dev **301–600 (never seen, N=600)**:

| metric | raw | + gate |
|---|---|---|
| unknown abstention | 70.7% | **81.7%** |
| answerable false-abstention | 4.7% | 7.7% |
| acc among shown | 89.5% | 92.4% |
| verified precision (answerable / pooled) | — | **95.6% / 90.1%** |
| false-accept | — | 15/300 |

- The gate buys **+11pp unknown abstention for +3pp answerable**, at 95.6%
  verified precision. Cost 3.16 s / 1553 tok per record.
- **Hand-audit (B96):** of the 15 "false-accepts", **11 are actually supported by
  the remaining distractor text** (removing the gold paragraphs did not make the
  item unanswerable), 2 are memorized-correct, only **2 genuinely wrong** — so the
  *measurement* inflates the headline.
- **Baselines (B97):** at matched coverage (55.3%), gate accuracy **83.5%** beats a
  top-1 retrieval-score cutoff by **+11.8pp** and a reader mean-log-prob cutoff by
  **+19.3pp** — the gate adds information beyond similarity and reader confidence.
- **Oracle (B98–B101):** the accuracy oracle was understating correctness and is
  noisy; a schema-constrained `kimi` oracle is +2pp (89.5→91.7%) but does **not**
  move the snapshot. `deepseek` does not honor `json_schema` (empty) — the
  **judges** are the only place a strict schema is an unambiguous win.


---

## [L2314-2329] Reader dependence — the gate is a crutch, not a safety layer (B102, B104, B105)

### Reader dependence — the gate is a crutch, not a safety layer (B102, B104, B105)

The same frozen gate on three readers:

| reader | unknown abstention raw → gate | gate's added abstention |
|---|---|---|
| 4B (weak, local) | 70.7% → 81.7% | **+11pp** |
| deepseek-v4.1-flash (strong, hosted) | 93.0% → 93.0% | **0** |
| 27B q4 (strong, local) | 91.0% → 91.0% | **0** |

For a strong reader the gate is **inert** (raw = gate on every axis) and even
**misses** its residual fabrications (same false-accept shape as the 4B). Its
abstention value is **reader-dependent**; its reader-independent value is the
**flag**. The whole gate (4B + **27B local** judge) runs with **no egress** at
~14 s/record (B105).


---

## [L2330-2341] Judge characterization — size and determinism (B106, B107, B110) [Kimi 9.4%]

### Judge characterization — size and determinism (B106, B107, B110)

- **Local-judge sweep** (AUROC / s·rec⁻¹ / GB): 4B 0.781/2.1/3.4 · **9B
  0.835/4.2/6.6** · 27B 0.860/16.9/17.8 · kimi 0.910/4.3/—. `gpt-oss:20b` **fails
  the schema** (127/140 nulls). The **local floor is the 9B**; the 27B buys +0.025
  for 4× the time; the hosted judge is only +0.05 over the 27B.
- **Determinism (B110):** k=3 repeats on the same 127 items — **kimi (hosted)
  flips 9.4% of gate labels** (AUROC range 0.037, 2.4% nulls); **qwen3.5:9b
  (local) never flips** (range 0.000, 0 nulls). So single-pass judge numbers carry
  a ±~0.02 band, the 27B-vs-kimi "gap" was noise, and the local judge is a
  **reliability upgrade**, not a downgrade.


---

## [L2342-2361] The partial-support blind spot (B108, B111, B113)

### The partial-support blind spot (B108, B111, B113)

Remove **one** gold hop (a 2-hop question with the other hop still present),
4B reader + kimi judge, N=100/condition:

| condition | not_found | verified | verified-acc |
|---|---|---|---|
| answerable | 2% | 88% | 98.9% |
| unanswerable | 83% | 6% | 0% |
| **partial** | **53%** | **16%** | **0%** |

The surviving hop reads as evidence, so the gate verifies a supported-but-
incomplete answer — and **every one is wrong**. Partial is strictly harder than
unanswerable (53% vs 83% not_found). On the private corpus it is **worse** (34%
verified, B113). The **hop-coverage** fix (B111: enumerate required facts, cap
the score if any is unsupported) catches it only at **27B**, costs **10pp** of
answerable coverage, and still verifies 13/16 — the judge's self-reported
"supported" is **not** a grounding check (the 9B rubber-stamps). The fix must be
**mechanical**.


---

## [L2362-2379] Reader comparison without memorization (B114) [HotpotQA inflation 10-14pp]

### Reader comparison without memorization (B114)

HotpotQA can be memorized, so the earlier reader comparison was confounded.
Re-run on the **grounded private corpus** (repo `docs/`), both readers gated with
the **same** 9B judge:

| reader | answerable raw→gated | verified-acc | false-accept | unanswerable raw→gated | partial raw→gated | partial false-accept |
|---|---|---|---|---|---|---|
| 4B (local) | 93% → 91% | 81% | 16 | **44% → 69%** | **21% → 40%** | **34** |
| deepseek (hosted) | 84% → 84% | **88%** | **9** | 96% → 96% | 59% → 63% | **18** |

So: (1) the "crutch" claim **survives memorization removal** — the gate adds a lot
for the 4B and almost nothing for deepseek; (2) deepseek is **genuinely better**
(88% vs 81% verified-acc, false-accepts 9 vs 16, partial 18 vs 34) — real reading
skill, not memory — at a coverage cost (84% vs 91%); (3) HotpotQA had inflated
**both** by **10–14pp**; (4) **both still fail partial-support** — a stronger
reader halves it but does not fix it.

