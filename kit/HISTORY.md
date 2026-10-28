# Historical internal baselines

Pre-OOH internal numbers, kept for provenance only. **Not** OOH results, and
not comparable across corpora: different corpus, different questions,
different methodology. The public, independently readable comparison is the
OOH citation-first benchmark — `bench/ooh-README.md` (benchmark details),
`bench/ooh-BENCHMARK.md`, `bench/ARM-COMPARE-REPORT.md`; the root `README.md`
carries the evidence summary.

## 1.0/2.0 internal baselines

One private repo, 27 golden questions / 81 points:

- **96% accuracy at ~10.5k tokens and ~13 s per question** — 6.4× cheaper,
  ~5× faster and +9 accuracy points over one coordinator model searching
  alone, with every accepted quote machine-verified (27/27).
- After the 2.0 receipt/gate fixes (tense + `Status:` receipts, multi-receipt
  legs, file-side quote scoring): **80/81 goldens · 48/48 adversarial · 43/43
  mechanical verification** on the certification run.

## Current public numbers

OOH held-out (100 items, flash-tier reader, one seed): the harness +
gate answers 27/40 answerable correct at **2%** audited wrong-shown versus
**8%** for plain RAG with citations, at 46/100 vs 55/100 coverage. See the evidence
summary in the root `README.md` and the benchmark details in
`bench/ooh-README.md`.
