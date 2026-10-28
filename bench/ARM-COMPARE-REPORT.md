# Arm comparison — held-out report

Aggregate only. Raw held-out outputs, labels, audit sheets, and second-rater
results are private. Hashes commit to the exact files used.

## Provenance

- Run code: `2e0f500` (v1.1.8) — same K=3 window, D-gate.
- Scorer: `1d4c16c` (v1.1.11) + v2 label/scorer fixes.
- Label file v2: `c0a0a8e38de7e3be8f213892b66ad4e43db0f854605f5896975860305a6d7081`
- Held-out output: `46de107ab35c03468f6fbe16115936175950c7a70e315bced68f228f4fcea49e`
- Filled v2 audit sheet: `b11d2b5b5d7c04670c1ec2d67197a22d49d1bd35b56d4c099e3b2db8d2a7ce4a`
- Second-rater results: `9516baecb9b84e5543d4a43e334b6d03f0738e8caa250445f96690ebb0a8b47e`
- Config hash (post hoc): `0d563d0054fed50300665e43eb53e3922cd7b3a5317830c1939ef79872287b03`
- Not pre-registered; one seed; n=100. Treat intervals as descriptive.

## Label correction

Four partial labels included an unasked “annual average openings over the
decade” part: `test-022`, `test-052`, `test-055`, `test-093`. The v2 label
file removes that part. Two further flips were scorer phrasing (“do not
provide/state”); the scorer now recognizes them. OOH headline re-scores:
table **100/100**, pages **99/100**.

## Pre-fix / post-fix / post-audit

| Stage | A | B | C | D |
|---|---:|---:|---:|---:|
| Pre-fix false accept | 94% | 14% | 8% | 10% |
| Post-v2 false accept | 92% | 8% | 3% | 2% |
| Post-audit wrong-shown | — | **8% [4–15]** | **3% [1–8]** | **2% [1–7]** |

The audit covers every B/C/D wrong-shown row in v2: 18 unique answers,
5 scorer artifacts, 13 genuinely wrong, 0 unsure.

## Post-audit per condition

| Arm | Answerable correct | Answerable wrong | Answerable abstain | Unanswerable correct | Unanswerable wrong | Partial correct | Partial wrong | Partial abstain | Coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B RAG-cite | 27/40 | 6 | 7 | 38/40 | 2 | 20/20 | 0 | 0 | 55/100 |
| C RAG-cite + MiniCheck | 20/40 | 1 | 19 | 38/40 | 2 | 5/20 | 0 | 15 | 28/100 |
| D harness + gate | 27/40 | 1 | 12 | 40/40 | 0 | 17/20 | 1 | 2 | 46/100 |

D and B tie on answerable correct. D shows **1** wrong answer vs B's **6**.
D partial is **17/20**, not 7 wrong. C buys its 3% with the lowest coverage.

## Paired tests

All arms answer the same 100 items. Exact McNemar on audited wrong-shown:

- B vs D: discordant 7/1, **p = 0.070**
- C vs D: discordant 3/2, **p = 1.000**
- B vs C: discordant 7/2, **p = 0.180**

No pairwise separation at 0.05.

## Coverage normalized to the reachable ceiling

The ceiling is ~52 (32 reachable answerable + 20 partials):

- D: 46/52 = **88%**
- C: 28/52 = **54%**
- B: 53/52 = **102%** — B answers one unreachable item, so its raw coverage
  includes a wrong answer.

## Cost and latency

The held-out run recorded per-answer wall time but **not** token usage or
memory, and this report aggregates neither. No per-arm token, second, or GB
cost is claimed. `bench/ooh-BENCHMARK.md` lists cost as a benchmark metric;
a future run should capture tokens and seconds per question for each arm so
the arms can be budgeted against each other.

## Correct-row sample and second rater

A local different-family model (`llama3.1:8b`) re-judged:

- 74 sampled correct rows (25 B, 24 C, 25 D): **74/74 YES**, no false-positive
  candidates found in the sample.
- The 18 wrong-shown rows: agreement with the human audit **12/18**
  (B 5/10, C 3/4, D 4/4). The model is lenient; this is a weak second check,
  not a replacement for the human audit.

## Reading the table

- **Coverage** is shown / n; **false accept** is the fraction of all rows.
  Per-condition percentages are fractions of that condition's rows.
- Intervals are Wilson 95%. D 2%, C 3%, and B 8% overlap; no separation claim.
- B's pooled “correct” mixes answers and abstentions; use the per-condition
  columns.
- The 4B pilot is a weak-reader warning, not product evidence.
