# CUAD clause-presence pilot

**Status:** deterministic public-benchmark pilot, not legal advice, not a SOTA
clause extractor.  
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

1. **Reader-first CUAD pilot.** Use a local reader to propose the clause and
   quote; the verifier checks the quote and absence. This should improve recall
   on the weak categories.
2. **Span-level evaluation.** Add CUAD's Jaccard ≥ 0.5 span metric so the
   result is comparable to the standard extraction task.
3. **Human audit.** Sample predicted quotes and absent claims; measure
   precision on the audit sample.
4. **Category-specific extractors.** Replace the generic TF-IDF guard with
   clause-specific rules for the structured categories (governing law, renewal,
   notice, liability cap, etc.).
