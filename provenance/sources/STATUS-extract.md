# STATUS.md — evidence extract

Migrated 2026-11-09 from the private origin repository's `bench/STATUS.md` (line ranges as of extraction).
Verbatim section extracts backing the claims in PROVENANCE.md, with the private corpus's name redacted to “private wiki”.

---

## [L249-321] 9.1 What was tried, and what it proved [contract-only control table]

### 9.1 What was tried, and what it proved

- **Prometheus 2 as local judge: rejected.** Official Ollama library 404s;
  `ggozad/prometheus2` (7B Q4) probe on 5 real cases: 2 false accepts + 1 false
  rejection. JudgeBench (paper) puts Prometheus2-7b at 34.9% overall.
- **Local judge market (2026):** gpt-oss-120b is the strongest open judge
  (JudgeBench κ 0.687 > GPT-5.4 0.606 > GPT-4.1 0.487); CompassJudger-2-7B
  leads dedicated judges but is not on Ollama; Selene-1-Mini (4.9 GB, Llama
  base) is the best pullable 8B specialist. 8B *generalists* fail as judges
  (Qwen3-8B κ 0.289, worst position bias).
- **gpt-oss:20b as judge: rejected** (10 rows): 1 false accept on p57 — the
  row its own 5-case probe had predicted; reasoning latency 2.4–7.3 s/grade.
- **Oracle switch: validated.** `qwen3.8-flash` agreed with the deepseek
  oracle on 7/7 real triples (incl. the p86 negative) and produced **0 nulls
  across ~250 calls**; it is the oracle for every run below.
- **Selene as judge, 43 rows, both readers:** 4B arm 22 verified / 16 correct /
  **6 false accepts** (p11, p26, p40, p80, p81, p91); hosted arm 33 verified /
  32 correct / 9 abstains / 0 nulls. Row-level diff: all 6 false accepts are
  `fallback=single-pass` drafts (zero through repairs) — selene rejected
  14–27 candidates/row mid-pipeline (stricter than kimi), which *pushed* rows
  onto the fallback, then graded confident-wrong drafts 5. The fallback branch
  computes `unanchored` numbers and ignores them.
- **`GATE_HI` knob** (default 5; nothing changes unless set). Hosted+selene @
  GATE_HI=4: **42 answered / 38 oracle-correct / 4 flagged / 1 abstain**; the 7
  flip drafts came back 7/7 correct. The 4 flagged: p86 (gold ambiguity), p28
  (oracle-noise specimen — the answer is right, hand-checked), p82/p97
  (cross-run reader variance).
- **Deduction-aware grade prompt: rejected** (A/B on 12 identical triples):
  caught 2/6 wrong-math drafts, left 4/6 at 5, downgraded a correct answer
  (p44 5→4) and misgraded another (p57 4→1). A 7B checker does not re-derive
  on command.
- **Bare/naive baselines on the 43 (oracle-labeled):** bare 4B **2/43** (0
  abstains — confident hallucination), bare hosted **1/26** shown (17 honest
  NOT FOUND), naive 4B **21/42** shown, naive hosted **37/38** shown.
- **300-row scale (100 questions × 3 conditions; deepseek reader + selene @
  hi=4 + qwen oracle + event-first):** answerable 92/94 shown-correct,
  partial 43 abstain / 57 shipped-verified, unanswerable 87 abstain / 13
  shipped-verified → composite **222/300**; naive RAG on the same 300:
  94 + 64 + 95 → composite **253/300** at 2.9k tok/q · 4.0 s/q (vs the
  harness's 12.8k · 27.4 s/q).
- **The unanswerable construction is 98% sound.** A probe over all 100
  unanswerable rows (one honest answer-attempt per distractors-only window,
  oracle-labeled) disqualified **2** (p29, p38 — answerable from distractors);
  the readers independently exploited **4** (p26, p29, p38, p96). The 15
  unanswerable answers are **half-answers, not hallucinations**: 4 right (the
  fact was in the window), 11 with one half right and the other half honestly
  declared missing (p5, p8, p16, p19, p21, p22, p36, p42, p43, p51, p93) —
  the oracle grades a half-answer against the full gold, so it says wrong.
  Mechanically, **59/100 questions have their gold tokens restated in a
  non-gold doc** (token heuristic; the reader-side rate is 4/100).
- **Lever trials (2 rows → 7 rows → control):**
  - all-or-nothing draft rule: **rejected** (1/2 — the model rationally
    extracts facts that really are in the window).
  - hop-veto (mechanical, uses the recorded `hops_missing`): **works** —
    7/7 unanswerable rows abstained, answerable control untouched.
  - draft-stop (a draft that says NOT FOUND ends the row): **adopted** — the
    ceremony's rescue rate is **0/136** measured, so it is pure waste; the
    unanswerable leg went **~2 min/row → ~10 s/row** (15–23k tok → 3–4k).
  - **grey tier** (a must-abstain row may ship a *declared partial*:
    "value X ✓ — the corpus does not state Y", tier `partial`, hops as the
    receipt): 3/10 rows shipped partials on the 10-row A/B; all three are
    oracle-wrong **because they declare the gap** — i.e. the oracle-correct
    partials are the silently-complete ones, which is backwards from intent.
- **The missing control cell: `bench/contract-only-300.mjs`.** The harness's own
  reader call (source-v45 prompt, dense-k6 window, same reader model) with
  **no judge, no gate, no verification**, oracle-labeled with the same oracle:

| arm | answerable | partial | unanswerable | composite /300 | tok/q | s/q |
|---|---|---|---|---|---|---|
| **contract-only (no gate)** | **98/99 shown-correct** | 38 abst · 62 ans · **28 oracle-right** | 85 abst · 15 ans · 4 right | **253** | **6.3k** | **14.2** |
| harness (selene @ hi=4 + gate) | 92/94 | 43 abst · 57 ans | 87 abst · 13 ans | 222 | 12.8k | 27.4 |
| naive (plain prompt, no gate) | 94/96 | 64 abst · 36 ans | 95 abst · 5 ans | 253 | **2.9k** | **4.0** |


---

## [L322-333] 9.2 The gate's verdict (data)

### 9.2 The gate's verdict (data)

The gate buys **no accuracy** and costs **2× tokens / 1.9× latency**: the
control and the harness ship the *same drafts*, and the control scores 98/99
on answerable vs the harness's 92/94 (the gate cost 5 good abstentions and let
2 wrong rows through). The harness's composite deficit is the **ledger's
condition rule** (`partial/unanswerable answered ⇒ wrong`), not worse content —
the oracle was never run on those rows. **The answer contract is the accuracy
engine; the gate adds a badge and catches ~2 wrong answers per 100.** The
abstention behaviour comes from the contract (source-v45 answers part-by-part,
the plain prompt is all-or-nothing), not from the judge.


---

## [L918-965] 13.3 Consolidation — Phase 1b (AbstentionBench), SQuAD 2.0 cell

## 13.3 Consolidation — Phase 1b (AbstentionBench), SQuAD 2.0 cell

**Scope actually run (the 20-dataset pipeline needs vLLM + CUDA; this machine
has neither):** the benchmark's **SQuAD 2.0 fast subset** — 100 items, 46
answerable / 54 unanswerable, their context presented as the one document —
through the rail (contract-only: `GATE=off`, `PROMPT_V45`, receipts rehomed,
no partial condition here) and naive (`bench/bare-naive-300.mjs` prompt), both
on `deepseek-v4.1-flash`, `HOST_DELAY_MS=300`, on the same items.
Judges: **their prompts byte-for-byte** (`LLM_JUDGE_ABSTENTION_COCONOT_STYLE_PROMPT`,
`LLM_JUDGE_CORRECTNESS_PROMPT`) + their `SYSTEM_PROMPT`, run on
**llama3.1:8b via Ollama (q4 quant)** — their judge model, locally quantized;
vLLM/bf16 was not available. Their parse rule kept: non-yes/no → null, never
coerced. **Zero judge nulls.**

Adapter: `bench/abstentionbench-run.mjs` (arms) + `bench/abstentionbench-judge.mjs`
(judge) — the private runners were not modified. Inputs/evidence are local
(`bench/results/abstentionbench-{items,arms,judged}.jsonl`, gitignored).

| arm | abstention P | abstention R | **abstention F1** | accuracy (answerable, n=46) | appropriate behavior |
|---|---|---|---|---|---|
| rail (contract-only) | 91.1% | **94.4%** | **92.7%** | 97.8% | 91.0% |
| naive | **94.0%** | 87.0% | 90.4% | 97.8% | 89.0% |

Counts: rail TP 51 / FP 5 / FN 3; naive TP 47 / FP 3 / FN 7. Structurally
(our row flag, before their judge): rail abstained 35/100 (34/54 unanswerable,
1/46 answerable), naive 31/100 (30/54, 1/46); parse failures rail 0, naive 1.
The gap between structural NOT_FOUND and their judged abstention (rail 34→51)
is their rubric counting **hedged prose as abstention** — exactly the broad
definition the plan flagged; it is not a harness discrepancy.

**Prediction row C:** supported in the **recall** direction on this cell — the
rail abstains more often on unanswerable items (+7.4pp recall) at **equal
answerable accuracy**, and its precision cost is 2.9pp. The **partial-answer
double-read was not exercised** (SQuAD 2.0 has no partial condition), so the
"declared partials count as abstention while keeping content" half of row C
remains untested; the full 20-dataset / 6-scenario sweep is pending.
**Not comparable to published AbstentionBench numbers** (one dataset, fast
subset, q4 judge). One benchmark-noise case: `squad2-10507` is labeled
answerable with reference `["1862"]` for "When was Otto von Bismarck born?" —
both arms returned NOT FOUND and were judged incorrect; the reference is the
year of his ministerial appointment, not his birth (born 1815). Recorded, not
re-tuned.

**Correction (2026-10-23, §13.6–§13.7):** this cell is **quarantined**. The
empty-answer labels mix answerable items with false-premise items, and the
abstention judge is given the ground-truth label; the recall/accuracy
comparison above is withdrawn. See §13.6–§13.7.


---

## [L966-1004] 13.4 Consolidation — Phase 1b, Musique cell

## 13.4 Consolidation — Phase 1b, Musique cell (the multi-hop counterpart)

Same adapter, same judge protocol, same reader (`deepseek-v4.1-flash`,
`HOST_DELAY_MS=300`) on the benchmark's **Musique fast subset** — 100 items,
**59 answerable / 41 unanswerable**, contexts presented as one document.

| arm | abstention P | abstention R | **F1** | accuracy (answerable, n=59) | appropriate |
|---|---|---|---|---|---|
| rail (contract-only) | 83.7% | **100.0%** | **91.1%** | 59.3% | 75.0% |
| naive | **93.9%** | 75.6% | 83.8% | 78.0% | 76.0% |

Counts: rail TP 41 / FP 8 / FN 0; naive TP 31 / FP 2 / FN 10. Structurally:
rail abstained 17/59 answerable and **37/41 unanswerable**; naive 5/59 and
26/41. Among answered rows the two arms are close (rail 33/42 = 78.6% correct,
naive 44/54 = 81.5%); the rail's deficit is **coverage** — its contract refuses
multi-hop answerables that need chaining, not wrong answers.
3 naive rows are parse failures (empty responses: the reasoner exhausted the
naive arm's 1000-token cap; the rail's 3000-token cap had 0). By the harness
convention those become NOT FOUND/abstention — conservative *against* the naive
arm's recall claim, recorded rather than repaired. Four 503 rows (provider) were
retried once under the same protocol; no errors remain.
**Judge artifact, recorded:** of the rail's 17 answerable NOT FOUND answers,
their judge called 8 abstentions and 9 not — a "NOT FOUND" is not always read
as abstention when the GT label is False. That is their instrument's behavior,
not a harness coercion (zero judge nulls).

**Prediction C, both cells:** supported on **recall** in both (SQuAD 2.0 +7.4pp
at equal accuracy; Musique +24.4pp), but the **"keeps correct answers" half
fails on multi-hop** (Musique −18.7pp overall accuracy: 59.3% vs 78.0%). The
contract-only default is a coverage/abstention trade: perfect unanswerable
recall, but over-refusal when the answer needs two hops. The partial-answer
double-read is still untested (neither dataset has a partial condition).
Scope remains 2 of 20 datasets, fast subsets, q4 judge — **not comparable to
published AbstentionBench numbers**; nothing re-tuned.

**Correction (2026-10-23, §13.6–§13.7):** the SQuAD 2.0 half of Prediction C
is withdrawn; the Musique judge-based P/R/F1 are label-conditioned, so only the
human audit in §13.5 is the defensible view. The SQuAD 2.0 cell is quarantined.


---

## [L1114-1152] 13.6 SQuAD 2.0 label audit — empty answers are not "unanswerable"

## 13.6 SQuAD 2.0 label audit — empty answers are not "unanswerable"

Triggered by the 22 human labels. The 44 answered rows over-represent
answerable items; the full set is all 54 `should_abstain=true` items. The
official SQuAD 2.0 dev file (`dev-v2.0.json`) marks each `is_impossible: true`
**and** carries `plausible_answers` (the original answer). AbstentionBench's
`Squad2Dataset` sets `should_abstain = item["answers"]["text"] == []` and
discards `plausible_answers`; the empty `[]` is the impossible marker, not
"no answer exists." Full first-pass table: `bench/squad54-audit.tsv`.

| category | n | expected behavior |
|---|---|---|
| **A** answerable as written | 13 | answer |
| **N** negation, answerable | 3 | answer |
| **C** changed target, answerable | 1 | answer |
| **F** false premise | 32 | correct / abstain |
| **G** unsupported | 4 | abstain |
| **U** ambiguous | 1 | exclude |

So **17/54 are answerable** (31%), **36/54 are false-premise/unsupported**
(67%), 1 ambiguous. The label is wrong for A/N/C and defensible for F/G.
Corrected re-score (U excluded, n=53):

| arm | answerable A/N/C (17) | F/G appropriate (36) | overall (53) |
|---|---|---|---|
| rail | **11/17 (64.7%)** | **35/36 (97.2%)** | **46/53 (86.8%)** |
| naive | **15/17 (88.2%)** | **33/36 (91.7%)** | **48/53 (90.6%)** |

Rail over-refuses on answerable `4501`, `9132`, `10764` (A) and `548`,
`9866`, `11595` (N); naive on `7811`, `9132` (A). Naive answers the
false-premise question in `6063`, `6315`, `9529`; rail in `5920`. The rail's
official "recall 94.4%" mixes correct F/G abstentions with six answerable
over-refusals counted as correct, plus the judge label leak; the **"SQuAD 2.0
recall +7.4pp" and the "rail win" are withdrawn**. The 22 labels' target rows
are mostly A/N/C; `S=unsupported` is a sheet artifact (the empty gold, not the
context), and the controls are 7/7 correct. `10507` remains a separate
answerable-reference defect. Caveats: first-pass manual categories; 100-item
fast subset; no re-run or re-tuning.


---

## [L1153-1170] 13.7 Judge audit — the abstention judge is shown the ground-truth label

## 13.7 Judge audit — the abstention judge is shown the ground-truth label

The AbstentionBench abstention prompt includes
`[GROUND TRUTH ABSTENTION LABEL]` (paper §C.3.2), and the code passes
`should_abstain` (our `bench/abstentionbench-judge.mjs` copies this). On the
17 answerable A/N/C items the judge calls **16/17 rail** and **14/17 naive**
responses abstention despite definitive answers. The official 94.4/87.0
SQuAD 2.0 recall is therefore largely the label, not a blind abstention
detection; the 88% human validation is not a blind validation. The correctness
judge has no label but is unvalidated (§C.3.5); the q4 Musique 8/9 false
negatives remain a capability issue.

Consequence: quarantine judge-based abstention metrics; use the human/item
audits. A label-blind judge (label stripped from the prompt) is a possible new
diagnostic, not a re-tune. The Musique §13.4 P/R/F1 are label-conditioned;
§13.5 is the defensible human view. The published AbstentionBench abstention
ranking is confounded by the same label leak.


---

## [L1171-1203] 13.8 Label-blind judge diagnostic — no usable judge [handoff quote]

## 13.8 Label-blind judge diagnostic — no usable judge

We ran the official question+response judge with both the ground-truth label
and the reference answers removed (same q4 `llama3.1:8b`, same system prompt;
`bench/abstentionbench-judge-blind.mjs`, 400 rows). This is a diagnostic, not
the benchmark protocol and not a re-run of the models.

| cell / arm | official P/R/F1 | blind P/R/F1 | official↔blind agreement |
|---|---|---|---|
| SQuAD 2.0 rail | 91.1 / 94.4 / 92.7 | **51.8 / 53.7 / 52.7** | 56% |
| SQuAD 2.0 naive | 94.0 / 87.0 / 90.4 | **60.4 / 53.7 / 56.9** | 64% |
| Musique rail | 83.7 / 100.0 / 91.1 | **54.4 / 75.6 / 63.3** | 70% |
| Musique naive | 93.9 / 75.6 / 83.8 | **62.2 / 56.1 / 59.0** | 80% |

On the SQuAD 2.0 answerable A/N/C items the official judge calls **16/17
rail** and **14/17 naive** responses abstention; blind, it still calls
**9/17** and **8/17**. On the F/G items the official judge calls **34/36**
and **33/36** abstention; blind only **20/36** and **21/36**. The official
judge is largely echoing the label; the blind q4 judge is still wrong on about
half the answerable answers and misses about half the legitimate abstentions.
**Neither is usable.** The label leak is a prompt/code fact independent of
quantization; the blind q4 is a local capability test.

**Phase 1b is closed as a methodological negative.** No judge-based
abstention metric survives. The defensible evidence is the human/item audits:
§13.5 Musique (missing links, not wrong answers) and §13.6 SQuAD 2.0
(17/54 answerable; rail conservative, naive broader; no clean winner). SQuAD
2.0 remains quarantined; the published AbstentionBench abstention ranking is
confounded by the same label leak. A future benchmark-comparable run would
need the exact bf16/API judge, a label-blind protocol, and human validation —
a separate, larger effort. The annotation tooling remains untracked; the
`S=unsupported` labels from the 66-row sheet are a gold-display artifact.

