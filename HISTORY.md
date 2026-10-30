# Historical results

This file holds superseded benchmark generations. The current result is in
`README.md`; the full report is `bench/ARM-COMPARE-REPORT.md`.

## One-seed post-correction 100 (superseded by the 3-seed table)

DeepSeek DA 100 system / 98 local; Sonnet DA 96 system / 94 local; B both 94;
DeepSeek B 5 false vs Sonnet B 4. This was the pre-fix one-seed result; the
generic “give”/gate-abstained fixes and the 3 seeds supersede it.

## Pre-correction GLM-5.3-Flash 6k held-out (historical)

| Arm | Ans | Partial | Unans | Wrong | Total |
|---|---:|---:|---:|---:|---:|
| A bare | 15/40 | 4/20 | 27/40 | 44/100 | 46 |
| B status quo | 27/40 | 19/20 | 36/40 | 9/100 | 82 |
| Q quote prompt | 26/40 | 8/20 | 35/40 | 13/100 | 69 |
| D gate only | 29/40 | 14/20 | 40/40 | 8/100 | 83 |
| DA current harness | 31/40 | 17/20 | 40/40 | 6/100 | 88 |

## The OOH benchmark — historical held-out (pre-fix) and the current ranked pilot

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

> **Historical held-out record.** This B/C/D table predates the partial-rule
> fix and the current DA harness. The current post-correction result is in README.md;
> the ranked pilot below is the development fit.

D tied plain RAG on answerable accuracy, abstained correctly on 40/40
unanswerable items, and showed fewer wrong answers (2 vs 8). Its correct shown
was **84 vs B's 85**: the raw coverage gap (46/100 vs 55/100) is mostly B's
extra wrong answers. The apparent partial deficit (17/20 vs 20/20) was a
**pre-fix prompt bug** — the partial rule was never wired into the v45 prompt.
After the fix, the corrected pilot gives D **21/24 answerable, 12/12 partials,
1/60 wrong** versus B 20/24, 12/12, 4/60 (correct shown 57 vs 56). The
held-out table above is the historical pre-correction record; the current
post-correction matrix is in README.md. (A citation rerun gave D 20/24 and 3/60 wrong versus the fixed run's 21/24 and 1/60; pilot variance.) On the pre-registered citation run, the simple "quote every claim"
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

