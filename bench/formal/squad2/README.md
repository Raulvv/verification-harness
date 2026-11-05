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

## Result (200 questions)

| Metric | B | DA |
|---|---:|---:|
| Answerable EM | 73.0 | 74.0 |
| Answerable F1 | 86.8 | 85.9 |
| Answerable abstention | 1.0 | 3.0 |
| Unanswerable abstention | 71.0 | 69.0 |
| Unanswerable false answer | **29.0** | **31.0** |
| Overall exact | **72.0** | 71.5 |
| Quote validity | — | 100% (128/128) |

Paired DA−B, 95% bootstrap:

| Metric | Δ | Interval |
|---|---:|---|
| Unanswerable abstention | +0.0 | [−3.0, +3.0] |
| Unanswerable false answer | +1.0 | [−2.0, +4.0] |
| Answerable EM | +0.5 | [−3.0, +4.0] |
| Overall exact | −0.5 | [−5.0, +4.0] |

**Verdict: hypothesis not supported in this setup.**

- Gate 1 (abstention ≥ B+10): **fail** (+0.0).
- Gate 2 (answerable EM within 3): pass (+0.5).
- Gate 3 (overall higher): **fail** (−0.5).
- Gate 4 (quote validity ≥95): pass (100%).

The reader already abstains on 71% of unanswerable questions. Adding the quote
contract does not improve that, and a plausible wrong span passes the gate
because the gate checks **existence and containment, not support**. Examples:

- “How many Huguenot settled in Baden?” → `4,000` with a quote about 4,000
  Huguenots across several territories.
- “How is time **not** required to solve a problem calculated?” → the model
  ignores the negation and quotes the positive statement.

The missing piece is an entailment/support check: does the quote answer this
question? That is the formal verifier's job, not the quote gate's.

Cost $0.11, zero errors.

## Why this is the right test

QAMPARI is all-answerable: the harness has no absence to catch, and the
200-question result was non-inferior but no better. SQuAD 2.0's unanswerable
questions are human-written and topically related, so the reader is tempted to
answer from parametric knowledge. That is the condition the contract is
supposed to fix.
