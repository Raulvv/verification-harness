# H3 v2 clean test — report

**Verdict: 6/10, with two confident wrong answers.** The development sets
(30 reviewed paraphrases, H3 100) pass; a fresh 10-question set written after
the extractor was frozen exposes semantic failures that schema validation
cannot catch.

## Design

Ten questions written by the reviewer after the extractor and prompt were
frozen. The set was authored before the run, hashed, and not edited afterwards.

```text
sha256 cc6b060ff95135608e277ebaecde34309441c2334b450c983d9bb6050481dbc8
```

Composition: 5 answerable (2 reducer, 1 reader point, 2 schema gaps) and 5
abstention traps. One seed, DeepSeek V4.1 Flash, `--aggregate table
--extract on`. Cost: $0.0042.

## Result

| # | Question | Route | Outcome |
|---|---|---|---|
| 1 | beat inflation at 4% | extractor: count growth > 4 | **wrong: 25** |
| 2 | most annual openings by 2033 | extractor: max openings | correct |
| 3 | 5 zero-experience jobs by pay | extractor: refusal | safe miss (schema gap) |
| 4 | debt repayment advice | parse failure → refusal | correct |
| 5 | 2 worst by projected growth | extractor: top-k growth | **wrong: the 2 best** |
| 6 | worst openings under $100k | extractor: min openings | correct |
| 7 | top 3 openings require education? | parse failure → refusal | correct |
| 8 | top 3 pay require education? | parse failure → refusal | correct |
| 9 | carpenters growth above 5%? | reader | correct (No, 4%) |
| 10 | negative change: most and least pay | parse failure → refusal | safe miss (compound) |

- Answerable: 3/5. Ambiguity/traps: 3/5.
- Two false accepts, both on traps.
- Five refusals; four of those came from JSON parse failure, not a deliberate
  classification.

## Post-fix development re-run

After the grounding, ordering, and JSON-budget fixes, the same ten were rerun.
This is **development, not a clean result** — the failures drove the fixes.

| Metric | Before | After |
|---|---:|---:|
| Correct | 6/10 | **8/10** |
| Answerable | 3/5 | 3/5 |
| Traps refused | 3/5 | **5/5** |
| False accepts | 2 | **0** |
| JSON parse failures | 4/10 | **0/10** |

- “Beat inflation” now refuses: no vocabulary entry for inflation.
- “2 worst” now sorts ascending and the rank-2 tie returns
  `NEEDS_SPECIFICATION` from the reducer.
- The two remaining answerable misses are the known schema gaps
  (`work_experience`, compound max+min). They refuse safely.
- Cost rose to $0.0144 because the router now gets 4,000 tokens; the old 700
  budget was entirely consumed by hidden reasoning and returned empty content.

The clean claim still requires a fresh v3 set written after these fixes.

## The two dangerous failures

### 1. Silent substitution of a measure

“How many of the jobs would beat inflation at 4%?” produced:

```json
{"op":"count","field":"outlook_pct","filters":[{"field":"outlook_pct","op":">","value":4}]}
```

Answer: **25**. The schema is valid; the meaning is wrong. The table measures
employment growth, not real wage growth. Validation checks shape, not whether
the question entails the chosen field.

### 2. Polarity inversion

“Give me the 2 worst jobs based on projected growth” produced a `topk` spec and
returned:

```text
1. Information Security Analysts — 33%
2. Actuaries — 22%
```

Those are the two **best** growth occupations. `topk` only sorts descending;
there is no bottom-k or `order` field. The rank-2 tie (−5% held by two
occupations) was also ignored.

## What worked

- Items inside the declared schema: 2/2 aggregates and 1/1 reader point.
- The reducer was never wrong when it ran.
- Refusals showed no number. No answerable item produced a fabricated value.
- `annual openings` was correctly distinguished from 2033 employment (item 2),
  the sharpest semantic test in the set.

## Router reliability

**4/10 questions returned no JSON on both attempts.** The fallback refusal
masked this here, but on an answerable question it is a silent coverage loss.
The router’s structured-output rate is 6/10, not 10/10.

## Diagnosis and required fixes

| Failure | Fix |
|---|---|
| inflation → employment growth | declare a field dictionary; reject undeclared measures instead of mapping them |
| “worst” → top-k descending | add `order`/`bottomk`; require “worst” to sort ascending |
| tie at rank 2 ignored | refuse when the cut is tied, as the top-k guard already does |
| work experience unsupported | add `work_experience` to the schema (the corpus states it) |
| compound max+min | add a multi-op spec or refuse explicitly |
| boolean over top-k | add a predicate/aggregation layer or refuse explicitly |
| 4/10 no JSON | structured-output mode, stronger retry, or a smaller schema prompt |

The semantic substitution is the hard one. A schema can reject unknown fields;
it cannot know that “inflation” is not “employment growth” unless the field
dictionary says so and the extractor is required to ground each field in a
declared synonym.

## Rules for the next round

- Do not patch against v2. These ten items are a failure record.
- Fixes are validated on a fresh v3 set authored after the changes.
- Do not pool v2 with H3 or the paraphrase sets; they are development sets.
- The clean claim remains: the deterministic reducer is sound; the extractor is
  not yet safe on natural language.

## Reproduce

```bash
.venv/bin/python competitive/validate_h3_paraphrase.py \
  --input competitive/private/hard-h3-v2-10-frozen.jsonl

node bench/arm-compare.mjs \
  --questions bench/formal/competitive/private/hard-h3-v2-10-frozen.jsonl \
  --corpus bench/corpus/ooh-v1 --arms DA --seeds 1 --k 6 \
  --max-tokens 1200 --doc-mode excerpt --no-support \
  --aggregate table --extract on \
  --out bench/results/hard-h3-v2-10-seed0.jsonl
```
