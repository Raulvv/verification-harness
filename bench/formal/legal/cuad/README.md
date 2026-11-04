# CUAD clause-presence pilot

This is a public-benchmark adapter for **CUAD v1** (Contract Understanding
Atticus Dataset): 510 commercial contracts, 41 clause categories, expert-labeled
spans. It is a deterministic clause-presence baseline with quote receipts. It
is **not legal advice** and not a SOTA clause extractor.

CUAD source: <https://github.com/The-Atticus-Project/cuad>  
Paper: <https://arxiv.org/abs/2103.06268>

## Download

```bash
cd bench/formal
.venv/bin/python legal/cuad/download_cuad.py
```

The data is written under `legal/cuad/data/` and is **gitignored**. CUAD has its
own license and citation requirements; do not vendor the JSON into the repo.

## Run

```bash
.venv/bin/python -m formal.cuad
```

The adapter uses the official split: 408 train contracts and 102 test
contracts. It builds a per-category TF-IDF centroid from the train positive
spans plus a small negative sample, applies a category lexical guard, scores
sentence windows in each test contract, and predicts presence or closed-world
absence. Each prediction carries a quote and a coverage receipt.

The default is the balanced operating point (`--min-precision 0.85`). Use
`--min-precision 0.95` for the precision-first point. Output:
`legal/cuad/out/cuad-results.json`.

Quick smoke run:

```bash
.venv/bin/python -m formal.cuad --max-contracts 10
```

## What is measured

- Presence precision, recall, F1.
- False accepts: predicted present when CUAD says absent.
- False rejects: predicted absent when CUAD says present.
- Quote support: the predicted quote contains the gold span or has token
  Jaccard ≥ 0.5.
- Per-category results.

The baseline is deliberately simple. The purpose is to test the **assurance
layer** — clause presence/absence, quote receipts, and coverage — on a public
legal corpus, not to compete with a fine-tuned legal extraction model.

## Limits

- The detector is TF-IDF, not a legal language model.
- Absence is closed-world over the supplied contract text; it never means the
  clause does not exist outside the contract.
- The quote is a sentence window, not a lawyer-reviewed clause boundary.
- This is a research benchmark, not legal advice.
