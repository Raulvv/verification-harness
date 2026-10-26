# OOH test submission

The 100 test **questions** are public: `bench/ooh-test-questions.jsonl`.
The 100 test **labels** (condition, gold, evidence, sources) are private and
must not be published or used for training.

## Run

1. Use `bench/ooh-test-questions.jsonl` and the public corpus
   (`bench/corpus/ooh-v1/`) or the table (`bench/ooh-table-v1.md`).
2. Run your system; do not use the private labels.
3. Emit one JSON object per line, one row per test id:

```json
{"id":"test-001","answer":"...","notFound":false,"quote":"...","legs":[{"title":"...","doc":"...","quote":"..."}],"coverage":{"candidates":46,"expected":46,"complete":true}}
```

Required: `id`, `answer`, `notFound`. Recommended: `quote`, `legs`, `coverage`,
`mode`, `tokens`, `seconds`.

- `answer` is the final answer text.
- `notFound` must be true for an honest abstention.
- `quote`/`legs` are the receipt; byte-verbatim quotes are preferred.
- `coverage` is required for aggregation/global answers; state the candidate
  count and whether the set was complete.

## Scoring

The private scorer is `bench/ooh-score-v2.py` and the rule is documented in
`bench/ooh-README.md` (helpful abstention, no external knowledge). The scorer
is run by the maintainer; do not submit labels.

## Submission

Open an issue in the repository with:
- the output JSONL;
- system/model/retriever and commit;
- context mode (table or 48-page window);
- cost/latency per question.

There is no public leaderboard yet. The public dev set
(`bench/ooh-dev-aggregation.jsonl`, 14 items) is for iteration; the test is
held out.

## Rules

- Do not train on the test questions or labels.
- Do not publish the test labels.
- Do not use external/historical knowledge for unanswerable items.
- Report the context mode and model honestly; label proxies as proxies.
