# CUAD benchmark pilot

**Status:** public-benchmark pilot: deterministic presence baseline + fine-tuned
span model (span results pending). Not legal advice, not a SOTA clause
extractor.
**Dataset:** CUAD v1 — 510 commercial contracts, 41 clause categories,
expert-labeled spans.  
**Split:** official CUAD split — 408 train contracts, 102 test contracts.  
**Claims:** 4,182 test contract/category claims (1,244 positive, 2,938 absent).

CUAD source: <https://github.com/The-Atticus-Project/cuad>  
Paper: <https://arxiv.org/abs/2103.06268>

## What this tests

This adapter tests the **assurance layer** on a public legal corpus:

```text
contract text
  -> per-category TF-IDF clause detector (train split only)
  -> category lexical guard
  -> supporting sentence (quote + offsets)
  -> ENTAILED or ABSENT_CONFIRMED with a coverage receipt
```

It is deliberately simple and dependency-free. The point is a reproducible
claim-level benchmark with receipts, not a leaderboard win.

## Results

Two operating points are reported because no single threshold dominates.

| Operating point | Precision | Recall | Micro F1 | Macro F1 | False accepts | False rejects | Quote support | Categories with no positive prediction |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Balanced (`--min-precision 0.85`) | 0.882 | 0.660 | 0.755 | 0.455 | 110 | 423 | 0.552 | 10 / 41 |
| Precision-first (`--min-precision 0.95`) | 0.911 | 0.568 | 0.700 | 0.400 | 69 | 537 | 0.602 | 13 / 41 |

False accepts are predicted-present claims where CUAD says the clause is
absent. At the balanced point they are **3.7% of absent clauses**; at the
precision-first point, **2.4%**. Quote support means the predicted quote
contains the gold span or has token Jaccard ≥ 0.5.

## Where it works

The strongest categories are the ones with distinctive vocabulary:

| Category | Precision | Recall | F1 | Quote support |
|---|---:|---:|---:|---:|
| Governing Law | 0.92 | 1.00 | 0.96 | 0.83 |
| License Grant | 0.94 | 0.90 | 0.92 | 0.71 |
| Anti-Assignment | 0.86 | 0.99 | 0.92 | 0.80 |
| Expiration Date | 0.90 | 0.92 | 0.91 | 0.41 |
| Insurance | 0.79 | 0.94 | 0.86 | 0.66 |

## Where it fails

The weak categories are the ones that need legal interpretation, not lexical
matching:

- Affiliate License-Licensor / Affiliate License-Licensee
- Competitive Restriction Exception
- Covenant Not To Sue
- Most Favored Nation
- Non-Compete
- Non-Disparagement
- Price Restrictions
- Uncapped Liability
- Unlimited/All-You-Can-Eat-License
- Volume Restriction

These categories often use indirect wording, cross-references, or definitions
that a TF-IDF sentence matcher does not resolve. The precision-first threshold
abstains on many of them rather than guessing, which is the right failure mode
for an assurance layer but also a coverage cost.

## What this shows

1. **The adapter runs end to end on a real public legal benchmark.** It loads
   the official split, builds a train-only detector, predicts clause presence,
   and returns a quote plus a coverage receipt for every claim.

2. **The assurance layer is honest about absence.** Every absent prediction is
   closed-world over the supplied contract text and carries a receipt; it never
   claims the clause does not exist outside the contract.

3. **The detector is the bottleneck, not the receipt layer.** The formal layer
   can verify the quote it is given; it cannot invent the missing legal
   interpretation. The weak categories show exactly where a reader or a
   fine-tuned extractor is needed.

## What this does not show

- It is **not** a CUAD leaderboard result. The standard CUAD evaluation is
  span-level precision/recall/AUPR with a fine-tuned extractor; this is a
  deterministic clause-presence baseline.
- It is **not** legal advice.
- It is **not** a human-audited claim set. The labels are CUAD's expert spans;
  the predicted quotes have not been reviewed by a lawyer.
- It does **not** establish that the formal verifier catches legal reasoning
  errors. It establishes that the legal adapter can run, receipt, and report
  honestly on a public corpus.

## Span-level harness (official metric floor)

The presence pilot is not leaderboard-comparable. The span mode uses CUAD's
Jaccard ≥ 0.5 matching and reports AUPR / P@80 / P@90. The current TF-IDF
detector returns sentence windows, not minimal clause spans, so it is a floor:

| System | Macro AUPR | P@80 | P@90 |
|---|---:|---:|---:|
| TF-IDF sentence windows | 0.157 | 0.023 | 0.000 |

This validates the metric harness. It is not a competitive span-extraction
result.

## Legal-BERT full run

The optional Legal-BERT encoder is more precise but much more conservative:

| Encoder | Precision | Recall | Micro F1 | Macro F1 | False accepts | False rejects | Quote support | Categories with no positive prediction |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| TF-IDF balanced | 0.882 | 0.660 | 0.755 | 0.455 | 110 | 423 | 0.552 | 10 |
| TF-IDF precision-first | 0.911 | 0.568 | 0.700 | 0.400 | 69 | 537 | 0.602 | 13 |
| Legal-BERT | 0.947 | 0.415 | 0.577 | 0.258 | 29 | 728 | 0.602 | 16 |

Legal-BERT cuts false accepts from 110 to 29, but recall falls from 0.660 to
0.415 and macro F1 from 0.455 to 0.258. It does **not** solve the weak
categories; it mostly abstains on them.

Where it helps:

- IP Ownership: F1 0.21 → 0.51
- ROFROFR: 0.21 → 0.30
- Governing Law: 0.96 → 0.98
- Anti-Assignment: 0.92 → 0.93

Where it collapses:

- License Grant: 0.92 → 0.46
- Renewal Term: 0.89 → 0.42
- Audit Rights: 0.88 → 0.42
- Agreement Date: 0.81 → 0.12

This is a reader/encoder tradeoff, not a verifier improvement. The next
leaderboard-comparable step is a CUAD fine-tuned span model, not a generic
legal encoder.

## Fine-tuned span model

The leaderboard-comparable path uses `akdeniz27/roberta-base-cuad`, a
CUAD-trained extractive QA checkpoint. `formal/cuad_qa.py` runs it on the
official 102-contract test split with sliding windows, n-best spans, and
official-style Jaccard/AUPR/P@80/P@90 matching. It also reports question-level
presence and no-answer false-accept rates at a zero threshold and at
precision-first operating points. This is the reader layer; the verifier layer
is separate.

## Reader vs harness

The clause detector is the **reader**. The verifier checks the quote and the
closed-corpus absence receipt. A legal encoder or legal reader can improve
recall, but that is a reader improvement. Report reader-only and
verifier-checked results separately.

## Reproduce

```bash
cd bench/formal
.venv/bin/python legal/cuad/download_cuad.py
.venv/bin/python -m formal.cuad
.venv/bin/python -m formal.cuad --min-precision 0.95 \
  --out legal/cuad/out/cuad-results-precision.json
```

Outputs are written under `legal/cuad/out/` and are gitignored. The CUAD JSON
is downloaded under `legal/cuad/data/` and is also gitignored.

## Next steps

1. **Finish the fine-tuned span model.** Run `formal/cuad_qa.py` on the
   official test split and report AUPR / P@80 / P@90 next to the public
   RoBERTa/DeBERTa baselines.
2. **Verifier-wrapped CUAD.** Report question-level presence and no-answer
   false-accept rates at zero, best-F1, and precision-first thresholds. This is
   the harness result, not the reader's span score.
3. **Human audit.** Sample predicted quotes and absent claims; measure
   precision on the audit sample.
4. **Category-specific extractors.** Replace the generic TF-IDF guard with
   clause-specific rules for the structured categories (governing law, renewal,
   notice, liability cap, etc.).
