# Arm comparison — held-out report

Aggregate only. Raw held-out outputs and labels are private. The SHA-256 below
commits to the exact output file used for these numbers.

# Arm report

Rows: `bench/results/arm-compare-heldout-deepseek-rescored.jsonl`
Questions: `bench/results/ooh-test-private.jsonl`
Corpus: `bench/corpus/ooh-v1`
K: 3
SHA-256: `a4462a1be54d8f090640c6929679d353297790014f807a54988e81ec8a7e0632`

## Headline false accept / coverage

| Arm | Correct | False accept | Coverage |
|---|---:|---:|---:|
| A | 8/100 | 92% [85-96] | 97/100 |
| B | 81/100 | 8% [4-15] | 55/100 |
| C | 61/100 | 3% [1-8] | 28/100 |
| D | 78/100 | 4% [2-10] | 46/100 |


| Arm | Condition | n | Correct | Abstained | Wrong shown | Retrieval miss | Coverage | False accept |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| A | answerable | 40 | 5 | 0 | 35 | 8 | 40/40 | 88% [74-95] |
| A | unanswerable | 40 | 3 | 3 | 37 | 0 | 37/40 | 93% [80-97] |
| A | partial | 20 | 0 | 0 | 20 | 0 | 20/20 | 100% [84-100] |
| B | answerable | 40 | 27 | 7 | 6 | 8 | 33/40 | 15% [7-29] |
| B | unanswerable | 40 | 38 | 38 | 2 | 0 | 2/40 | 5% [1-17] |
| B | partial | 20 | 16 | 0 | 4 | 0 | 20/20 | 0% [0-16] |
| C | answerable | 40 | 20 | 19 | 1 | 8 | 21/40 | 3% [0-13] |
| C | unanswerable | 40 | 38 | 38 | 2 | 0 | 2/40 | 5% [1-17] |
| C | partial | 20 | 3 | 15 | 2 | 0 | 5/20 | 0% [0-16] |
| D | answerable | 40 | 27 | 12 | 1 | 8 | 28/40 | 3% [0-13] |
| D | unanswerable | 40 | 40 | 40 | 0 | 0 | 0/40 | 0% [0-9] |
| D | partial | 20 | 11 | 2 | 7 | 0 | 18/20 | 15% [5-36] |

## D strict-mode delta

D false accepts: 4; strict passes: 3; strict rejects: 1; strict false accepts: 3

## Hand spot-check

A deterministic 20-row audit found **one scorer false negative**: object golds
such as `{winner, difference_pp}` were compared against `[object Object]`.
The scorer is fixed; the 20-row audit rechecks clean after the fix. This changed
the headline: the earlier 21/40 answerable and 10% false-accept numbers were
scorer artifacts.

## Reading the table

- **Retrieval miss** means the gold source is absent from the deterministic K=3
  window; it is shared by B/C/D and is not a model call.
- **Wrong shown** includes possible scorer-strict paraphrase misses.
- **Coverage** is shown / n; **false accept** is the fraction of all rows.
- Intervals are Wilson 95%. At n=100, one seed, D 4%, C 3%, and B 8% overlap;
  do not claim separation.
- C's low false-accept rate comes with much lower coverage (28/100) than D
  (46/100) and B (55/100).

## Fairness / tuning note

- B and C use the same fair RAG prompt, including the partial instruction.
- D uses the v45 contract prompt plus `partialRule`; C adds MiniCheck.
- The 4B pilot was a separate weak-reader check. The held-out set was not used
  to tune C's judge, D's prompt, or the threshold; C's judge was fixed to
  MiniCheck before the held-out run.
- Strict mode was not used for the headline. Re-scoring D's stored receipts
  with `strict: true` leaves 3 of 4 false accepts passing; one is rejected.

