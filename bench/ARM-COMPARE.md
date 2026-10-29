# Arm comparison: does the harness beat a strong simple baseline?

Runner: `bench/arm-compare.mjs`. Offline plumbing check: `node bench/arm-compare.mjs --fake`.

| Arm | What it is |
|---|---|
| A | naive: question only |
| Q | retrieval + "quote every claim" prompt, ungated (the fair citation baseline) |
| DA | the current harness: quote contract + mechanical gate + absence check |
| B | RAG, shared top-k window, "cite the file / NOT FOUND" prompt (opt-in) |
| C | B + entailment check (MiniCheck-style `--judge-model`, or any detector via `--judge-cmd`); INSUFFICIENT => abstain (opt-in) |
| D | gate-only stage / ablation on the same window; `--no-absence` in the CLI |

Same reader, corpus and retrieval window in every arm (`--k`, reference retriever);
the default arms are `A,Q,DA`; B/C/D are opt-in; D is the gate-only ablation.

## Protocol (fix before running)

1. Tune C's judge and threshold on the pilot/dev items only. Freeze. Run the held-out set once.
2. 3 seeds (`--seeds 3`). The hosted judge flips ~1 in 10 labels; report the spread, not one run.
3. Primary metric: false-accept rate, i.e. a wrong answer, or any answer to an unanswerable
   or incompletely-flagged partial question, shown as if it were fine. Secondary: answerable
   accuracy, unanswerable abstention, partial-correct, tokens/question and seconds/question
   (both recorded per row by the runner).
4. The ranked all-arms tables (A/Q/DA/D*/27B) are in `ARM-COMPARE-REPORT.md`; the
   current harness is DA, not a separate D competitor.
5. Scoring is mechanical (gold value present, abstention flagged). It is stricter than a
   human on paraphrase: spot-check 20 rows by hand and report the disagreement rate.

## Decision rule

- D's false-accept CI lies entirely below C's: the verifier adds value beyond entailment. Keep the "gate" framing.
- Intervals overlap: the defensible pitch is receipts + aggregation. Drop the gate claim.
- C is better on accuracy at equal false-accept: say so in the README.

## Known limits

- Wilson intervals here pool seeds, which are not independent questions. Treat them as optimistic.
- The pilot has 20 items. Use the held-out 100 for any claim.

## Results

### Weak-reader pilot (qwen3.5:4b, public 20, one seed)

D-gate **40%** false accepts vs B/C **0%** after the scorer fix. This is a
weak-reader warning, not product evidence; the 4B does not follow the contract
well enough for the gate to matter.

### Strong-reader held-out (DeepSeek V4.1 Flash, 100, one seed, K=3)

The published held-out run used **one seed**; the 3-seed protocol above is
the bar for a separation claim, and no separation is claimed.

| Arm | Answerable | Unanswerable | Partial | Audited wrong-shown | Coverage |
|---|---:|---:|---:|---:|---:|
| B RAG-cite | 27/40 | 38/40 | 20/20 | **8% [4–15]** | 55/100 |
| C RAG-cite + MiniCheck | 20/40 | 38/40 | 5/20 | **3% [1–8]** | 28/100 |
| D harness + gate | 27/40 | 40/40 | 17/20 | **2% [1–7]** | 46/100 |

D and B tie on answerable; D has 1 wrong answer vs B's 6. D's partials are
17/20 after audit, not 7 wrong. C's low false-accept rate comes with the lowest
coverage. Intervals overlap; do not claim separation. Raw held-out outputs stay
private.

D is comparable to C on false accepts with much higher coverage (46 vs 28),
and better answerable/partial accuracy; C abstains more. D is comparable to B
on answerable accuracy with lower false accepts and lower coverage; B is better
on partials. D is not proven superior to entailment. Raw held-out outputs stay
private.

### Reader robustness pilots (2026-10-29, public 20-item pilot)

The defect is interface-level, not model-tier, so the same arms were rerun on
the public pilot with the benchmark reader, two frontier readers and a local
mid-tier one. DeepSeek V4.1 Flash (3 seeds): D 2/60 wrong shown versus B's 4/60
(3 substantive; one empty output), answerable 18/24 versus 20/24, partials
7/12 versus 9/12. GLM-5.3 (3 seeds): D 0/60 versus B's 4/60, unanswerable
24/24, partials tied, answerable 18/24 versus 21/24.
Sonnet 5.5 (two 3-seed replications): a tie — D 2–3/60 versus B 3/60,
answerable 20/24 versus 21/24, partials 7–8/12 versus 9/12 — because Sonnet's
errors were false absences, which the gate cannot reject. Local 27B: D and B
tie on wrong shown (1/20), and D abstains on partials the reader could have
answered — contract compliance, not gate rejection. Across the direct
comparison, D never beats B on answerable or partials; its gain is wrong-shown
for fabricating readers only, at a coverage cost. Full tables, per-seed
spread, row audit, costs, and hashes: `bench/ARM-COMPARE-REPORT.md` § Reader
robustness.

## Held-out report

See `bench/ARM-COMPARE-REPORT.md` for per-condition shown/abstained/wrong,
retrieval misses, intervals, coverage, strict-mode delta, and the held-out hash.

## Citation metrics — pre-registered 2026-10-29 (before the run)

The answer metric and the citation metric are separate. For every shown answer:

1. **Validity (mechanical, per quote):** exact in the claimed document /
   tolerant-only / misattributed (exists in another document) / missing.
   Per answer: all quotes valid?
2. **Completeness (mechanical):** quotes cover every required operand (answerable)
   or stated part (partial).
3. **Support (semantic, ALCE-style):** split the answer into sentences; classify
   each as positive, absence, or computed. Positive claims are judged with
   MiniCheck against the shown quotes; computed claims require their operands in
   the quotes; absence claims are reported separately (the D-absence class).

**Joint view:** answer correct/wrong × citation valid/invalid/none.

**Arms.** `Q` = B's prompt + "copy the exact supporting passage VERBATIM for
every claim" (JSON, no gate, no lift/repair) — the simple-prompt control.
`D` = the shipped contract + gate; D reports **raw generation** and **shown
receipt** validity separately. B and C are not rerun: they carry no quotes, and
their answer behaviour is unchanged; their rows from the v2 pilot are reused as
a cross-run reference.

**Run.** Public pilot v2 (20 items), Flash, 3 seeds, `--arms Q,D`,
`--max-tokens 1200`, MiniCheck. Thresholds, fixed before running:

- **Q fails the simple-prompt test** if exact-verbatim < 95%, or required
  coverage < 90%, or positive-claim support < 90% (answerable + partial).
- **D passes** if shown validity = 100% and wrong+invalid = 0.

All rates reported with counts and Wilson intervals; if Q meets the thresholds,
the "a simple prompt does not work" claim is withdrawn.

**Post-run note (2026-10-29).** The pre-registered MiniCheck support over-refused
(it rejected an obvious entailment), so the support measure is a manual
claim-level audit (`bench/audits/citation-support-2026-10-29.json`); the 9B
sensitivity is withdrawn. The Q decision is unchanged: coverage fails.
