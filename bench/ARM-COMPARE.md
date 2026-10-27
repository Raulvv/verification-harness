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

## Results

### Weak-reader pilot (qwen3.5:4b, public 20, one seed)

D-gate **45%** false accepts vs B/C **5%**. This is a weak-reader warning, not
product evidence; the 4B does not follow the contract well enough for the gate
to matter.

### Strong-reader held-out (DeepSeek V4.1 Flash, 100, one seed, K=3)

| Arm | Answerable | Unanswerable abstain | Partial correct | False accept |
|---|---:|---:|---:|---:|
| A naive | 8/40 | 8/40 | 0/20 | **94%** |
| B RAG-cite | 21/40 | 38/40 | 16/20 | **14%** |
| C RAG-cite + MiniCheck | 15/40 | 38/40 | 3/20 | **8%** |
| D harness + gate | 21/40 | 40/40 | 11/20 | **10%** |

D is comparable to B and close to C; it is **not** clearly superior to C.
D's advantage is receipts and complete-candidate aggregation, not a lower
false-accept rate than entailment. C is the stronger standard solution on
false accepts and partials; D is stronger on answerable accuracy and
unanswerable abstention. Raw held-out outputs stay private.

## Held-out report

See `bench/ARM-COMPARE-REPORT.md` for per-condition shown/abstained/wrong,
retrieval misses, intervals, coverage, strict-mode delta, and the held-out hash.
