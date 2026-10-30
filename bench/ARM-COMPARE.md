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

Context flags: `--doc-mode excerpt|head|full` (default `excerpt`: 6k head plus
tail lines for question terms absent from the head), `--doc-chars 20000`,
`--aggregate off|table|pages` for global items, and `--ids id1,id2` for a
subset. `excerpt` is the corrected local context; `full` is an ablation.

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

### Corrected held-out 100 (2026-10-30)

DeepSeek V4.1 Flash and Sonnet 5.5, one seed, v2 labels, K=3 excerpt. Page
aggregate is primary; table aggregate is the deterministic control. The local
column excludes the two global items; the aggregate columns add them.

| Reader | Arm | Local 98 | + page agg | + table agg | False | Cost |
|---|---|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | B | 94 | — | — | 5 | $0.11 |
| Sonnet 5.5 | B | 94 | — | — | 4 | $1.10 |
| DeepSeek V4.1 Flash | DA | **98** | **100** | **100** | **0** | **$0.23** |
| Sonnet 5.5 | DA | 94 | **96** | **96** | 4 | **$1.80** |

- **Reader-only:** DeepSeek B and Sonnet B tie at 94. DeepSeek is ~10x cheaper;
  Sonnet has one fewer false accept. Not a DeepSeek reader win.
- **DA:** DeepSeek 100 vs Sonnet 96 at ~7.8x lower cost, 0 vs 4 false accepts.
  The DeepSeek DA adds 4 local rows over its B; the aggregate adds 2.
- **Aggregate is deterministic:** the two global items are not reader wins.
  Page and table agree.
- **Old result:** the earlier DeepSeek/GLM-Flash 6k held-out rows are historical
  and not comparable; the 6k head hid the annual-openings facts. Full 20k pages
  are an ablation that recovered those facts but regressed `088`/`089`.
- The remaining Sonnet DA misses are `041`, `088`, `091`, `093`; DeepSeek DA
  has none after the aggregate.

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
