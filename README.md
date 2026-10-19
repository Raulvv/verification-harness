# verification-harness

> Tools and evidence for **[The Verification Harness](the-verification-harness.md)** —
> how to measure, and trust, an abstaining QA system.

**What it is.** An evaluation harness for retrieval QA systems that *know when
they don't know*: a mechanical tri-state gate (`verified` / `unknown` /
`not_found`) with veto power over the reader, a schema-constrained judge, an
independent oracle for ground truth, and a frozen-config discipline that keeps
tuning out of the measurement. The repo ships the full article, the
retrieval-kit (the read-system the harness measures), the bench scripts, and
sha256-pinned record artifacts — so every number marked **[recomputed]**
in the article, and every cell in [`bench/BENCHMARKS.md`](bench/BENCHMARKS.md)
backed by its five pinned artifacts, can be re-derived on your machine, offline, byte-for-byte. The
audit along the way caught its own mistakes — a clobbered output file
mislabeled as a weak-reader row, a provenance column that lied, three drifting
definitions of one metric, and a judge that could not repeat itself (§4).

## Findings

Numbers, methodology and boundaries live in the
**[article](the-verification-harness.md)**; the benchmark tables live in
**[bench/BENCHMARKS.md](bench/BENCHMARKS.md)** — the short version:

- **The gate earns its keep on weak readers.** On held-out HotpotQA rows the
  frozen gate lifts a weak local reader's unknown-abstention substantially,
  at a small answerable false-abstention cost, and everything it keeps
  under `verified` is oracle-confirmed at high precision (article §3.1).
- **The gate is inert on strong readers — by design.** For a 27B/deepseek
  reader, raw output equals gated output on every axis; the harness measures
  that instead of hiding it (§3.2).
- **A fully local stack is close and cheap.** A 4B reader + 9B judge lands
  within a few points of a 27B reader's verified precision — Wilson
  intervals overlap — at a fraction of the end-to-end cost and half the
  memory (§5).
- **The judge is a dial, not a switch.** Local judges are characterized
  individually, so you can pick the cost/quality point knowingly (§3.3).
- **The partial-support blind spot is measured and unsolved.** Remove one hop
  of a two-hop question and every configuration at every size still verifies
  some partial items — audited cells measure 12.5%–56% of those verifications
  wrong (§3.5–§3.6).
- **The pattern holds on a private, non-memorizable corpus.** Questions are
  generated from this repo's own docs, which no model has memorized; §3.6
  carries the numbers for each run.

## Reproduce — three tiers

| Tier | What it does | Cost |
|---|---|---|
| **0. Offline verify** | `node verify-offline.mjs` re-derives every `[recomputed]` cell in the article from `bench/results/unified-public.jsonl` and the b121 pair, and the `bench/BENCHMARKS.md` cells **backed by** its five pinned artifacts — all sha256-pinned — checking each value against its doc's own text. No network, no keys, no models. | Free |
| **1. Local fresh inference** | Re-run the readers/judges on your own machine with Ollama (4B + 9B ≈ 10 GB resident; optional 27B ≈ 32 GB VRAM). Start from the commands in [`reproduce.md`](reproduce.md). | Free (disk + electricity) |
| **2. Hosted fresh inference** | The same runs against hosted models (DeepSeek, Kimi). Needs API keys. | Keys + a few dollars |

The full command list and the offline recomputation snippets live in
[`reproduce.md`](reproduce.md).

## CI

![CI](https://github.com/Raulvv/verification-harness/actions/workflows/offline.yml/badge.svg)

Two jobs, both free-tier: the **offline verify** battery (Tier 0, cell-exact
against the article) and a **privacy lint** (fails the build if private-corpus
patterns ever enter the tree). The model tiers are manual by policy — CI never
calls a model.

## Read this first: stored outputs vs. fresh inference

The committed `bench/results/unified-public.jsonl` holds **recorded
measurements** — outputs of
actual past runs, pinned by sha256. Tier 0 proves the numbers *derive
correctly from those records*; it does **not** re-run any model. Tiers
1–2 re-run the models: they measure the systems *again* and will land near —
not exactly on — the stored values (models are nondeterministic; the hosted
judge flips about 1 in 10 labels across repeats while the local judge is
deterministic — measured in the article, §6.5 — so run each fresh
configuration **3 times** and read the spread). Treat stored outputs as the
source of record for published cells, and fresh runs as replication.

## Provenance and privacy

Every record in the artifact is either a held-out **HotpotQA** row or a row
generated from **this repository's own documentation**. No third-party or
internal corpus ships with this repo; the export is gated by the privacy lint.

## License

MIT for code · CC-BY-4.0 for prose (article, docs, recorded outputs).
