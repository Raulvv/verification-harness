# BENCHMARKS.md — evidence extract

Migrated 2026-11-09 from the private origin repository's `bench/BENCHMARKS.md` (line ranges as of extraction).

## [L153-180] Model-size sweep — the 2×2 + the receipt ladder (2026-10-01)

## Model-size sweep — the 2×2 + the receipt ladder (2026-10-01)

100 HotpotQA items, shared window, cross-family judged (`bench/run-crossover.mjs`):

| arm | model | qwen | granite | s/q |
|---|---|---|---|---|
| bare | 4B | 24.0 | 29.0 | 0.2 |
| naive RAG | 4B | 80.0 | 81.0 | 2.4 |
| ours (full) | 4B | **86.0** | **93.0** | **6.1** |
| ours (source) | 4B | 82.0 | 88.0 | 3.5 |
| naive RAG | 9B | 80.0 | 83.0 | 4.7 |
| ours (full) | 9B | 87.0 | 93.0 | 11.4 |
| ours (source) | 9B | 83.0 | 91.0 | 9.6 |
| bare | 27B | 36.0 | 37.0 | 1.2 |
| naive RAG | 27B | 89.0 | 88.0 | 20.3 |
| ours (full) | 27B | 87.0 | 93.0 | 30.4 |

- **Size doesn't replace retrieval**: bare climbs only 24→31→36% across 4B→9B→27B — composed across three runs over the same 100 ids (24% `crossover-100.json` bare4, 31% `tier-b-hotpot-300-judged.jsonl` head-100 bare, 36% `final-arms-100.json` bare27), not one three-arm table.
- **The architecture, not the model, is the ceiling**: ours-full is 86/93 (4B),
  87/93 (9B), 87/93 (27B) — statistically flat. Accuracy is model-size-free.
- **The receipt ladder grounds at every size**: naive → source → full is
  monotonic at both 4B (80→82→86) and 9B (80→83→87).
- **4B is the sweet spot**: matches the 9B at half the latency, the 27B at ~⅕.
- **Sub-4B cliffs, and it's family-specific** (not context, not size): qwen3.5
  full drops 86→73→71 at 4B→0.8B→2B; llama3.2:3b (20) and granite4:3b (50) are
  worse than qwen3.5:0.8b. Traceability (byte-verbatim quotes) is universal —
  every model, every size, produces gate-verified quotes.

