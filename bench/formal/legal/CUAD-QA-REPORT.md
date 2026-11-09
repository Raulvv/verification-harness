# CUAD fine-tuned span model — reader and harness

**Status:** public checkpoints evaluated on the official CUAD test split and a
fixed 20-contract subset.  
**Model:** `akdeniz27/roberta-base-cuad` — a public CUAD fine-tuned RoBERTa-base
checkpoint, not a model trained in this repository.  
**Split:** 102 test contracts, 41 categories, 4,182 questions.  
**Runtime:** ~49 minutes on Apple MPS.  
**Data and predictions:** local, gitignored.

CUAD source: <https://github.com/The-Atticus-Project/cuad>  
Paper: <https://arxiv.org/abs/2103.06268>

## Reader result — official-style span metrics

| Metric | Result |
|---|---:|
| Macro AUPR | **0.5305** |
| P@80 | **0.3083** |
| P@90 | **0.1288** |

Matching follows CUAD's Jaccard ≥ 0.5 rule. AUPR is macro-averaged across the
41 categories.

## Reader range

Full-set result for the base checkpoint. The larger checkpoints use a fixed
20-contract subset (seed 0) so the comparison finishes in a practical window.

| Checkpoint | AUPR | P@80 | P@90 | Set | Status |
|---|---:|---:|---:|---|---|
| `akdeniz27/roberta-base-cuad` | 0.531 | 0.308 | 0.129 | full 102 contracts | complete |
| `akdeniz27/roberta-base-cuad` | 0.522 | 0.389 | 0.311 | 20-contract subset (820 questions) | complete |
| official RoBERTa-large (Zenodo) | **0.573** | **0.445** | **0.338** | 20-contract subset (820 questions) | complete |
| official DeBERTa-v2-xlarge | — | — | — | 20-contract subset | downloaded, not run |

On the same 20-contract subset, RoBERTa-large improves AUPR by **+0.051**,
P@80 by **+0.056**, and P@90 by **+0.027** over the base checkpoint. Those
deltas are subset comparisons; the full-set DeBERTa-xlarge comparison is not
run.

## Public comparison

| Model | AUPR | P@80 | P@90 |
|---|---:|---:|---:|
| DeBERTa-xlarge | 47.8 | 44.0 | 17.8 |
| RoBERTa-large | 48.2 | 38.1 | 0 |
| RoBERTa-base + contracts pretraining | 45.2 | 34.1 | 0 |
| RoBERTa-base | 42.6 | 31.1 | 0 |
| **This public RoBERTa-base checkpoint** | **53.1** | **30.8** | **12.9** |

The AUPR is above the published RoBERTa-base and RoBERTa-large numbers, and
close to the 2026 case study's 53.3 category mean for the same checkpoint.
P@80 is essentially tied with RoBERTa-base (30.8 vs 31.1), and far below
DeBERTa-xlarge (44.0). P@90 is nonzero, between RoBERTa-base and DeBERTa-xlarge.

This is a **reader** result. It is not evidence that the verifier improves span
ranking. It is also not an apples-to-apples comparison: the public table is
mostly the 2021 paper baselines, our AUPR is macro-averaged, and the checkpoint
training recipe differs.

## Harness result — presence and absence

The reader returns n-best spans. The verifier chooses an operating threshold
and records a closed-corpus absence receipt when no span clears it.

| Operating point | Threshold | Precision | Recall | F1 | Coverage | No-answer false accept rate |
|---|---:|---:|---:|---:|---:|---:|
| Zero threshold | 0.0 | 0.546 | 0.977 | 0.700 | 53.3% | **34.5%** |
| Best F1 | 7.55 | 0.826 | 0.840 | **0.833** | 30.3% | **7.5%** |
| Precision-first | 9.25 | **0.900** | 0.637 | 0.746 | 21.0% | **3.0%** |

This is the harness tradeoff:

- At the model's zero threshold, it answers almost everything, but **34.5% of
  absent-clause questions get a span**.
- At the best-F1 threshold, false accepts fall to **7.5%**, with 30.3% coverage.
- At the precision-first threshold, they fall to **3.0%**, but coverage falls
  to 21.0%.

CUAD's public span metric does not measure this directly. A high AUPR can
coexist with a high no-answer false-accept rate.

## What this shows

1. **The reader is credible.** A public CUAD fine-tune lands in the
   RoBERTa-base/RoBERTa-large range on AUPR and gives a nonzero P@90.
2. **The reader is not top.** DeBERTa-xlarge remains the published ceiling,
   especially at P@80.
3. **The harness is a threshold/absence layer, not a span-ranking gain.** It
   cannot improve AUPR; it can reduce no-answer false accepts at a coverage
   cost.
4. **The reader/harness distinction is measurable.** The same checkpoint gives
   a strong span score and a dangerous zero-threshold absence rate.

## What this does not show

- It is not a CUAD leaderboard submission.
- It is not our own fine-tune.
- It is not legal advice.
- It is not a private legal pilot or a second production domain.
- It does not establish that the verifier improves reader AUPR.

## Reproduce

```bash
cd bench/formal
.venv-detectors/bin/python -m formal.cuad_qa \
  --model akdeniz27/roberta-base-cuad
```

Recompute metrics from saved predictions:

```bash
.venv/bin/python -m formal.cuad_qa \
  --from-jsonl legal/cuad/out/cuad-qa-nbest.jsonl \
  --metrics-out legal/cuad/out/cuad-qa-metrics.json
```

## Next

1. Run DeBERTa-v2-xlarge if memory permits. The 3.1 GB checkpoint is already
   downloaded under `legal/cuad/models/`, but it has not been run.
2. Add a same-checkpoint reader-only vs verifier-wrapped ablation table to the
   report (the presence table above is the first half).
3. Human-audit a sample of predicted spans and absence claims.
4. Extend the reader range to the full 102-contract split if the subset ordering
   holds.
