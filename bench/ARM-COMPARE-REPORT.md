# Arm comparison — latest pilot + held-out report

The held-out section is aggregate only. Raw held-out outputs, labels, audit
sheets, and second-rater results are private. Hashes commit to the exact files
used.

## Provenance

- Run code: `2e0f500` (v1.1.8) — same K=3 window, D-gate.
- Scorer: `1d4c16c` (v1.1.11) + v2 label/scorer fixes.
- Label file v2: `c0a0a8e38de7e3be8f213892b66ad4e43db0f854605f5896975860305a6d7081`
- Held-out output: `46de107ab35c03468f6fbe16115936175950c7a70e315bced68f228f4fcea49e` (old pre-fix); current rerun output is private/gitignored
- Filled v2 audit sheet: `b11d2b5b5d7c04670c1ec2d67197a22d49d1bd35b56d4c099e3b2db8d2a7ce4a`
- Second-rater results: `9516baecb9b84e5543d4a43e334b6d03f0738e8caa250445f96690ebb0a8b47e`
- Config hash (post hoc): `0d563d0054fed50300665e43eb53e3922cd7b3a5317830c1939ef79872287b03`
- Not pre-registered; one seed; n=100. Treat intervals as descriptive.
- **2026-10-30 correction run:** working tree (commit follows); excerpt context; page and table aggregate. Private outputs: DeepSeek DA excerpt `ae0540f53611c24eb9f9c8562bc80a8a5fc7c126a547d80ab94dc338c1d49b61`; DeepSeek DA excerpt+page `5dbe92fc6aea7afb8eb9bc167540e63813df9de4a5e724d3c5b9ecbff237ccf5`; DeepSeek DA excerpt+table `253f2295d2852665648ee2a86aa0ec01a3ce0bdcc789f00c7cfffc8b92233aa1`; Sonnet DA excerpt `0f23fdb701a6bcb5a9d8ce08408cbcdebb916c0903141afb9ad2468a93876fd2`; Sonnet DA excerpt+page `80914d593652c63e9d7c5fe6108d2cdb9541690264eb130308675b3d5034d195`; Sonnet DA excerpt+table `cb197ad488d36043cc103577c5a89968622bb7cd6736bdbf81a800d092c707b5`; DeepSeek B `73d1a5270dc89fb9953493361d2bdf464335afe627b22a619e018f9084beef80`; Sonnet B `f1442e0b409e428e4b73866127389f613e5b71b39b34a7ffffe0ce652ba46d41`.

## Held-out 100 — corrected harness (2026-10-30)

DeepSeek V4.1 Flash and Sonnet 5.5, one seed, v2 labels, frozen questions.
**Page aggregate is primary; table aggregate is the control.** C dropped.
Labels hash
`c0a0a8e38de7e3be8f213892b66ad4e43db0f854605f5896975860305a6d7081`.

| Reader | Arm | Local 98 | + page agg | + table agg | False | Cost |
|---|---|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | B | 94 | — | — | 5 | **$0.11** |
| Sonnet 5.5 | B | 94 | — | — | 4 | **$1.10** |
| DeepSeek V4.1 Flash | DA | **98** | **100** | **100** | **0** | **$0.23** |
| Sonnet 5.5 | DA | 94 | **96** | **96** | 4 | **$1.80** |

The local column excludes the two global items; the aggregate columns add them
deterministically. DeepSeek DA local: 38/40 answerable, 20/20 partial, 40/40
unanswerable, 1 false. Sonnet DA local: 36/40, 19/20, 39/40, 5 false. With the
two globals: DeepSeek 40/40, 20/20, 40/40, 0 false; Sonnet 38/40, 19/20, 39/40,
4 false (`041`, `088`, `091`, `093`).

### What changed on 2026-10-30

1. **Excerpt instead of a 6k head.** The annual-openings sentences sit at
   7,380–10,555 chars. The old runner truncated them. The excerpt keeps the 6k
   head and adds tail lines for question terms missing from the head. Full 20k
   pages were an ablation: they recovered the annual openings but regressed
   `088`/`089`; the targeted excerpt avoids that.
2. **Scorer normalization.** `master’s` vs `Master's` and `5 percent` vs `5%`
   were false partial misses. The mechanical scorer now treats them as equal.
3. **Aggregate route for the two globals.** `095` and `100` are 46-candidate
   global questions; a K=3 page window cannot answer them. The existing
   `askAggregate` path now runs on the complete table or page map, with a
   completeness guard and full candidate receipt.

The six annual-opening items are fixed. The remaining Sonnet DA misses are
local (`041`, `088`, `091`, `093`); the remaining DeepSeek DA local miss is
none after the aggregate. Page and table contexts agree.

### Reader-only reading

- **DeepSeek B and Sonnet B tie at 94.** DeepSeek is ~10x cheaper; Sonnet has
  one fewer false accept. This is cost parity, not a DeepSeek reader win.
- **Sonnet DA adds no local gain over Sonnet B** (94 both); the +2 to 96 is the
  aggregate only.
- **DeepSeek DA adds 4 local rows over DeepSeek B** (94 to 98); the aggregate
  adds the last 2.
- **DeepSeek DA 100 vs Sonnet DA 96** at ~7.8x lower cost; 0 vs 4 false
  accepts. That is a DA/harness plus reader result.

### Previous held-out — pre-correction (do not compare)

GLM-5.3-Flash, one seed, old 6k/page context. This is a historical record, not
the current result:

| Arm | Ans | Partial | Unans | Wrong | Total |
|---|---:|---:|---:|---:|---:|
| A bare | 15/40 | 4/20 | 27/40 | 44/100 | 46 |
| B status quo | 27/40 | 19/20 | 36/40 | 9/100 | 82 |
| Q quote prompt | 26/40 | 8/20 | 35/40 | 13/100 | 69 |
| D gate only | 29/40 | 14/20 | 40/40 | 8/100 | 83 |
| DA current harness | 31/40 | 17/20 | 40/40 | 6/100 | 88 |

The old “DA +6 total, −3 false accepts vs B, −2 partials” reading applies only
to this pre-correction row. The 4B reversal (B 51 > DA 45) and 27B tie (54) are
pilot findings; they are not re-run here.

## Latest comparison — ranked all arms (pilot-v2)

Pilot-v2, 3 seeds, 60 rows/arm, **every arm including the local 27B**. Ranking:
total correct across answerable + partial + unanswerable, then fewer false
accepts, then citation coverage, then exactness. **`D*` is the gate-only
ablation (the earlier harness stage); `DA` is the current harness; they are one
harness, not two competitors.** The 27B is local q4.

### Quality

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

### Operations (median latency; provider-metered API cost, not TCO)

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

Legend:
- **A** bare reader, no documents, no harness, no citation prompt.
- **Q** retrieval + "quote every claim" prompt, ungated.
- **DA** quote contract + mechanical gate + absence check — the current harness.
- **D\*** gate-only, no absence check — the earlier harness stage / ablation.
- **27B** local `qwen3.8-27b:q4-km-32gbGPU`; its D\* is the local gate-only
  stage, its DA the local current harness.
- Answerable / Partial / Unanswerable are correct counts per condition.
  **Wrong shown** is a false accept (shown, not correct, not flagged); a flagged
  partial miss appears in Partial. **Shown** is shown/rows. **Citation coverage**
  is shown answers whose quotes cover every required operand/stated part
  (complete/shown). **Exact** is byte-exact quotes/quotes.
- `tok/q` includes prompt+completion; `s/q` is the median; `$/q` and `$/60` are
  provider-metered API cost. Caching moves hosted costs by ~20%; local 4B/27B is
  $0 API but not $0 hardware.
- Protocol: `bench/ooh-pilot-v2.jsonl`, 3 seeds (correlated repetitions), K=3,
  MiniCheck judge, 1,200-token cap. Public pilot, 20 items; not the held-out 100.

Reading:
- **The current harness (DA) wins the total on every reader.** 60, 59, 58, 58
  for the capable hosted readers; 54 on the local 27B; 45 on the 4B. Q is below
  DA everywhere; A is last.
- **On the 27B, DA 54 > Q 51 > D\* 48.** The D\* is the earlier stage, not a
  competitor. DA adds six answerable rows over D\* (18→24) but partials remain
  6/12; Q answers 12/12 partials but pays six false accepts and 82% coverage.
  That is the accepted tradeoff.
- **The 27B current harness matches DeepSeek Flash on answerable/unanswerable/
  wrong** (24/24, 24/24, 0/60 vs 22/24, 24/24, 1/60), but loses partials
  (6/12 vs 12/12) and speed (28.7 vs 2.4 s/q); the current-harness total is 54
  vs 58. The 27B Q is stronger than the hosted Q (51 vs 39).
- **The 4B is a trap.** DA 24/24 answerable hides 15/60 false accepts and 0/12
  partials; D\* 21/24/15/60; Q 18/24, 0 false accepts, 0/12 partials. All fail
  the contract; the 4B is a weak-reader warning.
- **Cost:** GLM-Flash DA 58 at $0.03; Sonnet DA 60 at $0.18; GLM DA 59 at
  $0.23; DeepSeek DA 58 at $0.08; 27B DA 54 at $0 and 28.7 s/q; 4B $0 but
  fails.

Provenance (gitignored): the five-reader v2 files plus
`arm-compare-qwen38-27b-qd-pilot-v2.jsonl` and
`arm-compare-qwen38-27b-da-pilot-v2.jsonl`; generated by
`node bench/arm-table.mjs`.

## Local 27B Q/D/DA probe (2026-10-29)

All three local arm rows are in the ranked table above. Three-seed Q, D and DA runs on the local `qwen3.8-27b:q4-km-32gbGPU` (17GB,
Ollama), same pilot-v2 and 1,200-token cap. This replaces the earlier one-seed
D. D is the gate-only stage, DA the current harness, Q the citation baseline.

\* local API cost 0; hardware/electricity excluded. `s/q` is the median; the `arm-compare` mean was 23.2 / 26.3 / 31.4.

- **Current harness wins the local total: DA 54 > Q 51 > D (gate-only) 48.**
  The D stage is not a competitor; it is the earlier harness. The Q beats the
  D stage on total because it answers partials (12/12 vs 6/12), but it pays six
  false accepts and 82% coverage; the D stage has zero false accepts and 100%
  coverage.
- **The DA’s gain is answerable rows, not partials.** D 18/24 → DA 24/24
  answerable, with partials unchanged at 6/12. The absence check fixes false
  absences; it does not fix the 27B’s partial handling.
- **Against DeepSeek V4.1 Flash:** current harness 54 vs 58; DA 24/24 vs 22/24
  answerable, 0/60 vs 1/60 wrong, 6/12 vs 12/12 partials, 28.7 vs 2.4 s/q, $0
  vs $0.08/60. The 27B Q is much stronger than the hosted Q (51 vs 39); the D
  stage is weaker than the hosted D (48 vs 54) on partials.
- **The second-headline claim stays narrow:** the local DA matches the hosted
  DA on answerable/unanswerable/wrong, loses partials and speed, and the
  current harness total is 54 vs 58. “17GB local Q rivals the hosted Q” is
  supported; “the local current harness matches the hosted current harness on
  total” is not.
- **Caveats:** 20 items, one corpus, correlated seeds, q4, no human rater; the
  MiniCheck support field over-refuses (Q 33%, D 10%, DA 8%) and is not the
  measure. D one-seed is retired; Q/D/DA are all 3 seeds.

Provenance (gitignored): `bench/results/arm-compare-qwen38-27b-qd-pilot-v2.jsonl`
and `arm-compare-qwen38-27b-da-pilot-v2.jsonl`.

## Label correction

Four partial labels included an unasked “annual average openings over the
decade” part: `test-022`, `test-052`, `test-055`, `test-093`. The v2 label
file removes that part. Two further flips were scorer phrasing (“do not
provide/state”); the scorer now recognizes them. After the 2026-10-30 excerpt
and aggregate correction the OOH headline is **table 100/100** and
**page 100/100** for DeepSeek DA; the old v1.1 page 99/100 (`test-030` false
abstention) is historical.

## Pre-fix / post-fix / post-audit

| Stage | A | B | C | D |
|---|---:|---:|---:|---:|
| Pre-fix false accept | 94% | 14% | 8% | 10% |
| Post-v2 false accept | 92% | 8% | 3% | 2% |
| Post-audit wrong-shown | — | **8% [4–15]** | **3% [1–8]** | **2% [1–7]** |

The audit covers every B/C/D wrong-shown row in v2: 18 unique answers,
5 scorer artifacts, 13 genuinely wrong, 0 unsure.

## Post-audit per condition

| Arm | Answerable correct | Answerable wrong | Answerable abstain | Unanswerable correct | Unanswerable wrong | Partial correct | Partial wrong | Partial abstain | Coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B RAG-cite | 27/40 | 6 | 7 | 38/40 | 2 | 20/20 | 0 | 0 | 55/100 |
| C RAG-cite + MiniCheck | 20/40 | 1 | 19 | 38/40 | 2 | 5/20 | 0 | 15 | 28/100 |
| D harness + gate | 27/40 | 1 | 12 | 40/40 | 0 | 17/20 | 1 | 2 | 46/100 |

D and B tie on answerable correct. D shows **1** wrong answer vs B's **6**.
D partial is **17/20**, not 7 wrong. C buys its 3% with the lowest coverage.

**Against B directly:** D ties answerable (27/40), shows fewer wrong answers
(2 vs 8 audited), and covers less on the shown count (46 vs 55). The apparent
partial deficit (17/20 vs B's 20/20) was a **pre-fix prompt bug**: the partial
rule was never wired into the v45 prompt. After the fix the corrected pilot is
D **21/24 answerable, 12/12 partials, 1/60 wrong** versus B 20/24, 12/12,
4/60 (correct shown 57 vs 56). The held-out D row above is the historical pre-correction record; the corrected
held-out matrix is at the top. The gate's comparative case remains
wrong-shown for fabricating readers, not a large accuracy or coverage gain.

## Paired tests

All arms answer the same 100 items. Exact McNemar on audited wrong-shown:

- B vs D: discordant 7/1, **p = 0.070**
- C vs D: discordant 3/2, **p = 1.000**
- B vs C: discordant 7/2, **p = 0.180**

No pairwise separation at 0.05.

## Coverage normalized to the reachable ceiling

The ceiling is ~52 (32 reachable answerable + 20 partials):

- D: 46/52 = **88%**
- C: 28/52 = **54%**
- B: 53/52 = **102%** — B answers one unreachable item, so its raw coverage
  includes a wrong answer.

## Cost and latency

The old frozen held-out run recorded per-answer wall time but **not** token
usage or memory. The 2026-10-30 runs record `usage`, `tokens`, `ms`, and
provider `cost` on every row; the matrix above reports those. `s/q` is the mean
in `arm-compare` output; the report’s earlier pilot uses medians.

## Correct-row sample and second rater

A local different-family model (`llama3.1:8b`) re-judged:

- 74 sampled correct rows (25 B, 24 C, 25 D): **74/74 YES**, no false-positive
  candidates found in the sample.
- The 18 wrong-shown rows: agreement with the human audit **12/18**
  (B 5/10, C 3/4, D 4/4). The model is lenient; this is a weak second check,
  not a replacement for the human audit.

## Reading the table

- **Coverage** is shown / n; **false accept** is the fraction of all rows.
  Per-condition percentages are fractions of that condition's rows.
- Intervals are Wilson 95%. D 2%, C 3%, and B 8% overlap; no separation claim.
- D vs B: answerable tied (27/40); D fewer wrong shown (2 vs 8), less shown
  coverage (46 vs 55); the partial gap (17/20 vs 20/20) was a pre-fix prompt
  bug, corrected to 12/12 vs 12/12 on the v2 pilot.
- B's pooled “correct” mixes answers and abstentions; use the per-condition
  columns.
- The 4B pilot is a weak-reader warning, not product evidence.

## Reader robustness — 2026-10-29 pilots

The held-out run above used a flash-tier reader. The claim under test — a
wrong answer shown with a real file citation is what the gate exists to stop —
is about the interface, not the model tier. So the same arms were rerun on the
**public 20-item pilot** (8 answerable / 4 partial / 8 unanswerable; the pilot's
gold is public, so these rows are fully inspectable) with two other readers.

Protocol unchanged: same prompts, same K=3 reference window, MiniCheck
(`bespoke-minicheck`) as arm C's judge, mechanical scoring, Wilson 95%.

- **Frontier (hosted):** `GLM-5.3` via the OpenCode OpenAI-compatible gateway,
  3 seeds. Seeds are repetitions at temperature 0, not independent questions.
  A/B/C answer calls use `--max-tokens 1200`: the inherited 400 cap was
  exhausted by the reader's hidden reasoning (38/60 arm-A and 4/60 arm-B
  outputs were empty at 400; 10 and 1 at 1200).
- **Mid-tier (local):** `qwen3.8-27b` (Ollama, q4), 1 seed. A 3-seed run
  exceeded 30 minutes, and the runner writes results only at the end.

### Benchmark reader — DeepSeek V4.1 Flash (pilot, 3 seeds, 60 rows/arm)

The held-out run used this reader; the same 20-item pilot protocol was rerun
for parity with the other readers (and because it is the shipped/benchmark
reader). A/B/C answer calls use `--max-tokens 1200`; MiniCheck judges arm C.

| Arm | Answerable | Unanswerable | Partial | Wrong shown | Shown |
|---|---:|---:|---:|---:|---:|
| A naive | 8/24 (33%) | 6/24 (25%) | 0/12 (0%) | 44/60 (73%) | 54/60 |
| B RAG-cite | 20/24 (83%) | 24/24 (100%) | 9/12 (75%) | 4/60 (7%) | 36/60 |
| C + entailment | 16/24 (67%) | 24/24 (100%) | 4/12 (33%) | 1/60 (2%) | 22/60 |
| D harness + gate | 18/24 (75%) | 24/24 (100%) | 7/12 (58%) | **2/60 (3%)** | 29/60 |

**Audit:**
- B's three substantive wrong rows are `pilot-06`, the RN-vs-carpenter pay
  difference: it claims the carpenters figure "is not stated" when the page
  states it — the same false-absence mode as Sonnet. Its fourth wrong row is an
  **empty output** (`pilot-05`, seed 2), a silent failure rather than a
  confident error.
- D's two wrong rows are partial-flag failures (`pilot-10`, `pilot-12`): the
  documented half is answered, the missing half is not flagged. The gate
  verifies the shown quote; it cannot reject a false absence.
- D loses `pilot-08` ×3 (a reader abstention) and two partials versus B.
  Per seed, D's wrong shown is 1/1/0 versus B's 1/1/2.

Reading: this is the same direction as the held-out 100 (D 2 versus B 8), on
the pilot: the gate halves the wrong shown (2 versus 4 of 60) at a small
coverage cost, with overlapping intervals. It also shows the benchmark
reader's own failure mode is the one the gate cannot fix (false absence on
`pilot-06`), which is why the second frontier reader below ties.

### Frontier reader (GLM-5.3, 3 seeds, 60 rows/arm)

| Arm | Answerable | Unanswerable | Partial | Wrong shown | Shown |
|---|---:|---:|---:|---:|---:|
| A naive | 9/24 (38% [21–57]) | 7/24 (29% [15–49]) | 2/12 (17% [5–45]) | 42/60 (70% [57–80]) | 53/60 |
| B RAG-cite | 21/24 (88% [69–96]) | 23/24 (96% [80–99]) | 9/12 (75% [47–91]) | 4/60 (7% [3–16]) | 37/60 |
| C + entailment | 19/24 (79% [60–91]) | 24/24 (100% [86–100]) | 1/12 (8% [1–35]) | 0/60 (0% [0–6]) | 20/60 |
| D harness + gate | 18/24 (75% [55–88]) | 24/24 (100% [86–100]) | 9/12 (75% [47–91]) | **0/60 (0% [0–6])** | 30/60 |

D was stable across seeds: 18/24 answerable and 0 wrong shown in every seed;
B's wrong shown was 2 / 1 / 1 across seeds.

**Audit of the four B wrong rows (all hand-checked):**
- `pilot-06` ×3 (answerable): reports both source numbers but not the
  requested difference ("carpenters' pay is not stated" when it is) —
  plausible, cited, wrong.
- `pilot-18` ×1 (unanswerable): **empty output**, counted as shown because an
  empty string is not an abstention. Classify empty outputs separately; they
  are silent failures, not confident errors. Substantive wrong shown: 3/60.

**D's misses:**
- The only answerable item D loses versus B is `pilot-08` ×3: the reader
  abstained ("the corpus does not state the median pay of accountants"),
  although the page does. A reader miss, not a gate rejection.
- D's single partial error (`pilot-12` ×3) answers the stated half and omits
  the missing-half flag — the partial failure mode the contract targets.

Reading: **for this frontier reader** the gate keeps its signature — 0/60
audited wrong shown (3 substantive for B), 24/24 unanswerable, partials tied —
at an answerable cost of three rows, all one unique item. The plain-RAG rate
(4/60, 7%; 3/60 substantive, 5%) was **not visibly better** than the flash
held-out rate (8/100, 8%): a stronger reader did not remove the defect. The
next reader shows that this benefit is not frontier-general.

### Frontier reader 2 — Claude Sonnet 5.5 (two replications, 3 seeds each)

The same protocol ran with `claude-sonnet-5-5` (OpenCode gateway) to test
whether the gate's benefit is reader-independent. Two replications are
archived; each is 20 items × 4 arms × 3 seeds, `--max-tokens 1200`, MiniCheck
judge.

| Arm | rep | Answerable | Unanswerable | Partial | Wrong shown | Shown |
|---|---:|---:|---:|---:|---:|---:|
| A naive | 1 | 16/24 (67%) | 9/24 (38%) | 2/12 (17%) | 30/60 (50%) | 51/60 |
| A naive | 2 | 14/24 (58%) | 9/24 (38%) | 4/12 (33%) | 28/60 (47%) | 50/60 |
| B RAG-cite | 1 | 21/24 (88%) | 24/24 (100%) | 9/12 (75%) | 3/60 (5%) | 36/60 |
| B RAG-cite | 2 | 21/24 (88%) | 24/24 (100%) | 9/12 (75%) | 3/60 (5%) | 36/60 |
| C + entailment | 1 | 17/24 (71%) | 24/24 (100%) | 1/12 (8%) | 0/60 (0%) | 20/60 |
| C + entailment | 2 | 17/24 (71%) | 24/24 (100%) | 0/12 (0%) | 0/60 (0%) | 19/60 |
| D harness + gate | 1 | 20/24 (83%) | 24/24 (100%) | 7/12 (58%) | 3/60 (5%) | 33/60 |
| D harness + gate | 2 | 20/24 (83%) | 24/24 (100%) | 8/12 (67%) | 2/60 (3%) | 33/60 |

B is stable across both replications; D moves by one or two rows. Wilson 95%
intervals overlap between B and D on every proportion.

**Audit — a different failure mode:**
- All three of B's wrong rows are `pilot-06`, the RN-vs-carpenter pay
  difference: it claims the carpenters figure "is not stated" when the page
  states it ($56,350). A false **absence**, not a fabrication.
- D's wrong rows are the same class: `pilot-06` (2 rows across the two
  replications) plus partial answers that state the documented half but do not
  flag the missing half (`pilot-10`, `pilot-11`). The gate verifies the quote
  that is shown; it cannot falsify a claim that something is *absent* — there
  is no string to search for.
- D loses one answerable row versus B (`pilot-08`, a reader abstention) and
  1–2 partial rows. No empty outputs at the 1200-token budget.

Reading: for Sonnet 5.5 the gate **ties** plain RAG (2–3 versus 3 wrong rows of
60; overlapping intervals) and costs a little coverage. The GLM result does
not generalize to this reader because the failure modes differ: GLM's
confident fabrications are the gate's class; Sonnet's cautious false absences
are not. The gate's comparative benefit is **reader- and failure-mode
dependent**; the mechanical check itself is not. The held-out 100 with a
frontier reader remains the open measurement.

### Local mid-tier reader (qwen3.8-27b, 1 seed, 20 rows/arm)

| Arm | Answerable | Unanswerable | Partial | Wrong shown | Shown |
|---|---:|---:|---:|---:|---:|
| A naive | 1/8 (13% [2–47]) | 7/8 (88% [53–98]) | 0/4 (0% [0–49]) | 3/20 (15% [5–36]) | 4/20 |
| B RAG-cite | 6/8 (75% [41–93]) | 8/8 (100% [68–100]) | 3/4 (75% [30–95]) | 1/20 (5% [1–24]) | 11/20 |
| C + entailment | 6/8 (75% [41–93]) | 8/8 (100% [68–100]) | 1/4 (25% [5–70]) | 0/20 (0% [0–16]) | 8/20 |
| D harness + gate | 7/8 (88% [53–98]) | 8/8 (100% [68–100]) | 0/4 (0% [0–49]) | 1/20 (5% [1–24]) | 8/20 |

**Audit:** D does **not** beat B here on wrong shown (1 versus 1). D's partial
collapse (0/4 versus B's 3/4) is **contract compliance, not gate rejection**:
on `pilot-09/10/11` the reader abstained on the whole question instead of
answering the documented half and flagging the missing part. D's one wrong row
(`pilot-12`) is the same partial failure: stated half answered, missing half
unflagged.

Reading: with a mid-tier local reader the gate's benefit disappears and its
partial cost appears. That is the "the contract needs a reader that follows
it" caveat, measured rather than assumed.

### Cost and time

- Benchmark reader (DeepSeek V4.1 Flash): **$0.24** for 240 rows; ~10.5
  minutes — the cheapest hosted reader tested. Per arm: A $0.04, B $0.05,
  C $0.05, D $0.10; tokens/q: A 621, B 2,308, C 2,304, D 3,191.
- Frontier (GLM-5.3): **$0.42** of gateway usage for 240 rows; 20 minutes.
  The arm passes a fixed docs window, so no vet runs in any arm; the D/B gap
  is the quote-contract prompt/output, not verification.
- Frontier (Sonnet 5.5): **$0.51 per replication** for 240 rows; ~9.5 minutes
  each. Per arm: A $0.16, B $0.10, C $0.10, D $0.14; tokens/q: A 318,
  B 3,410, C 3,410, D 4,035. D's premium is the quote contract, not the gate.
- Per 1,000 questions (pilot dollars/q): Benchmark reader D $1.60 vs B $0.90;
  Sonnet D $2.30 vs B $1.70. Verification itself is a string comparison;
  the cost is the contract.
- Local: **$0**; 19 minutes (27B q4 on this machine).

### Provenance and limits

- `bench/results/arm-compare-frontier-glm53-pilot-1200.jsonl`
  sha256 `4cef35c2cafc58723589f0d4451bbc4a4b2abb3007520f292489178fb518d244`
- `bench/results/arm-compare-qwen38-27b-pilot-2026-10-29.jsonl`
  sha256 `8de68f98038a88b12fd8c8f024b19dcae1f54f52b46de698469d8b481313fdfc`
- `bench/results/arm-compare-deepseek-v41-flash-pilot.jsonl`
  sha256 `5cfc25edf03066887dd00d4dabc284baf73225a9c483a854f73e3ec54f89d6c4`
- `bench/results/arm-compare-sonnet55-pilot.jsonl`
  sha256 `eef5ba92f774731ecd2ef2972db281507321d3cf4b9505d0717702d269b2afc0`
- `bench/results/arm-compare-sonnet55-pilot-rep2.jsonl`
  sha256 `a07170b28352b27c76375bae9d2955fbb7c0f689548f1c08669cd5798fd4f0f1`
  (all gitignored; the aggregates and audits above are the published record)
- Commands:
  `node bench/arm-compare.mjs --questions bench/ooh-pilot.jsonl --corpus bench/corpus/ooh-v1 --base-url https://opencode.ai/inference/openai/v1 --model glm-5.3 --api-key-env OPENCODE_API_KEY --judge-model bespoke-minicheck --judge-base-url http://localhost:11434/v1 --seeds 3 --max-tokens 1200`
  the same with `--model deepseek-v4.1-flash` (benchmark reader),
  `--model claude-sonnet-5-5` (two replications), and with
  `--base-url http://localhost:11434/v1 --model oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU --seeds 1`.
- Limits: **20 unique items**; the frontier seeds are correlated repetitions
  (do not read n=60 as 60 independent questions); the two Sonnet replications
  are independent runs but share the same 20 items; public pilot, not the
  held-out 100; one corpus; no human second rater on these rows; the local arm
  is one seed. A robustness smoke check, not a separation claim.


## Partial-rule fix and corrected pilot labels (2026-10-29)

**Bug.** `arm-compare` passed `partialRule: true`, but no kit code consumed it.
The v45/source prompts had no partial rule, while B's prompt did — and the
"silence is not a negative" line discouraged flagging a missing half. The
partial comparison above was therefore confounded.

**Fix.** The partial rule is now the default in every answer prompt:

> If the question has multiple parts and only some are stated: answer every
> stated part, and explicitly say which parts are not stated. This is not an
> absence inference — the missing part is a fact the documents do not provide.
> If none of the parts are stated, answer NOT FOUND.

The dead `partialRule` option is removed.

**Label correction.** `pilot-12`'s gold demanded an unasked "annual average
openings" part — the same defect corrected in four held-out labels in v2.
`bench/ooh-pilot-v2.jsonl` removes it; the original is untouched. The model
never sees the gold, so the same outputs were scored under both labels.

**Results (Flash, 3 seeds, 60 rows/arm):**

| Run | Arm | Answerable | Partial | Wrong shown | Correct shown |
|---|---|---:|---:|---:|---:|
| Fixed prompt, v2 labels | B | 20/24 | 12/12 | 4/60 | 56 |
| Fixed prompt, v2 labels | D | **21/24** | **12/12** | **1/60** | **57** |
| Old prompt, v2 labels | D | 18/24 | 9/12 | 2/60 | 51 |
| Fixed prompt, original labels | B | 20/24 | 9/12 | 4/60 | 53 |
| Fixed prompt, original labels | D | 21/24 | 9/12 | 1/60 | 54 |

- The partial gap was the prompt: D **9/12 → 12/12**; answerable 18→21.
- `pilot-12`'s label accounts for three partial rows and three correct rows for
  both arms.
- On this pilot D now has a small edge: +1 answerable, 1 versus 4 wrong shown,
  correct shown 57 versus 56 — at $0.07 versus $0.05 per 60 rows and 2,941
  versus 2,297 tokens/q.
- **The held-out 100 is now re-run.** The old D row (27/40 answerable, 17/20
  partials, 2/100 wrong) is the historical pre-correction measurement; the
  corrected held-out matrix is at the top. Do not read the fixed pilot's 12/12
  partials as if they were the old held-out D result.

Provenance: `bench/ooh-pilot-v2.jsonl` sha256
`4d96b124253dd34c9f49f483cc7ac4129de8463abb20b96cb7a90462e3f103fd`;
`bench/results/arm-compare-flash-pilot-v2.jsonl` sha256
`e0587c8cf840aceec9089e583b1ab64f1e9891334d439b9fb83a6df96291c5d8`
(both gitignored).

## Answer vs citation — pre-registered citation metrics (2026-10-29)

The pre-registration is in `bench/ARM-COMPARE.md` (thresholds fixed before the
run). B and C are reused from the v2 pilot (no quotes; answer behaviour
unchanged); Q (new) and D (rerun) are the same run. Flash, 3 seeds.

| Arm | Answerable | Partial | Wrong shown | Correct shown | Quotes raw/shown | Exact | Misattr | Coverage | Support (manual) | Absence true/total |
|---|---:|---:|---:|---:|---|---:|---:|---:|---|---:|
| B (reuse) | 20/24 | 12/12 | 4/60 | 56 | 0 | — | — | — | — | — |
| Q (shown) | 13/24 | 2/12 | 6/60 | 39 | 42 / 15 | 95.2% / 100% | 2 / 0 | 14/21 (66.7%) | **13/13** | 1/1 |
| D raw | 20/24 | 12/12 | 3/60 | 56 | 45 | 100% | 0 | — | — | — |
| D shown | 20/24 | 12/12 | 3/60 | 56 | 45 | 100% | 0 | 30/35 (85.7%) | **36/36** | 12/17 |

B carries no quotes at all; it names a `.md` file in 41/60 rows and names no
file in 19/60.

**Joint view (shown, mechanical answer score):**

| Arm | correct+valid | correct+none | wrong+valid | wrong+none | abstain |
|---|---:|---:|---:|---:|---:|
| Q | 14 | 1 | 0 | 6 | 39 |
| D | 32 | 0 | **3** | 0 | 25 |

**Pre-registered decision.** Q **FAILS**: shown exactness is 100%, but coverage
is 66.7% < 90%. (The pre-registered MiniCheck support, 6/13, also failed; the
manual audit below supersedes it and finds 13/13 supported. Coverage is
decisive either way.) D **PASSES** its rule (shown validity 100%, wrong+invalid
0), with the caveats below.

**What the numbers say:** The D rerun is 20/24 answerable and 3/60 wrong
versus the fixed run's 21/24 and 1/60; the pilot is noisy.
- **The quotes are not the problem.** Every positive/computed claim in a quoted
  shown answer is supported by its quote: Q 13/13, D 36/36. The raw quotes are
  95.2% (Q) / 100% (D) exact. The simple prompt does not fabricate much.
- **Q fails on coverage, not support.** Only 14/21 shown answers quote every
  required operand; 7 shown answers carry no quote at all (6 wrong, 1 correct).
  "Quote every claim" did not produce a quote for every claim.
- **D fails on absence, not presence.** All 35 shown answers carry exact
  quotes. Five absence claims are **false**: 3 × `pilot-06` (the carpenters
  pay is in the corpus) and 2 × `pilot-08` (the accountants pay is in the
  corpus). The mechanical scorer marks the `pilot-08` answers correct because
  they name the winning occupation and its pay while also saying the highest
  cannot be determined; the manual audit catches the contradiction. The
  wrong+valid cell is therefore a **lower bound** (3 by the scorer, 5 by the
  absence audit).
- **Answer and citation are separate.** D has valid quotes on every shown
  answer, but still gives 3–5 wrong answers; Q has exact, supported quotes on
  the answers it cites, but leaves 7 answers unverifiable. B has no quotes.
- **Judge caveat.** The pre-registered MiniCheck support was too strict (it
  rejected an obvious entailment; the same over-refusal as C). The support
  measure here is a **manual claim-level audit by the assistant**, recorded in
  `bench/audits/citation-support-2026-10-29.json`. It is an AI adjudication,
  not an independent human rater. The 9B sensitivity is withdrawn.

**Cost:** Q $0.08 and D $0.07 per 60 rows; 2,677 / 2,971 tokens/q; 4:55
wall clock.

Provenance: `bench/results/arm-compare-flash-citation-pilot-v2.jsonl` sha256
`96276460ca08791d5e4c995531307258e72a6e759cea5006e86488f02c943e53`
(gitignored); audit `bench/audits/citation-support-2026-10-29.json` sha256
`6179de8d5b28a0792a705590327222b9e4fd292743dc430c450e9e53e236c7d0`. Command:
the pilot-v2 command with `--arms Q,D --out
bench/results/arm-compare-flash-citation-pilot-v2.jsonl`.

## Sonnet replication — same citation metrics (2026-10-29)

Not pre-registered for Sonnet; the same thresholds are applied descriptively.
This is the reader-dependence test for the simple-prompt claim.

| Arm | Answerable | Partial | Unanswerable | Wrong shown | Correct shown | Quotes | Exact | Coverage | Support (manual) | Absence true/total |
|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|
| Q | 21/24 | 12/12 | 24/24 | 1/60 | 33 | 55 | 100% | 30/34 (88.2%) | **45/45** | 16/20 |
| D | 21/24 | 12/12 | 24/24 | **0/60** | 33 | 76 | 100% | 30/33 (90.9%) | **62/69** | 19/24 |

**Joint (shown):** Q 33 correct+valid, 1 wrong+valid (`pilot-06`), 26
abstain. D 33 correct+valid, 0 wrong, 27 abstain. The gate's edge is exactly
the one `pilot-06` row Q answers wrong and D abstains on.

**What this says:**
- The simple prompt is **much stronger on Sonnet**: 88.2% coverage, 100%
  exact quotes, 45/45 positive claims supported. It misses the 90% bar by
  1.8 points, not the 23-point miss seen on Flash (66.7%). The claim "a simple
  prompt does not work" is **reader-dependent in magnitude**, not universal.
- D still covers one fewer shown answer (33 versus 34) but has zero wrong
  shown; coverage 90.9% and 62/69 positive claims supported. The 7 support
  gaps are **extra details not in the shown quotes** (apprenticeship claims;
  the 779,800 base), not the core values. The gate verifies the quote, not
  every extra claim.
- Both still fail the **absence** class: 4 false absences for Q
  (`pilot-06` + `pilot-08`), 5 for D (`pilot-08`; the scorer marks those
  correct because the answer names the winner and pay while saying the
  highest cannot be determined). The DA prototype is the target, not a
  stronger quote prompt.
- Q has 4 rows with unquoted side details (923,100, 11%) inside true absence
  sentences; D's 7 extra-detail claims are the Sonnet-specific support gap.
- The manual audit is in `bench/audits/citation-support-sonnet-2026-10-29.json`
  (assistant adjudication, not human). The pre-registered MiniCheck support
  over-refused and is not used.

**Cost:** Q $0.27 and D $0.32 per 60 rows; 3,529 / 4,137 tokens/q; 4:21.

Provenance: `bench/results/arm-compare-sonnet55-citation-pilot-v2.jsonl`
sha256 `6f32b878e7d7c266c56557d63b6c5d654c4c2bd017f6531598b5023ba4b4dcae`;
audit
`bench/audits/citation-support-sonnet-2026-10-29.json` sha256
`8c5abbc716962a1731b6ae9270b3af271ef89ad4d3ce27483b8a7111a6a0c5e7`.
Command: the pilot-v2 command with `--model claude-sonnet-5-5 --arms Q,D
--out bench/results/arm-compare-sonnet55-citation-pilot-v2.jsonl`.

### D-absence on Sonnet — the strongest Sonnet arm (historical detail)

> **Current view: § Latest comparison.** The current harness is DA; D* is the
> gate-only stage. This section is the detailed Sonnet record, not the ranking.


The first Sonnet DA run (before the trigger widening) reached 24/24 answerable
but left two `pilot-08` false absences (coverage 34/36): D's wording "only two
have pay figures / no pay for accountants" did not match the trigger. After
widening the trigger (post-hoc, disclosed), the rerun:

| Arm | Answerable | Partial | Unanswerable | Wrong | Quotes | Exact | Coverage | Positive support | Absences true |
|---|---:|---:|---:|---:|---|---:|---:|---|---:|
| D | 21/24 | 12/12 | 24/24 | 0/60 | 74 | 100% | 30/33 (90.9%) | 62/69 | 19/24 |
| DA | **24/24** | 12/12 | 24/24 | **0/60** | 81 | **81/81 (100%)** | **36/36 (100%)** | 77/83 (92.8%) | **21/21** |

- DA fixed `pilot-06` ×3 (RN–carpenter difference, 29,720) and `pilot-08` ×3
  (all three pays, ranking); coverage is complete on every shown row.
- **The exact-quote audit is 81/81 (100%).** An earlier 75/81 came from the
  model's raw quote indices after `rehomeLegs`; the assembled citations are
  byte-exact. The gate now checks each structured leg, and the string fallback
  no longer borrows fragments; no row changes. This is not a support judgment.
- The 6 support gaps are **extra details not in the shown quotes**
  (apprenticeship, 779,800/11%, writers context); the core values are
  supported. No false absences remain in this arm.
- DA is the **best arm on Sonnet** by answerable, coverage, citation validity
  and absence: it answers three more answerable rows than D with zero wrong.
- Caveats: on Flash the DA prototype was 23/24 with one false accept; it
  triggers on every unanswerable/partial (many no-op re-reads), costs
  4,805 tok/q and 2.1 s/q median (2.9 mean) versus D's 4,135 and 2.2, and the
  trigger widening was post-hoc. Not pre-registered; still a prototype.

Audit: `bench/audits/citation-support-sonnet-da-2026-10-29.json`
sha256 `50507aefbb61e0bfeb943ab49a19c64a2f6609d8a1fa2fddf6682b8a45c9918e`.
The simple prompt (Q) remains far behind on
Sonnet: 21/24, 1 wrong, 88.2% coverage.

## Reader capability progression — history (2026-10-29)

> **Current view: § Latest comparison.** The ranked all-arms table (including
> the 27B and 4B) supersedes this D-vs-DA progression; D* is the earlier stage.


DA = the gate + the absence check (decompose the question, search the full
corpus, re-read with any counter-document). Same pilot-v2, 3 seeds, 1200-token
budget, MiniCheck for the automated support field. The absence trigger was
widened after the first Sonnet DA run (post-hoc, disclosed below).

| Reader | Arm | Answerable | Partial | Unanswerable | Wrong shown | Quotes exact | Coverage | tok/q | $/60 rows |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **4B** qwen3.5 | D | 21/24 | 3/12 | 21/24 | 15/60 | 100% | 67% | 2,730 | $0 |
| **4B** qwen3.5 | DA | 24/24 | **0/12** | 21/24 | 15/60 | 100% | 75% | 3,284 | $0 |
| **Flash** DeepSeek V4.1 | D | 18/24 | 12/12 | 24/24 | **0/60** | 100% | 100% | 2,990 | $0.07 |
| **Flash** DeepSeek V4.1 | DA | 22/24 | 12/12 | 24/24 | 1/60 | 100% | 94% | 3,316 | $0.08 |
| **GLM-5.3** | D | 21/24 | 10/12 | 24/24 | 3/60 | 100% | 83% | 3,260 | $0.29 |
| **GLM-5.3** | DA | **24/24** | 11/12 | 24/24 | **0/60** | 100% | **100%** | 3,514 | $0.23 |
| **Sonnet 5.5** | D | 21/24 | 12/12 | 24/24 | 0/60 | 100% | 91% | 4,135 | $0.15 |
| **Sonnet 5.5** | DA | **24/24** | **12/12** | 24/24 | **0/60** | **100%** | **100%** | 4,805 | $0.18 |

**Reading the progression:**
- **4B is below the contract threshold.** DA fixes `pilot-06` but collapses
  partials (3/12 → 0/12) and leaves 15/60 false accepts (`pilot-09..12`
  partials, `pilot-13` unanswerable). The absence check cannot rescue a reader
  that does not follow the contract.
- **Flash is mixed.** DA gains four answerable rows (18→22) but introduces one
  false accept (`pilot-06` seed 0); D remains the zero-FA option. The trigger
  fired on 15 rows; the regression is reader-specific.
- **GLM-5.3 is clean.** DA: 24/24 answerable, 0/60 wrong, 100% coverage,
  11/12 partials (one `pilot-10` seed-2 miss). It fixes `pilot-06` and
  `pilot-08` across seeds.
- **Sonnet 5.5 answers completely.** DA: 24/24, 12/12, 24/24, 0/60 wrong,
  100% coverage, 81/81 exact quotes (the earlier 75/81 was a raw-index
  reporting artifact; the assembled citations are exact), 77/83 positive
  support, 21/21 absence claims true. It is the best arm we have on this
  pilot.
- **The value of the absence check scales with reader capability.** At the top
  (GLM/Sonnet) it is the best arm; at Flash it is mixed; at 4B it fails. The
  simple prompt Q shows the same reader dependence (Flash 66.7% coverage,
  Sonnet 88.2%).

**Caveats:** DA triggers on every unanswerable/partial (many no-op re-reads),
costs more time/tokens, and is not pre-registered; the trigger widening was
post-hoc. Manual support audits exist for Sonnet DA (and Q/D); the Flash, GLM
and 4B support numbers are the automated strict lower bound, not the measure.
The corrected held-out 100 is at the top; the old pre-correction row is historical.

Provenance (gitignored): `bench/results/arm-compare-flash-absence2-pilot-v2.jsonl`,
`arm-compare-glm53-absence-pilot-v2.jsonl`,
`arm-compare-qwen35-4b-absence-pilot-v2.jsonl`,
`arm-compare-sonnet55-absence2-pilot-v2.jsonl`. Commands: the pilot-v2 command
with `--arms D,DA` per reader; 4B uses the local Ollama base URL and
`qwen3.5:4b`.

## Appendix — all arms (historical, 2026-10-29)

`orig` = original pilot labels, before the partial-rule fix (A–D; DeepSeek/4B/27B
one seed, GLM/Sonnet three). `v2` = corrected pilot labels + partial rule
(Q/D/DA; three seeds). Held-out is the pre-fix 100-item run. Counts are per
condition; `Wrong` includes all conditions; `Shown` is shown/rows. The Flash
v2 D is 18–20/24 across two runs; the table uses the matched D/DA absence run.
On the held-out 100, arm A has 92/100 false accepts; per-condition A was not
recorded.

| Study | Reader | Arm | Answerable | Partial | Unanswerable | Wrong | Shown |
|---|---|---|---:|---:|---:|---:|---:|
| Held-out 100 | DeepSeek Flash | B | 27/40 | 20/20 | 38/40 | 8/100 | 55/100 |
| Held-out 100 | DeepSeek Flash | C | 20/40 | 5/20 | 38/40 | 3/100 | 28/100 |
| Held-out 100 | DeepSeek Flash | D | 27/40 | 17/20 | 40/40 | 2/100 | 46/100 |
| Pilot-20 orig | DeepSeek V4.1 Flash | A | 1/8 | 0/4 | 1/8 | 18/20 | 19/20 |
| Pilot-20 orig | DeepSeek V4.1 Flash | B | 4/8 | 3/4 | 8/8 | 4/20 | 12/20 |
| Pilot-20 orig | DeepSeek V4.1 Flash | C | 3/8 | 1/4 | 8/8 | 2/20 | 6/20 |
| Pilot-20 orig | DeepSeek V4.1 Flash | D | 5/8 | 1/4 | 8/8 | 3/20 | 9/20 |
| Pilot-20 orig | 4B qwen3.5 | A | 0/8 | 0/4 | 6/8 | 10/20 | 11/20 |
| Pilot-20 orig | 4B qwen3.5 | B | 5/8 | 3/4 | 8/8 | 0/20 | 9/20 |
| Pilot-20 orig | 4B qwen3.5 | C | 4/8 | 0/4 | 8/8 | 0/20 | 4/20 |
| Pilot-20 orig | 4B qwen3.5 | D | 6/8 | 0/4 | 6/8 | 8/20 | 14/20 |
| Pilot-20 orig | 27B qwen3.8 | A | 1/8 | 0/4 | 7/8 | 3/20 | 4/20 |
| Pilot-20 orig | 27B qwen3.8 | B | 6/8 | 3/4 | 8/8 | 1/20 | 11/20 |
| Pilot-20 orig | 27B qwen3.8 | C | 6/8 | 1/4 | 8/8 | 0/20 | 8/20 |
| Pilot-20 orig | 27B qwen3.8 | D | 7/8 | 0/4 | 8/8 | 1/20 | 8/20 |
| Pilot-20 orig | GLM-5.3 | A | 9/24 | 2/12 | 7/24 | 42/60 | 53/60 |
| Pilot-20 orig | GLM-5.3 | B | 21/24 | 9/12 | 23/24 | 4/60 | 37/60 |
| Pilot-20 orig | GLM-5.3 | C | 19/24 | 1/12 | 24/24 | 0/60 | 20/60 |
| Pilot-20 orig | GLM-5.3 | D | 18/24 | 9/12 | 24/24 | 0/60 | 30/60 |
| Pilot-20 orig | Sonnet 5.5 r1 | A | 16/24 | 2/12 | 9/24 | 30/60 | 51/60 |
| Pilot-20 orig | Sonnet 5.5 r1 | B | 21/24 | 9/12 | 24/24 | 3/60 | 36/60 |
| Pilot-20 orig | Sonnet 5.5 r1 | C | 17/24 | 1/12 | 24/24 | 0/60 | 20/60 |
| Pilot-20 orig | Sonnet 5.5 r1 | D | 20/24 | 7/12 | 24/24 | 3/60 | 33/60 |
| Pilot-v2 | DeepSeek Flash | B | 20/24 | 12/12 | 24/24 | 4/60 | 36/60 |
| Pilot-v2 | DeepSeek Flash | C | 13/24 | 5/12 | 24/24 | 3/60 | 21/60 |
| Pilot-v2 | DeepSeek Flash | Q | 13/24 | 2/12 | 24/24 | 6/60 | 21/60 |
| Pilot-v2 | DeepSeek Flash | D | 18/24 | 12/12 | 24/24 | 0/60 | 30/60 |
| Pilot-v2 | DeepSeek Flash | DA | 22/24 | 12/12 | 24/24 | 1/60 | 35/60 |
| Pilot-v2 | GLM-5.3 | D | 21/24 | 10/12 | 24/24 | 3/60 | 36/60 |
| Pilot-v2 | GLM-5.3 | DA | 24/24 | 11/12 | 24/24 | 0/60 | 36/60 |
| Pilot-v2 | GLM-5.3-Flash | D | 21/24 | 12/12 | 24/24 | 1/60 | 34/60 |
| Pilot-v2 | GLM-5.3-Flash | DA | 22/24 | 12/12 | 24/24 | 1/60 | 35/60 |
| Pilot-v2 | Sonnet 5.5 | Q | 21/24 | 12/12 | 24/24 | 1/60 | 34/60 |
| Pilot-v2 | Sonnet 5.5 | D | 21/24 | 12/12 | 24/24 | 0/60 | 33/60 |
| Pilot-v2 | Sonnet 5.5 | DA | 24/24 | 12/12 | 24/24 | 0/60 | 36/60 |
| Pilot-v2 | 4B qwen3.5 | D | 21/24 | 3/12 | 21/24 | 15/60 | 39/60 |
| Pilot-v2 | 4B qwen3.5 | DA | 24/24 | 0/12 | 21/24 | 15/60 | 39/60 |

### What we can claim

1. **The receipt is real.** Every shown D/DA row carries quotes that exist in
   the cited file (gate: 100% of shown rows). Direct exact-in-file checks are
   93–100%; Sonnet DA is 81/81. The gate now verifies each structured citation
   leg; the string fallback no longer borrows a fragment across legs. The
   default matcher is tolerant; `--strict` is the literal mode.
2. **DA is the best configuration on capable readers.** GLM-5.3 full and
   Sonnet 5.5: 24/24 answerable, 12/12 (Sonnet) or 11/12 (GLM) partials,
   24/24 unanswerable, 0/60 wrong, 100% coverage. Sonnet DA: 81/81 exact,
   77/83 positive claims supported, 21/21 absences true.
3. **GLM-5.3-Flash D/DA is strong but not equal.** 22/24 answerable, 12/12
   partials, 1/60 wrong, 97% coverage, at roughly one-seventh the cost of full
   GLM. Its Q is the worst of the five (19/24, 6/12, 15/24 unanswerable, 20/60
   wrong, 53% coverage); the harness, not the label, stabilizes it.
4. **The gate cuts wrong-shown for fabricating readers** (historical 6k held-out:
   B 9/100, Q 13/100, D 8/100, DA 6/100), but does not fix false absences or
   wrong answers that carry a valid quote. DA addresses some false absences; it
   is mixed on Flash and fails on the 4B (pilot B 51 > DA 45).
5. **The simple quote prompt is reader-dependent.** Q is 95–100% exact and
   positive-claim support is high, but it covers only 66.7% (Flash) / 88.2%
   (Sonnet) / 53% (GLM-Flash) of required evidence and leaves answers unquoted.
   "A simple prompt does not work" is not a universal claim; it can fail badly
   even on a capable reader.
6. **Reader capability is the determinant, not the "Flash" label.** The 4B is
   below the contract threshold (15/60 wrong, partials 0/12); the 27B has
   partial issues; DeepSeek V4.1 Flash (763B MoE), GLM-5.3-Flash (320B/18B
   active), GLM-5.3 (744B/40B active) and Sonnet work. "Flash" is a cost tier.
7. **Answer accuracy and citation quality are separate.** The gate does not
   improve answer accuracy; DA improves answerable/coverage on capable readers.
   The support audit is AI/manual, not a human rater.
8. **Local deployment.** The default reader is GLM-5.3-Flash. GLM-5.3-Flash: ~100GB (1-bit), 128–150GB (3-bit),
   162–210GB (4-bit) — a 128–256GB unified-memory server/workstation at 3–4
   bit; not a 24/48GB GPU. GLM-5.3 full: 223GB (1-bit) to 810GB (8-bit) —
   server-class. DeepSeek V4.1 Flash: 763B total, ~510GB checkpoint, 614GB
   VRAM minimum (8×H200/GB200) — heavier than GLM-Flash. The local 27B q4 DA
   probe (24/24 answerable, 6/12 partials, 0/60 wrong, 28.7 s/q) matches
   DeepSeek Flash DA on answerable/unanswerable/wrong but loses partials and
   speed; its D baseline is one seed, so it is a probe, not a headline. The
   default reader is GLM-5.3-Flash; the default harness is DA (quote + gate +
   absence); `--source` and `--no-absence` are the opt-outs.

### What we cannot claim

- A universal best arm; DA on 4B/Flash; a simple prompt universally failing;
  accuracy SOTA/leader; the post-fix held-out; local quantized equivalence;
  statistical separation (p=0.070 held-out; pilots n=20, correlated seeds);
  a human second rater; generalisation beyond one corpus; 27B/hosted parity
  (the local probe has no matched 3-seed D). (The earlier Sonnet DA 75/81 was
  a raw-index reporting artifact; the assembled citations are 81/81.)

## Default, article, and ask

The shipped default is the current harness **DA** (quote + gate + absence); the
default reader is **GLM-5.3-Flash** (OpenCode gateway; `OPENCODE_API_KEY`), with
`qwen3.5:4b` as the zero-config local demo and `qwen3.8-27b` q4 as the best
local. `--source` and `--no-absence` are the opt-outs. The ranked pilot is the
best consolidation until the held-out 100 is re-run; the held-out labels are
private. The governance/CTO article and the CTO/mid-management email ask for
the funded experiment, a consultancy pilot, and allocated working time; the
trial has a kill rule. See `drafts/receipts-not-confidence.md` and
`drafts/email-cto-quotes-not-accuracy.md` (gitignored).
