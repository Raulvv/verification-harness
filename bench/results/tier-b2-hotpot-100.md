# Tier B step 2 — accuracy vs cost (100 items, shared window)

| system | model | contains | qwen | granite | s/q | tok/q | calls/q |
|---|---|---|---|---|---|---|---|
| bare | qwen3.5:9b | 20.0 | 31.0 | 35.0 | 0.7 | 76 | 1.0 |
| naive | qwen3.5:9b | 69.0 | 80.0 | 83.0 | 4.7 | 1544 | 1.0 |
| ours | qwen3.5:9b | 76.0 | 87.0 | 93.0 | 9.6 | 2043 | 1.0 |
| agentic | qwen3.5:9b | 60.0 | 73.0 | 74.0 | 4.5 | 1093 | 3.0 |
| naive27 | qwen3.8:27b | 79.0 | 89.0 | 88.0 | 20.3 | 1635 | 1.0 |
