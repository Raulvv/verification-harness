# Arm comparison — held-out report

Aggregate only. Raw held-out outputs, labels, and the audit sheet are private.
The hashes below commit to the exact files used.

## Provenance

- Run code: `2e0f500` (v1.1.8) — same K=3 window, D-gate.
- Scorer fix: `1d4c16c` (v1.1.11) — object golds.
- Held-out output: `a4462a1be54d8f090640c6929679d353297790014f807a54988e81ec8a7e0632`
- Private questions: `3bd8b0a21e11f8aff18e28c591654f90336a7ab2c65b70630954d066ae7fa763`
- Filled audit sheet: `535864973117ba894fc4b99b40e3c778e5b941f9a49d2f80239b0984eae0f6fb`
- Config hash (post hoc): `0d563d0054fed50300665e43eb53e3922cd7b3a5317830c1939ef79872287b03`
- Not pre-registered; one seed; n=100. Treat intervals as descriptive.

## Pre-fix / post-fix / post-audit

| Stage | A | B | C | D |
|---|---:|---:|---:|---:|
| Pre-fix false accept | 94% | 14% | 8% | 10% |
| Post-object-gold false accept | 92% | 8% | 3% | 4% |
| Post-audit wrong-shown | — | **8% [4–15]** | **3% [1–8]** | **2% [1–7]** |

A is excluded from the audit because it is closed-book and has 92 wrong-shown
rows. The audit covers every B/C/D wrong-shown row: 25 unique answers, 12
scorer artifacts, 0 unsure.

## Post-audit per condition

| Arm | Answerable correct | Answerable wrong | Answerable abstain | Unanswerable correct | Unanswerable wrong | Partial correct | Partial wrong | Partial abstain | Coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B RAG-cite | 27/40 | 6 | 7 | 38/40 | 2 | 20/20 | 0 | 0 | 55/100 |
| C RAG-cite + MiniCheck | 20/40 | 1 | 19 | 38/40 | 2 | 5/20 | 0 | 15 | 28/100 |
| D harness + gate | 27/40 | 1 | 12 | 40/40 | 0 | 17/20 | 1 | 2 | 46/100 |

D and B tie on answerable correct. D shows **1** wrong answer vs B's **6**.
D's partial cell is **17/20 correct, 1 wrong, 2 abstained** after audit, not
7 wrong. C's low false-accept rate comes with the lowest coverage.

## What the audit found

- Object golds caused the earlier artifact; that is fixed.
- The remaining scorer misses were mostly partial answers that omitted an
  *unasked* annual-average-openings gold part. The hand audit judged those
  acceptable.
- D partial: 7 wrong-shown before audit → **1 genuinely wrong** after audit.
- B partial: 4 wrong-shown → **0 genuinely wrong**.
- C partial: 2 wrong-shown → **0 genuinely wrong**.

## Reading the table

- **Coverage** is shown / n; **false accept** is the fraction of all rows.
  Per-condition percentages are fractions of that condition's rows.
- Intervals are Wilson 95%. D 2%, C 3%, and B 8% overlap; do not claim
  separation.
- C buys its 3% with 28/100 coverage; D covers 46/100; B covers 55/100.
- B's pooled “correct” mixes answer correctness and correct abstention; use the
  per-condition columns.

## Fairness / tuning

- B and C use the same fair RAG prompt, including the partial instruction.
- D uses the v45 contract prompt plus `partialRule`; C adds MiniCheck.
- The 4B pilot was a weak-reader check, not product evidence. The held-out set
  was not used to tune C's judge, D's prompt, or the threshold; C's judge was
  fixed to MiniCheck before the held-out run.
- Strict mode was not used for the headline. Re-scoring D's stored receipts
  with `strict: true` leaves 3 of 4 pre-audit false accepts passing; one is
  rejected. The audit reduces D to 2 genuine wrong-shown rows.
