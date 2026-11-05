# ALCE / QAMPARI citation-quality pilot

This directory tests the citation claim outside OOH, on ALCE's QAMPARI
citation benchmark. It is a pilot, not a leaderboard submission.

## Data

ALCE releases pre-retrieved passages, so no Wikipedia index or retriever is
needed.

```bash
./fetch_alce.sh   # 451 MB -> competitive/private/alce/ALCE-data
```

The pilot uses `qampari_eval_gtr_top100_reranked_oracle.json`: 1,000 questions,
five oracle passages each, and `answers_found` flags telling which gold answer
appears in which passage.

## Stage 0 — judge calibration

150 constructed pairs (75 supporting, 75 non-supporting) from 40 questions.
Positive = ALCE says the answer is in the passage; negative = it is not.

| Judge | Accuracy | TPR | TNR | Unknown |
|---|---:|---:|---:|---:|
| Ollama `bespoke-minicheck` | 80.0 | 60.0 | **100** | 0 |
| DeepSeek reference | 74.0 | 55.4 | **100** | 10 |

Agreement between the two on the 140 non-unknown pairs: **90%**.

MiniCheck is a **precision-oriented** judge: it never accepts a constructed
non-support, but it misses 40% of constructed supports. Manual inspection shows
many positives are label noise — the answer string is present, but the passage
does not answer the question. Absolute citation recall is therefore
conservative. Both arms are judged by the same instrument, so the paired
comparison remains valid.

Claim-phrasing variants did not help: declarative (“The answer to … is …”)
TPR 50.7; “X is an answer to …” TPR 41.3; original question+answer TPR 60.0.

## Stage 1 — 30-question smoke

B: list answers, one citation per answer.
DA: same, plus a verbatim quote per citation; the quote is checked before the
item is kept. Same reader (DeepSeek V4.1 Flash), same five oracle passages,
same JSON output schema.

| Metric | B | DA |
|---|---:|---:|
| QAMPARI F1 | 19.6 | 19.8 |
| QAMPARI precision | 38.8 | **46.3** |
| QAMPARI recall | **16.4** | 15.8 |
| Citation support (MiniCheck) | 81.2 | **94.0** |
| Quote validity | — | **100%** (67/67 exact) |
| Question coverage | 73.3 | 73.3 |
| Answers per question | 3.20 | 2.23 |
| Errors (reasoning cap) | 0 | 1 |
| Cost (60 calls) | | $0.128 |

Paired F1 per question: DA wins 6, loses 3, ties 21.

### Reading

No answer-accuracy win. DA trades **breadth for precision**: fewer answers,
higher answer precision, and citations that the judge supports more often. Every
quote DA emitted was byte-exact in the cited passage (case-sensitive,
whitespace-normalized). That is the first evidence the citation claim travels
beyond OOH.

**This is a smoke test.** n=30, one reader, one judge, five passages.

## Caveats

- The judge is not ALCE's GPT-4/AutoAIS. Absolute numbers are **not**
  leaderboard-comparable; only the paired B-vs-DA result is meaningful.
- The oracle passages make retrieval free; retrieval quality is not tested.
- One DA call hit the 8,000-token reasoning cap and produced no answer; it
  counts as `NOT FOUND`.
- QAMPARI entities may be in pretraining. Both arms see the same passages.
- Quote validity uses exact case-sensitive, whitespace-normalized containment.
  The runtime gate is byte-exact; the two checks agreed on this sample.

## Next

150–200 questions with pre-registered metrics and a go/no-go:

- DA quote validity ≥ 95%
- citation recall within 5 points of B
- coverage within 10 points of B
- report F1, citation precision/recall, quote validity, coverage

Only if that passes should we add ASQA/ELI5 or a stronger judge.

## Commands

```bash
# data
./fetch_alce.sh

# instrument calibration
.venv-detectors/bin/python alce/stage0_support_calibration.py \
  --questions 40 --per-question 2

# smoke
OPENCODE_API_KEY=... node alce/run_qampari_pilot.mjs --questions 30
.venv-detectors/bin/python alce/score_qampari.py
```

Outputs go to `competitive/private/alce/runs/` (gitignored).
