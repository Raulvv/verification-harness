# Pre-registration — competitive verification claim

**Status:** frozen for the next replication.  
**Calibration run:** `pilot-160.jsonl` (public synthetic pilot).  
**Final evidence:** a natural-reader-error set plus human audit, not the
calibration run alone.

## Claim under test

On a frozen, human-audited set of **closed structured claims** with a declared
schema, the formal verifier achieves **0 false accepts at ≥95% coverage**,
while general detectors trade false accepts for false rejects. On naturally
occurring reader errors, the formal layer catches structured errors that NLI
misses; the combined router improves over either alone.

We do **not** claim general NLI, open-world absence, or legal advice.

## Primary endpoint

**False accepts on contradicted value claims.**

- Unit: one claim.
- Gold: `contradicted`.
- False accept: system says `supported`.
- Primary comparison: formal verifier vs each detector at its pre-registered
  threshold.
- Minimum: 40 contradicted value claims; target 80+.
- Report exact 95% upper bound for zero false accepts.

## Secondary endpoints

1. False accepts on contradicted absence claims.
2. Binary accuracy (supported vs not supported).
3. Coverage (not abstained/unknown).
4. False rejects on supported claims.
5. Exact category accuracy where the system provides categories.
6. Per-category results (lookup, difference, compare, extremum, count, sum,
   absence).
7. Risk–coverage curve.
8. Cost-weighted error with **false accept = 10× false reject**.
9. Latency and cost per claim.

## Claim set

- **Calibration:** `pilot-160.jsonl` — 160 public claims (80 value, 80 absence).
- **Final:** a new natural-reader-error set built from reader outputs, not
  synthetic perturbations.
- Minimum final size: 160 claims; target 300.
- At least 30 claims per value category where a per-category claim is made.
- At least 80 contradicted value claims for the primary endpoint.
- No private labels; labels derived from the public table and audited.

## Evidence policy

- Same evidence for every system.
- Lookup: the relevant page text.
- Difference/compare: both pages.
- Aggregate: the public table or all candidate pages.
- Absence: the declared corpus page(s).
- Truncation: 6,000 characters primary; 2,000 and full as sensitivity.
- No system gets a better retrieval window than another.

## Systems and thresholds

| System | Version | Primary threshold |
|---|---|---|
| Formal verifier | repo commit | n/a |
| MiniCheck | `bespoke-minicheck` via Ollama | binary Yes/No |
| LettuceDetect | `KRLabsOrg/lettucedect-base-modernbert-en-v1` | any span → not supported |
| HHEM-2.1-Open | `vectara/hallucination_evaluation_model` | 0.5 |
| HHEM sensitivity | same | 0.8, 0.9 |
| Optional Lynx | pinned revision | model default |
| Optional cloud/Luna | pinned API version | provider default |

No threshold tuning on the final set. Report all pre-registered thresholds.

## Analysis plan

- Paired **McNemar** for binary accuracy and false accepts.
- Bootstrap 95% CIs (10,000 resamples).
- Exact upper bound for zero false accepts.
- Per-category results with Holm correction for multiple comparisons.
- Risk–coverage curve.
- Cost-weighted error at the pre-registered 10:1 ratio.
- Human audit: 100% of contradicted claims; 20% of supported claims; second
  rater on a subsample; Cohen’s kappa.

## Exclusions

- No exclusions after seeing results.
- Ambiguous claims are resolved before the run; if unresolved, they are
  `NEEDS_SPECIFICATION` and excluded from the primary endpoint, with the count
  reported.
- Open-world absence claims are out of scope.
- Legal claims require a separate legal pilot and expert review.

## What would falsify the claim

- Any false accept on a contradicted value claim in the audited set.
- Coverage below 95% on the primary value slice.
- No improvement over the best detector on the primary endpoint.
- Human auditors disagree with the formal receipt in >10% of audited claims.
- The natural-error slice behaves materially worse than the synthetic slice.
- The second domain fails the same protocol.

## Freeze

- Claim set hash: recorded in the run report.
- Evidence hash: recorded.
- Model revisions: recorded.
- Prompt templates: recorded.
- Analysis script: committed.
- No changes after the first run except documented bug fixes that are re-run
  on the full set.
