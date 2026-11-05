# SQuAD 2.0 mixed-absence test

Tests the claim that the harness helps when answerable and unanswerable
questions are mixed: readers hallucinate an answer when the evidence is absent,
and the contract should force abstention.

## Design

- 100 answerable + 100 unanswerable questions from SQuAD 2.0 dev (seed 0).
- One paragraph per question; no retrieval.
- **B:** answer with a short span, or `{"not_found":true}`.
- **DA:** same, plus a verbatim quote; the quote must (a) exist in the paragraph
  and (b) contain the answer. A failed gate forces abstention.
- Same reader (DeepSeek V4.1 Flash), same prompt shape, JSON output.

## Pre-registered gates

Written before the run:

1. DA abstention on unanswerable ≥ **B + 10 points**.
2. DA answerable EM within **3 points** of B.
3. DA overall exact accuracy **higher** than B.
4. DA quote validity ≥ **95%**.

Reported: answerable EM/F1, answerable abstention, unanswerable abstention,
false-answer rate, overall exact, quote validity, paired differences with 95%
bootstrap intervals.

## Run

```bash
./fetch_squad2.sh
OPENCODE_API_KEY=... node squad2/run_squad2_mix.mjs
.venv-detectors/bin/python squad2/score_squad2.py \
  --rows competitive/private/squad2/runs/squad2-mix-200.jsonl
```

Outputs go to `competitive/private/squad2/runs/` (gitignored).

## Why this is the right test

QAMPARI is all-answerable: the harness has no absence to catch, and the
200-question result was non-inferior but no better. SQuAD 2.0's unanswerable
questions are human-written and topically related, so the reader is tempted to
answer from parametric knowledge. That is the condition the contract is
supposed to fix.
