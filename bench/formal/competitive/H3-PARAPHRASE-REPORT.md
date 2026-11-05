# H3 paraphrase test — report

**Verdict: the rule-based H3 spec parser is phrase-locked. The reducer is not
the problem.** The H3 83/83 result holds only for the frozen H3 phrasings. A
schema-validated extractor closes the gap on these development sets (30/30
reviewed, 3/4 blind, H3 100/100), but a clean v2 set is still required.

## Design

30 reviewed paraphrases plus 5 blind items authored by the reviewer. The test
asks whether the deterministic reducer can be reached from wording other than
the H3 templates.

| File | Rows | SHA-256 |
|---|---:|---|
| `private/hard-h3-paraphrase-30.jsonl` | 30 | `11d21c991f2d8d1f2a7aa7608952b7539f39dfe41662fe7eca2e3e20d0edb840` |
| `private/hard-h3-paraphrase-blind.jsonl` | 5 | `9d7ca0d4111f5564b8205ff338e1739d9d1b02fb1f944b599ad3b69d93b5b285` |
| `private/hard-h3-paraphrase-35.jsonl` | 35 | `c848158795ec27b561ed72cbf401813fdd556f3e4269aca3361d031de3005cae` |

The 30: 15 keep an H3 target (same gold), 15 use a new target. Each row carries
an explicit spec; gold is computed from the spec against the table, never typed.
The 5 blind items were written by the reviewer before seeing the 30 review form.
Four are answerable; one is an ambiguity probe.

Pre-registered thresholds:

- spec coverage on the reviewed 30: **≥27/30**
- routed correctness: **30/30**
- false routing: **0**

## Result

| Group | Routed | Missed | Routed correct |
|---|---:|---:|---:|
| Reviewed 30 | 18 | 12 | 18/18 |
| Blind answerable | 0 | 4 | — |
| **Total answerable** | **18** | **16** | **18/18** |

Coverage on the reviewed set is **60%**, below the 20/30 line that the
pre-registered rule calls a template demo rather than a capability.

Every item that reached the reducer was answered correctly. There was no
reducer error, no wrong gold, and no false routing. The entire loss is spec
extraction.

## Extractor follow-up

The fix was not more regexes. `bench/lib/spec-extract.mjs` asks the model for a
reducer spec, validates it against the declared schema (fields, ops, filter ops,
`k`, exact occupation titles), and only then runs the deterministic reducer. A
refusal never shows a number; a `reader` classification falls through to the
normal reader path.

| Set | Parser only | With extractor |
|---|---:|---:|
| Reviewed 30 | 18/30 | **30/30** |
| Blind answerable 4 | 0/4 | **3/4** |
| H3 100 | 83/100 | **100/100** |

The H3 regression: 68/68 answerable from deterministic specs, 15/15 partials
back on the reader, 17/17 ambiguity items refused (16 explicit
`NEEDS_SPECIFICATION`/`NOT_FORMALIZABLE`, one reader `NOT FOUND` for
state-level pay). Cost: $0.0764 for the 100-question run, including the 15
reader answers. One seed, one reader (DeepSeek V4.1 Flash).

The one blind miss is B1: “earn the most in the next year”. The extractor
refused because “next year” is outside the 2023 snapshot. Under the frozen
answerable label it counts as a miss; under a strict reading it is the correct
refusal. That is a specification disagreement, not a wrong number.

**These are development sets for the extractor.** The 30 were written with the
parser’s failures visible, and the prompt was adjusted after the H3 partial
regression. The 3/4 blind result is the only semi-independent signal, and n=4.
A fresh v2 set, written after this report, is the clean test.

## What the missed constructions have in common

| Item | Construction | Shape |
|---|---|---|
| p001 | “grow faster than … and pay more than …” | comparative synonyms |
| p003 | “Count the occupations whose … is above …” | imperative verb |
| p005 | “Among …, how many …” | leading clause before the count |
| p006 | “which one has the highest” | pronoun insertion |
| p007 | filters moved after the superlative | clause order |
| p011 | “Add up …” | imperative verb |
| p013 | “Total the …” | imperative verb |
| p014 | “Rank the three …” | imperative verb |
| p016 | “Name the three …” | imperative verb |
| p019 | “How much larger is X than Y?” | comparative, not “how many more” |
| p024 | “that do not require” | plural agreement |
| p028 | “at exactly 9%” | preposition |
| b001 | education-equality in natural prose | schema combination |
| b002 | “projects the best growth” | schema combination |
| b003 | “most employment by 2033” | derived field |
| b004 | “top 3 jobs by earnings … positive trend” | k, field and filter paraphrased |

Two distinct gaps are mixed here:

1. **Lexical/ordering** — the same seven shapes, worded differently.
2. **Schema reach** — natural questions ask for education equality, 2033
   employment, or an employment-change filter. The reducer supports all three,
   but the parser has no route to them.

## Interpretation

- The deterministic reducer is sound: 18/18 correct when reached.
- The regex spec parser generalizes to H3-family phrasings, not to natural
  language.
- The H3 **83/83** number must be stated as “on the frozen H3 phrasings”. It is
  not evidence of a general structured-claim capability.
- Adding regexes for these 16 would overfit the test and prove nothing. The
  extractor now emits the existing reducer spec, validated against a declared
  schema before the reducer runs; the reducer stays authoritative.
- The extractor is a router as well as a translator: it must send single-fact
  and absence questions to the reader. Its first version refused 12/15
  partials; explicit reader examples and a JSON-only system message fixed that.
  This is a real failure mode to test in v2, not a one-off.

## What was not claimed

- No reader-fallback run on the paraphrase set. On full-table questions the
  fallback is a six-document reader and would not recover the answer; this was
  not measured. The H3 partial regression is the only reader-path measurement.
- The 5 blind items are a sanity check, not a statistical sample.
- The reviewer confirmed each blind item’s reading, but B1 and B3 were revised
  during that confirmation, so they are not fully independent authoring.

## Reproduce

```bash
.venv/bin/python competitive/build_h3_paraphrase.py
.venv/bin/python competitive/validate_h3_paraphrase.py \
  --input competitive/private/hard-h3-paraphrase-30.jsonl \
  --input competitive/private/hard-h3-paraphrase-blind.jsonl \
  --out competitive/private/hard-h3-paraphrase-35.jsonl
node competitive/verify_h3_aggregate.mjs \
  competitive/private/hard-h3-paraphrase-35.jsonl

# With the extractor (model call for non-template questions)
node bench/arm-compare.mjs \
  --questions bench/formal/competitive/private/hard-h3-paraphrase-35.jsonl \
  --corpus bench/corpus/ooh-v1 --arms DA --seeds 1 --k 6 \
  --max-tokens 1200 --doc-mode excerpt --no-support \
  --aggregate table --extract on \
  --out bench/results/hard-h3-paraphrase-35-extract.jsonl
```
