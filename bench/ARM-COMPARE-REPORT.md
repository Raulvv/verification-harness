# Arm comparison — held-out report

Aggregate only. Raw held-out outputs and labels are private. The SHA-256 below
commits to the exact output file used for these numbers.

# Arm report

Rows: `bench/results/arm-compare-heldout-deepseek.jsonl`  
Questions: `bench/results/ooh-test-private.jsonl`  
Corpus: `bench/corpus/ooh-v1`  
K: 3  
SHA-256: `4884eb571ad5c444f4eace68165e5e23c3fc5ae8008abc33d59e7dddac4cc4d3`

| Arm | Condition | n | Correct | Abstained | Wrong shown | Retrieval miss | Coverage | False accept |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| A | answerable | 40 | 3 | 0 | 37 | 8 | 40/40 | 93% [80-97] |
| A | unanswerable | 40 | 3 | 3 | 37 | 0 | 37/40 | 93% [80-97] |
| A | partial | 20 | 0 | 0 | 20 | 0 | 20/20 | 100% [84-100] |
| B | answerable | 40 | 21 | 7 | 12 | 8 | 33/40 | 30% [18-45] |
| B | unanswerable | 40 | 38 | 38 | 2 | 0 | 2/40 | 5% [1-17] |
| B | partial | 20 | 16 | 0 | 4 | 0 | 20/20 | 0% [0-16] |
| C | answerable | 40 | 15 | 19 | 6 | 8 | 21/40 | 15% [7-29] |
| C | unanswerable | 40 | 38 | 38 | 2 | 0 | 2/40 | 5% [1-17] |
| C | partial | 20 | 3 | 15 | 2 | 0 | 5/20 | 0% [0-16] |
| D | answerable | 40 | 21 | 12 | 7 | 8 | 28/40 | 18% [9-32] |
| D | unanswerable | 40 | 40 | 40 | 0 | 0 | 0/40 | 0% [0-9] |
| D | partial | 20 | 11 | 2 | 7 | 0 | 18/20 | 15% [5-36] |

## D strict-mode delta

D false accepts: 10; strict passes: 9; strict rejects: 1; strict false accepts: 9

## Reading the table

- **Retrieval miss** means the gold source is absent from the deterministic K=3
  window; it is shared by B/C/D and is not a model call.
- **Wrong shown** includes possible scorer-strict paraphrase misses. The
  20-row hand spot-check has **not** been done; treat scorer error as unknown.
- **Coverage** is shown / n; **false accept** is the fraction of all rows.
- Intervals are Wilson 95%. At n=100, one seed, B 14%, D 10%, and C 8% overlap;
  do not claim separation.

## Fairness / tuning note

- B and C use the same fair RAG prompt, including the partial instruction.
- D uses the v45 contract prompt plus `partialRule`; C adds MiniCheck.
- The 4B pilot was a separate weak-reader check. The held-out set was not used
  to tune C's judge, D's prompt, or the threshold; C's judge was fixed to
  MiniCheck before the held-out run.
- Strict mode was not used for the headline. Re-scoring D's stored receipts
  with `strict: true` leaves 9 of 10 false accepts passing; one is rejected.

