# Arm comparison: does the harness beat a strong simple baseline?

Runner: `bench/arm-compare.mjs`. Offline plumbing check: `node bench/arm-compare.mjs --fake`.

| Arm | What it is |
|---|---|
| A | naive: question only |
| B | RAG, shared top-k window, "cite the file / NOT FOUND" prompt |
| C | B + entailment check (MiniCheck-style `--judge-model`, or any detector via `--judge-cmd`); INSUFFICIENT => abstain |
| D | the harness on the same K-doc window (`askOneShot`, contract reader + mechanical gate); gate rejection = abstention |

Same reader, corpus and retrieval window in every arm (`--k`, reference retriever);
D now receives the exact B/C window and applies `verify()` before scoring.

## Protocol (fix before running)

1. Tune C's judge and threshold on the pilot/dev items only. Freeze. Run the held-out set once.
2. 3 seeds (`--seeds 3`). The hosted judge flips ~1 in 10 labels; report the spread, not one run.
3. Primary metric: false-accept rate, i.e. a wrong answer, or any answer to an unanswerable
   or incompletely-flagged partial question, shown as if it were fine. Secondary: answerable
   accuracy, unanswerable abstention, partial-correct, seconds/question.
4. Scoring is mechanical (gold value present, abstention flagged). It is stricter than a
   human on paraphrase: spot-check 20 rows by hand and report the disagreement rate.

## Decision rule

- D's false-accept CI lies entirely below C's: the verifier adds value beyond entailment. Keep the "gate" framing.
- Intervals overlap: the defensible pitch is receipts + aggregation. Drop the gate claim.
- C is better on accuracy at equal false-accept: say so in the README.

## Known limits

- Wilson intervals here pool seeds, which are not independent questions. Treat them as optimistic.
- The pilot has 20 items. Use the held-out 100 for any claim.

## Pilot observation (public 20, qwen3.5:4b, one seed)

A 20-item public pilot run after the boundary fix produced D-gate **45% false
accepts**, versus **5% for B and C**, with D at 63% answerable, 63% unanswerable
abstention, and 25% partial. This is a warning, not a held-out claim; it does not
support gate superiority. The held-out result is maintained privately.
