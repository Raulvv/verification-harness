# PROVENANCE — claims baseline

Every number quoted in the companion article *The Trust Postmortem*
(distributed separately) is a row
in this registry, with its evidence **inside this repository**. Anyone who
clones `verification-harness` can verify the claims without access to any other
repo. Migrated from a private development repository on 2026-11-09;
chain of custody (source paths + SHA-256) is in [`provenance/MANIFEST.md`](provenance/MANIFEST.md).

The only claims that cannot be replicated are the author's self-reports, fenced
in [§ Non-replicables](#non-replicables--disclosures) below.

## How to reproduce

```bash
node bench/recompute-claims.mjs     # 44 checks: every tier-1/2 value, one command
npm run verify                      # the full battery: claims + manifest + all tests
```

No network, no model calls. Covers the spend ledger (A1–A7), the Naruto result
(B4), the chain-of-custody hashes (A10), the model-size sweep (B5/B7), the
AbstentionBench official-vs-blind collapse (B19) and the SQuAD label audit
(B20). Layout: `provenance/data/` (raw data),
`provenance/sources/` (verbatim extracts of the originating reports),
`provenance/tools/` (deterministic audit scripts, migrated with input paths
adjusted `bench/results/` → `data/`).

| Tier | Meaning | What it covers |
|---|---|---|
| 1 | recomputable from `provenance/data/` | all spend/ledger numbers, Naruto result, pricing scheme |
| 2 | re-runnable deterministic tools (offline) | citation audit (`node provenance/tools/citation-audit.mjs`), seeded-error drill (`kit/bin/verify.mjs --self-test`), formal verifier (`bench/formal/`, python) |
| 3 | model-dependent experiments | sweeps, judge audits — recipe + recorded results in `provenance/sources/` and `provenance/data/` |
| 4 | private-source claims | run IDs as receipts, audited numbers in `provenance/sources/LEDGER-extract.md` |
| 5 | self-reports | not replicable by definition |

## Claims registry

### A. The bill (Act I) — tier 1, all via `node bench/recompute-claims.mjs`

| ID | Claim (canonical value) | Recorded at | Tier |
|---|---|---|---|
| A1 | API-equivalent bill **$727.90** over **1,000 commits / 31,821 assistant messages** | `provenance/data/spend.csv` | 1 |
| A2 | Tokens: output **13.1M**, cache reads **8.16B** → **623:1** | same | 1 |
| A3 | Monthly split: Sep 2026 **$695.93 (95.6%)** / Oct **$31.98 (4.4%)**, Oct = 419 commits | same | 1 |
| A4 | Top-12 commits by cost **all 2026-09-18/19**; largest **$63.31** | same | 1 |
| A5 | Subagents **35.4%** of messages, **$153.40 = 21.1%** of cost (subset of per-commit total) | same | 1 |
| A6 | Pricing scheme: Sonnet **$3.00/M in, $15.00/M out**, cache read 0.1×, cache write 1.25× — zero-residual fit on 76 single-model commits | same (regression) | 1 |
| A7 | Sonnet-labelled commits occur only in **2026-09** (81 rows) | same | 1 |
| A8 | Cost decomposition 76.6/9.4/8.3/5.8 | disclosure — see below | 1† |
| A9 | Model mix (Sonnet $635.60 / 87.3%) | disclosure — see below | 1† |

### B. The experiments (Act II) — tiers 1/3

| ID | Claim (canonical value) | Recorded at | Reproduce with | Tier |
|---|---|---|---|---|
| B1 | Hardware: Apple M4 Max, 36 GB unified | `provenance/sources/RESULTS-extract.md` § Runtime tuning | — | 3 |
| B2 | Readers: qwen3.5 4B / 9B, qwen3.8 27B | `RESULTS-extract.md`, `BENCHMARKS-extract.md` | — | 3 |
| B3 | HotpotQA setup: 100 items, distractor setting, 10 paragraphs (2 gold + 8 distractors), window held constant across arms | `BENCHMARKS-extract.md` § Model-size sweep | — | 3 |
| B4 | Naruto: **299-page** mirror, 20 questions, **7 correct**, 0 abstained | `provenance/data/naruto-golden-meta.json`, `provenance/data/naruto-batch.json` | script (A-group) | 1 |
| B5 | Sweep: closed-book **24/31/36**, plain RAG **80/80/89**, receipt **86/87/87** | `BENCHMARKS-extract.md` + `provenance/data/{crossover-100,final-arms-100}.json`, `tier-b-hotpot-300-judged.jsonl` | script (B5a–h, B7) | 1/3 |
| B6 | Latencies 0.2/0.7/1.2 · 2.4/4.7/20.3 · 6.1/**11.4**/30.4 s/q | `BENCHMARKS-extract.md` | — | 3 |
| B7 | Granite-judged receipt row **93/93/93**; Qwen 89/87 vs Granite 88/93 (27B) | `BENCHMARKS-extract.md` | — | 3 |
| B8 | MiniCheck fixture: 6/8, over-refusal (Q 33%, D 10%, DA 8%) | `LEDGER-extract.md` B58; `RESULTS-extract.md` § quote A/B judge caveat | — | 3/4 |
| B9 | 24-row judge audit: 79.2 / **16.7** / 70.8 / 37.5 / 87.5 / 95.8 / 95.8; Granite 12/12 | `RESULTS-extract.md` § Layer 3 + § Candidate judges | — | 3 |
| B10 | Re-judge: +4.2 (p=.046/.038) → +1.4 (p=.53) / +1.0 (p=.66); GLM +1.8/.40, +0.6/.82; `contains` +6.6/.003, +7.8/.0002 | `RESULTS-extract.md` § Cross-family re-judge | — | 3 |
| B11 | Quote A/B: all three prompts 90% Qwen / 100% Granite | `RESULTS-extract.md` § Does quoting change the answer | — | 3 |
| B12 | Routing gate 79 items: free 70/79; Granite 70/79, 9B 69/79, 0.8B 69/79, Jeeves 65/79 | `RESULTS-extract.md` § Sufficiency gate | — | 3 |
| B13 | Entailment gate: 65% catch / 24% false abstain; 0.765→0.755; N=300 +3.9pp, 82% @ 21.7% | `RESULTS-extract.md` § Corrections + the entailment gate | — | 3 |
| B14 | NLI sweep τ 0.05/0.50/0.95 → 0.690/0.402 · 0.750/0.471 · 0.790/0.586 | `RESULTS-extract.md` § Gate generalization + threshold sweep | — | 3 |
| B15 | Self-preference ~+21pp → ~+12pp non-reader gate | same | — | 3 |
| B16 | Crutch: +11pp 4B, **0** DeepSeek, **0** 27B | `RESULTS-extract.md` § Reader dependence | — | 3 |
| B17 | Partial-support: 2/88/98.9 · 83/6/0 · **53/16/0**; hop fix 10pp, 13/16 | `RESULTS-extract.md` § Partial-support blind spot | — | 3 |
| B18 | Contract-only control: 253/300 vs 222/300 at 6.3k vs 12.8k tok/q | `provenance/sources/STATUS-extract.md` § 9.1–9.2 | — | 3 |
| B19 | AbstentionBench: rail F1 92.7/91.1 vs naive 90.4/83.8; blind collapse to 52.7/56.9/63.3/59.0; agreement 56/64/70/80%; 16/17 | `STATUS-extract.md` § 13.3–13.4, § 13.8 | script (B19a–j) on `provenance/data/abstentionbench-judged*.jsonl` | 2 |
| B20 | SQuAD label audit: 17/36/1 of 54; rail 46/53, naive 48/53; "+7.4pp" withdrawn | `STATUS-extract.md` § 13.6 | script (B20a–d) on `provenance/data/squad54-audit.tsv` | 2/3 |
| B21 | Handoff quote "Phase 1b is closed as a methodological negative…" | `STATUS-extract.md` § 13.8 (verbatim) | — | 3 |
| B22 | Kimi flips 9.4% of gate labels; local 9B never flips | `RESULTS-extract.md` § Judge characterization | — | 3 |
| B23 | Contamination pair: HotpotQA bare ~96% ≈ oracle (N=25); private bare 9% / 87% abstain / window 91–96% (N=23) | `RESULTS-extract.md` § Hosted reader (open / PRIVATE) | — | 3 |
| B24 | B114 inflation 10–14pp; B118 4B −9.4pp, DeepSeek flat | `RESULTS-extract.md` § Reader comparison without memorization; `LEDGER-extract.md` B118 | — | 4 |
| B25 | Full-pages (~20k-token) ablation regressed `088`/`089` | `provenance/sources/CLAIMS-extract.md` context; `bench/ooh-README.md`, `bench/ARM-COMPARE-REPORT.md` L55-57 | — | 3 |

### C. The gate and the verifier (Act III) — tiers 1/2

| ID | Claim (canonical value) | Recorded at | Reproduce with | Tier |
|---|---|---|---|---|
| C1 | Gate scope comment ("Wrong verdicts over real quotes… OUT of scope — the judge's class") | `kit/lib/receipts/gate.mjs` L7-8 (this repo) | — | 2 |
| C2 | Gate checks path/quote/title/date, all-of legs | `kit/lib/receipts/gate.mjs`; `README.md` hardening note | — | 2 |
| C3 | Seeded-error drill: real PASS / wrong path REJECT / fabricated quote REJECT / wrong verdict PASS | `kit/bin/verify.mjs --self-test` | `node kit/bin/verify.mjs --self-test` | 2 |
| C4 | Quote validity **45/45** (SQuAD 2.0) and **42/42** (Musique) — quoted rows; byte-exactness attested by the gate at generation time | `provenance/sources/CLAIMS-extract.md` | `node provenance/tools/citation-audit.mjs` | 2 |
| C5 | Citation audit: answer supported **88.9% / 90.5%** (70% content-overlap heuristic); gold 100% / 97.6%; duplicates 10/45, 9/42; unanchored 2/3 | same | same | 2 |
| C6 | Mixed-absence table (73.0/74.0, 86.8/85.9, 71/69, 29/31, 72/71.5, quote validity 100%) | `bench/formal/squad2/README.md` (this repo) | recorded; run files in the private tree, not distributed | 3 |
| C7 | Huguenot + negation examples | `bench/formal/squad2/README.md` L72-75 | — | 3 |
| C8 | 4B on OOH: 24/24 answerable, **15/60 false accepts**, 0/12 partials | `bench/ARM-COMPARE-REPORT.md` L110/182-183 (this repo) | — | 3 |
| C9 | OOH 3-seed table (93.7/98.0, 86.3/95.3, false 4.7→1.0 etc.) | `README.md` § Current result (this repo) | recorded; `bench/results/` run files not distributed | 3 |
| C10 | McNemar 4–5 discordant vs 0, **p = 0.0625–0.125**; post-correction, development-informed | same | — | 3 |
| C11 | Formal vs detectors table (1.00/0.99/0/0/1.00; MiniCheck 0.72/0.24/13/75; LettuceDetect 0.21/0.21/186/66; HHEM 0.76/0.25/4/73) | `README.md` § Current formal pilot; `bench/formal/README.md` | `python -m formal.evaluate` re-runnable; detector-comparison run files under the private tree, not distributed | 2/3 |
| C12 | 0.99 exact = four partials judged `CONTRADICTION`; binary correct | `bench/formal/README.md` L115 | — | 2 |
| C13 | 160 synthetic: 80 contradicted, 0 FA, 1 FR, coverage 0.74, UB 3.7% | `bench/formal/competitive/PILOT-160-REPORT.md` | `pilot-160.jsonl` | 2 |
| C14 | CUAD: 34.5% → 7.5% → 3.0% at 21% coverage; AUPR 0.531 (base, full split) / 0.573 (large, 20-contract subset) | `bench/formal/legal/CUAD-QA-REPORT.md` | `bench/formal/legal/cuad/out/*.json` | 2/3 |
| C15 | Extractor narrow rule-based (8 ops incl. `quantified`); Z3 3-valued entailment; "the interface is the point" | `bench/formal/README.md`, `bench/formal/formal/extract.py` (this repo) | — | 2 |
| C16 | 26 natural contradicted < pre-registered 40; one auditor | `bench/formal/competitive/PRE-REGISTRATION.md` | — | 2 |

### D. Lessons

Every lesson in the article cites rows above: L1→B17/B18/C9, L2→B5/B23/B25,
L3→B23/B24, L4→E1/B9/B10/B19, L5 (memory)→§ Non-replicables. The former
L5/L6 material (receipts-not-confidence; run-the-control) moved into the
article's "What remains open" and non-claims sections (rows C1–C5, B18/B11).

### E. External (public documents)

| ID | Claim | Source |
|---|---|---|
| E1 | ALCE verifies citation support with the NLI **TRUE**, documented at **80.0%** vs human labels (120 hand-labelled pairs over 40 outputs) | ALCE (Gao, Yen, Yu, Chen — EMNLP 2023) §3.3 + Figure 3 + Appendix A; TRUE = Honovich et al. 2022 |
| E2 | Industry cost-shift cases cited in lesson 2: Revolut ~90%/10× (2,000 engineers, self-hosted GLM); Notion router ~90% lower cost at similar quality (20+ use cases); AT&T −56% cost with measured −2% production quality; Character.AI ≥33×; Sword Health 94%; Ramp ~30%; Uber −34%/−52%; Factory Router — 99% of Opus 4.7 pass rate at −20% cost, **19–50% fewer tasks finished** when pushed toward cheap models (benchmark quality; source of the "What remains open" figure) | `provenance/sources/industry-case-studies.md` — graded evidence file with per-case sources and disclaimers. All company-reported and unaudited except where the source published method/eval detail |

## Non-replicables & disclosures

**Self-reports (tier 5 — author memory/observation, no receipt exists):** the
"50-page wiki" memory fiction and its correction; motivations ("where was my
money going", "I was shocked"); the internal reasoning beats. Their falsifiable
halves are in the registry (the real corpora are B3/B4).

**Disclosures (kept by author decision, 2026-11-09):**

- **A8 cost decomposition (76.6/9.4/8.3/5.8)** — log-time per-message split. The pricing scheme is reproduced exactly (A6); the four-way split is not re-derivable because the underlying September messages rotated out of the origin message ledger. Independent recomputation over all CSV tokens under the recovered price vector gives 77.1/2.3/6.2/14.4. Method-robust facts: cache reads dominate (76–83%), output is single-digit (6–8%).
- **A9 model mix** — log-time message-level split; recomputable floor from single-model rows is $579.01 (79.5%).
- **Naruto corpus** — 299 pages per `golden.json`; the origin repo's known-issues file also says "275 docs" (internal discrepancy; the article follows golden.json).
- **Hardware** — 36 GB per `RESULTS-extract.md`; the origin ledger's B107 says 34 GB (internal discrepancy; the article follows RESULTS).
- **Sonnet naming** — the spend ledger labels the model `claude-sonnet-5`; bench reports say Sonnet 5.5; per the author both refer to Sonnet 5.5 (ledger label is the artifact).
- **B24 private runs** — B113/B118 canonical JSONLs are declared "not published"; the run IDs in `LEDGER-extract.md` are the receipts and the numbers quoted are the audited ledger values.

## Migration

22 artifacts migrated 2026-11-09 from the private origin repository; sources,
hashes and transforms in [`provenance/MANIFEST.md`](provenance/MANIFEST.md). The two
migrated audit scripts (`provenance/tools/`) differ from their sources only in
input paths (`bench/results/` → `data/`). `spend.csv` is a sanitized copy
(commit hash and subject columns blanked); all numeric values are identical to
the source, whose SHA-256 is recorded in the manifest.

## Corrections log (from the 2026-11-09 audit)

1. Receipt-row 9B latency 9.6 → **11.4** s/q (9.6 is the lighter `ours (source)` arm).
2. Citation-audit source corrected to `bench/CLAIMS.md` (originally cited to a non-existent file in the wrong repo).
3. MiniCheck "150 constructed pairs" table removed — unbacked; shown to be a confabulated echo of ALCE's Appendix A (40 outputs / 120 pairs / 80.0%). Replaced with B8 + E1.
4. Lesson 4's "80%" re-attributed to ALCE/TRUE (E1), per the author.
5. Narrative pricing line corrected to the repo price book ($3 in / $15 out); unbacked "$10/$2" and DeepSeek prices dropped.
6. "0.8B to 27B" → "the 4B to the 27B and the hosted readers" (0.8B was a gate probe).
7. Binary/Exact gloss corrected (verdict classes are 9; 3-valued entailment = ENTAILED/CONTRADICTION/UNKNOWN).
8. Extractor ops list: added `quantified` (8 ops per `bench/formal/README.md`).
9. "20k-page ablation" → "full-pages (~20k-token) ablation".
10. CUAD AUPR pairing de-conflated (0.531 = base/full split; 0.573 = large/20-contract subset).
