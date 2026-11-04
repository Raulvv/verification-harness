# Competitive pilot — 50 public OOH claims

**Status:** preliminary, local, no API cost.  
**Claim set:** `competitive/pilot-50.jsonl`  
**Systems:** formal verifier, MiniCheck (Ollama), LettuceDetect (ModernBERT base), HHEM-2.1-Open.

## Claim set

50 public OOH claims, built from public questions and the public table:

| Category | Claims | Shape |
|---|---:|---|
| lookup | 16 | 8 supported + 8 contradicted |
| difference | 8 | 4 supported + 4 contradicted |
| compare | 8 | 4 supported + 4 contradicted |
| extremum | 8 | 4 supported + 4 contradicted |
| count | 4 | 2 supported + 2 contradicted |
| sum | 2 | 1 supported + 1 contradicted |
| absence | 4 | 2 absent + 2 contradicted |

Evidence is the relevant OOH page text (or the public markdown table for global
aggregates), truncated to 6,000 characters. No private labels are used.

## Results at threshold 0.5

| System | Binary accuracy | Exact accuracy | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **1.00** | **0.96** | **0** | **0** | 0.96 |
| MiniCheck | 0.70 | 0.66 | 0 | 15 | 1.00 |
| LettuceDetect | 0.48 | 0.48 | 13 | 13 | 1.00 |
| HHEM-2.1-Open | 0.62 | 0.58 | 5 | 14 | 1.00 |

HHEM threshold sweep:

| Threshold | Binary accuracy | False accepts | False rejects |
|---:|---:|---:|---:|
| 0.5 | 0.62 | 5 | 14 |
| 0.8 | 0.66 | 1 | 16 |
| 0.9 | 0.64 | 0 | 18 |

## Per-category

| Category | Formal | MiniCheck | LettuceDetect | HHEM |
|---|---|---|---|---|
| lookup | 16/16 | 16/16 | 10/16 | 13/16 |
| difference | 8/8 | 4/8 | 4/8 | 4/8 |
| compare | 8/8 | 4/8 | 4/8 | 4/8 |
| extremum | 8/8 | 4/8 | 1/8 | 4/8 |
| count | 4/4 | 2/4 | 2/4 | 2/4 |
| sum | 2/2 | 1/2 | 1/2 | 0/2 |
| absence | 4/4 | 4/4 | 2/4 | 4/4 |

`Formal` binary is 1.00; exact is 0.96 because the two contradicted absence
claims return `INCOMPLETE` (the answer asserts a value for a field outside the
snapshot) rather than `CONTRADICTION`.

## Runtime

| System | 50 claims | Per claim | Cost |
|---|---:|---:|---:|
| Formal | 0.19 s | ~4 ms | $0 |
| MiniCheck (Ollama) | 45.3 s | ~0.91 s | $0 |
| LettuceDetect (ModernBERT base) | 12.0 s | ~0.24 s | $0 |
| HHEM-2.1-Open | 9.7 s | ~0.19 s | $0 |

Local machine: Apple M4 Max, 36 GB RAM. No API calls.

## Preliminary conclusions

1. **Formal wins the structured subset.** It is the only system with zero false
   accepts across lookup, difference, compare, extremum, count, sum and absence.
   It also runs ~4 ms/claim, roughly 50–200× faster than the local detectors.

2. **MiniCheck is conservative, not wrong.** It has zero false accepts but 15
   false rejects. It is perfect on single-page lookup claims and fails on
   derived/aggregate/superlative claims (“the difference is …”, “X has the
   highest …”, “6 occupations”). It is a good **prose-support** signal, not a
   structured verifier.

3. **LettuceDetect is span-level, not numeric.** It misses subtle numeric
   changes (e.g. 74,690 vs 73,690; 172,210 vs 171,210; 7% vs 8%) and rejects
   many aggregate/superlative claims. Its 13 false accepts and 13 false rejects
   make it unsuitable as the sole verifier for structured claims.

4. **HHEM is calibrated but threshold-dependent.** At 0.5 it has 5 false
   accepts; at 0.9 it has 0 false accepts but 18 false rejects. It cannot
   verify arithmetic/aggregation and is not deterministic in the way the formal
   layer is.

5. **The gap is real.** No general detector matched the formal layer on
   structured claims. The detectors are complementary: NLI for prose support,
   formal for arithmetic/aggregation/absence.

## Caveats

- 50 claims, one public corpus, one run.
- The contradicted variants are deliberate single-field perturbations, not
  naturally occurring model errors.
- Evidence was truncated to 6,000 characters; this may disadvantage detectors
  on multi-page claims.
- No human audit yet.
- This is a pilot, not a final leaderboard.

## Reproduce

```bash
cd bench/formal
.venv/bin/python competitive/build_pilot.py
.venv/bin/python -m formal.competitive \
  --claims competitive/pilot-50.jsonl \
  --detector competitive/detectors/minicheck.jsonl \
  --detector competitive/detectors/lettucedetect.jsonl \
  --detector competitive/detectors/hhem.jsonl
```

Detector runners:

```bash
.venv/bin/python competitive/run_minicheck.py --input competitive/pilot-50.jsonl --output competitive/detectors/minicheck.jsonl
.venv-detectors/bin/python competitive/run_lettucedetect.py --input competitive/pilot-50.jsonl --output competitive/detectors/lettucedetect.jsonl
.venv-detectors/bin/python competitive/run_hhem.py --input competitive/pilot-50.jsonl --output competitive/detectors/hhem.jsonl
```
