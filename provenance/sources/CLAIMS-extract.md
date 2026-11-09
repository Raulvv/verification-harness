# CLAIMS.md — evidence extract

Migrated 2026-11-09 from the private origin repository's `bench/CLAIMS.md` (lines 1-30 as of extraction).
Source scripts migrated to `provenance/tools/` (input paths adjusted `bench/results/` → `data/`).

# Claims ledger — what the harness numbers support

2026-10-23. Consolidation rule: a number is a claim only when its labels are
clean. Public benchmark labels/judges that fail that test are withdrawn, not
re-tuned. The full audit trail is in `bench/STATUS.md` §13; the corrected item
table is `bench/squad54-audit.tsv`; the citation audit is
`bench/citation-audit.mjs`.

## Survives

| Claim | Number | Evidence | Status | Why |
|---|---|---|---|---|
| Phase 0 out-of-sample drift | rail **98.9%** vs tuned **94.4%**; naive 82.2% vs 83.9% | §13.1, 15-question private holdout | **Supported** (small n) | clean, truth-relative ledger; no benchmark judge |
| Private holdout behavior | rail 15/15 answerable, 15/15 partial declared, 15/15 unanswerable; naive 1 leak | §13.1 | **Supported** (n=15) | hand-built, non-memorizable controls |
| Phase 1a 4B arms | bare 30 / naive 65 / dense 70 / router 71 (HotpotQA, contains-gold) | §13.2-era arms | **Directional** | contains-gold, not judged; small |
| Phase 1a hosted | bare 68.0%, naive 89.3%, ours **79.3%** overall / **94.1%** shown (238/253), 47 not_found, 8 nulls | §13.2, 900 rows | **Directional** | oracle-scored, but ours is gated v45 (kimi gate), not contract-only |
| SQuAD 2.0 corrected case study | 17/54 answerable, 36/54 false-premise/unsupported; rail 11/17 + 35/36, naive 15/17 + 33/36; overall 46/53 vs 48/53 | §13.6, `squad54-audit.tsv` | **Directional** (first-pass manual) | labels repurposed from the audit; 100-item fast subset; no clean winner |
| Musique corrected case study | 17 answerable refusals = 2 direct / 4 bridge / 11 missing; answered accuracy rail 39/42 (92.9%), naive 53/54 (98.1%); appropriate 76 vs 79 | §13.5 | **Directional** (single annotator) | human audit; no judge |
| Citation quality (answered answerable rows) | rail: quote **100%** (45/45 SQuAD2; 42/42 Musique); avg **161 / 213 words**; duplicate rows **10/45** and **9/42**; multi-segment **10/45** and **39/42**; answer supported **88.9% / 90.5%**; gold supported **100% / 97.6%**; unanchored numbers 2 / 3. All answered rows: 65/65, 46/46; avg 161/198; duplicate 16/65, 10/46; answer 86.2/87.0 | `citation-audit.mjs` | **Descriptive** | deterministic; naive has no quote contract |
| Citation minimality (answerable answered) | quote **161 / 213 words** → best sentence **28 / 35 words** (17.3% / 16.4% of the quote; gold coverage 97.0% / 96.8%; 93.3% / 95.2% of rows ≥0.8); duplicate sentences **2 / 1**; minimal set **31 / 36 words** (97.8% / 97.6% ≥0.9) | `citation-minimality.mjs` | **Descriptive** | the gold-bearing sentence is ~6× shorter than the receipt; duplicates are removable |
| Minimal-receipt prototype | SQuAD 2.0: **161 → 49 words** (30.7%), answer coverage **83.0% → 83.0%** (100% retained), gold 99.7% → 99.7%, single-sentence 48.9%. Musique: **213 → 88 words** (41.5%), answer 81.0% → 80.7% (90.5% retained), gold 97.6% → 97.6%, single-sentence 7.1% | `minimal-receipts.mjs` | **Descriptive prototype** | minimal receipts preserve support; single-hop compresses ~3.3×, multi-hop ~2.4× (2–3 sentences); not yet a live run |
| Guarded post-processor, applied | SQuAD 2.0 **161 → 56** (34.7%; 43/45 minimal, 2 fallback); Musique **213 → 105** (49.3%; 38/42, 4); hosted e2e-ir **158 → 76** (48.2%; 227/253, 26); private evidence **109 → 77** (70.2%; 31/42, 11). Answer coverage unchanged where guarded (83.0/81.0/84.1/58.1%); gold 99.7/97.6/90.2/–. Single-leg 46.5/7.9/3.1/12.9% | `receipt-minimizer.mjs` | **Validated on existing outputs** | guard keeps the full quote on 2/4/26/11 rows; private 58.1% coverage is the full-quote synthesis limit, not a loss |
| Integrated guarded post-processor | `minimizeReceipt` in `assembleOneShot`/`askOneShot`, `--minimal-receipt` in `ask`; private-run **default on** (`MINIMIZE_RECEIPT=off` disables); 4 unit tests pass. Stored private holdout (30 quoted): **38 → 34 words** (89.6%; 28/30 minimal, 2 fallback); answer 55.6% → 55.4% (0.2pp, within the 1pp guard). Live 15-question holdout: answerable **15/15**, unanswerable **15/15 abstain**, partial 4/15 (stored 3; model variance); quote avg 41/34 words (holdout already short). Hosted e2e-ir still **158 → 76** (2.1×) | `kit/lib/answer/minimize.mjs`, `scripts/minimize-receipt.test.js` | **Supported / adopted in private harness** | library/`ask` remain opt-in; the guard preserves answer coverage; long quotes are the gain |

## Withdrawn

| Claim | Number | Why withdrawn |
|---|---|---|
| SQuAD 2.0 abstention P/R/F1 | rail 91.1/94.4/92.7, naive 94.0/87.0/90.4; appropriate 91.0/89.0 | `should_abstain = answers.text == []` is the SQuAD 2.0 impossible marker, not “no answer”: 17/54 are answerable and 32/54 are false-premise. The judge is also label-conditioned. Cell quarantined. |
| SQuAD 2.0 “recall +7.4pp” / “rail win” | — | The gain is six answerable over-refusals counted as correct abstentions, plus the judge label leak. Not supported. |
