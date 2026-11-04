# Competitive pilot — 160 public OOH claims

**Status:** larger public pilot; still synthetic and not human-audited.  
**Claim set:** `competitive/pilot-160.jsonl`  
**Systems:** formal verifier, MiniCheck (Ollama), LettuceDetect (ModernBERT base), HHEM-2.1-Open.

## Claim set

160 public claims from the public 100 questions:

| Slice | Claims | Shape |
|---|---:|---|
| Value claims | 80 | 40 supported + 40 contradicted |
| Absence claims | 80 | 40 absent + 40 contradicted |
| **Total** | **160** | 80 supported/absent + 80 contradicted |

Value categories: 40 lookup, 14 difference, 8 compare, 12 extremum, 6 sum.
Evidence is the relevant page text or the public table, truncated to 6,000
characters. No private labels.

## Human audit

All 160 claims were audited through the one-question gold form. The human labels
match the provisional labels **160/160**:

- 40 supported
- 80 contradicted
- 40 absent

This is one auditor, no second rater. The public labels are in
`pilot-160-human.jsonl`.

## Natural-reader slice (private, local)

An 80-claim slice of cached reader answers was also human-audited. After
confirmed label corrections, formal scored **1.00 binary, 0 false accepts, 0
false rejects, 1.00 coverage**; MiniCheck 0.76 / 3 / 16; LettuceDetect 0.21 /
48 / 15; HHEM 0.80 / 1 / 15. The natural slice found three real formal issues
(false sub-claim, verbose arithmetic, false abstention), now fixed. Details are
in the local, gitignored `private/NATURAL-AUDIT-REPORT.md`.

## Results — all 160 claims

| System | Binary | Exact | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **0.99** | 0.74 | **0** | **1** | 0.74 |
| MiniCheck | 0.84 | 0.60 | 3 | 22 | 1.00 |
| LettuceDetect | 0.46 | 0.46 | 66 | 20 | 1.00 |
| HHEM-2.1-Open | 0.81 | 0.56 | 9 | 22 | 1.00 |

## Results — value claims only (80)

| System | Binary | False accepts | False rejects |
|---|---:|---:|---:|
| **Formal** | **0.99** | **0** | **1** |
| MiniCheck | 0.70 | 2 | 22 |
| LettuceDetect | 0.54 | 17 | 20 |
| HHEM-2.1-Open | 0.61 | 9 | 22 |

Formal's one false reject is the top-coded Physicians maximum: the winner is
entailed, but the exact `$239,200` is `UNKNOWN` because the source says “equal to
or greater than.”

## Results — absence claims only (80)

| System | Binary | Exact | False accepts | Coverage |
|---|---:|---:|---:|---:|
| **Formal** | **1.00** | 0.50 | **0** | 0.50 |
| MiniCheck | 0.99 | 0.50 | 1 | 1.00 |
| LettuceDetect | 0.39 | 0.39 | 49 | 1.00 |
| HHEM-2.1-Open | 1.00 | 0.50 | 0 | 1.00 |

Formal abstains (`INCOMPLETE`) on the 40 contradicted absence claims, so its
coverage is 0.50 but its binary accuracy is 1.00. HHEM and MiniCheck predict
“not supported” for both absent and contradicted claims, so their binary
accuracy is high but exact accuracy is 0.50. LettuceDetect accepts 49 of the 80
absence claims as supported, which is the most dangerous failure mode.

## HHEM threshold sensitivity (value claims)

| Threshold | Binary | False accepts | False rejects |
|---:|---:|---:|---:|
| 0.5 | 0.61 | 9 | 22 |
| 0.8 | 0.62 | 2 | 28 |
| 0.9 | 0.57 | 1 | 33 |

## Runtime

| System | 160 claims | Per claim | Cost |
|---|---:|---:|---:|
| Formal | 0.25 s | ~1.6 ms | $0 |
| MiniCheck (Ollama) | 106.6 s | ~0.67 s | $0 |
| LettuceDetect (ModernBERT base) | 34.1 s | ~0.21 s | $0 |
| HHEM-2.1-Open | 28.7 s | ~0.18 s | $0 |

## Preliminary conclusions

1. **Formal remains the only system with zero false accepts on value claims and
   zero false accepts on absence claims.** It is also ~100× faster than the
   local detectors.

2. **The absence slice exposes the biggest detector weakness.** LettuceDetect
   accepts 49/80 absence claims as supported; MiniCheck accepts 1; HHEM accepts
   0 at 0.5. A general detector has no schema-level absence semantics.

3. **MiniCheck is conservative.** It has 2 false accepts and 22 false rejects on
   value claims. It is a prose-support signal, not a structured verifier.

4. **LettuceDetect is not a numeric verifier.** It misses subtle numeric
   changes and over-accepts absence claims.

5. **HHEM is threshold-dependent.** At 0.8 it cuts value false accepts from 9 to
   2, but false rejects rise from 22 to 28; at 0.9 it reaches 1 false accept and
   33 false rejects.

6. **The strong claim is still not earned.** This is a larger public pilot, but
   it is still synthetic, single-run, and not human-audited. The natural reader
   error slice and audit are the next step.

## Caveats

- 160 claims, one public corpus, one run.
- Contradicted variants are deliberate perturbations, not natural reader errors.
- Evidence truncated to 6,000 characters.
- Human-audited by one auditor; no second rater or inter-annotator agreement.
- Per-category counts are small (compare 8, sum 6).
- This is not a final leaderboard.

## Reproduce

```bash
cd bench/formal
.venv/bin/python competitive/build_pilot_160.py
.venv/bin/python -m formal.competitive \
  --claims competitive/pilot-160.jsonl \
  --detector competitive/detectors/minicheck-160.jsonl \
  --detector competitive/detectors/lettucedetect-160.jsonl \
  --detector competitive/detectors/hhem-160.jsonl
```
