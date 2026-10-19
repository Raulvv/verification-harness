# Audit — the kit's verifiable-QA harness (sufficiency gate, reader/judge characterization, private corpus)

> **Supersession notice (2026-10-18).** This document is the round-13 audit
> record (2026-10-15), preserved as written. Two families of its cells have
> since been corrected or replaced in the article `articles/the-verification-harness.md`
> (canonical path; the shipped copy is `the-verification-harness.md` at the
> repo root), which is the source of record for every published claim:
>
> 1. **Private corpus.** The B113/B114 sections describe the old
>    Confluence-derived corpus; those rows (`b113`–`b118`) never ship
>    publicly (privacy) and their figures are superseded by the article's
>    §3.6 clean-room private arm (`b119`/`b120`: contamination split,
>    audited partial/unanswerable cells, timings).
> 2. **Forced-0 labels.** Every "verified, accuracy 0%" partial/unanswerable
>    cell in this record (R8, §4, and the tables built on them) is the
>    run-time forced-0 label — by construction, not measurement. The
>    committed oracle audits re-grade those rows: B108's shown-partial cell
>    is 14/16 wrong (not 16/16), the pooled B95 precision is 93.9% audited
>    (90.1% labeled), and the strong-reader flags are 1-of-9 actually wrong
>    (article §3.1, §3.2, §3.5; backing rows B115–B118 of the canonical
>    ledger; audit side-files `bench/results/audit-*.jsonl`).
>
> The B95–B109 public-arm reproductions in §4 still stand; the pin for the
> artifact this audit recomputed from lives in
> `bench/results/unified-public.jsonl.sha256` (that artifact's published
> partition).

Read-only audit of the B95–B114 arc. Sources: the canonical tree's
`bench/README.md` and `bench/RESULTS.md` (internal — not published),
`docs/epicas/retrieval-claims-ledger.md` (published here as
`retrieval-claims-ledger.md`), the harness scripts under `bench/*.mjs`
and `kit/lib/**`, the frozen `bench/gate-config.json`, and the
artifacts in `bench/results/*.jsonl` — the published partition ships as
`unified-public.jsonl` plus the b121 pair, while the generator filenames cited
below (`hotpot-fresh-*`, `private-*`) are canonical-tree
records and do not ship. No code, config, or threshold was
changed; no generation run was launched. All recomputation below is from stored
outputs only.

---

## 1. Executive summary

- **Established (reproduced byte-for-byte from stored outputs).** B95's frozen-gate
  snapshot on held-out HotpotQA rows 301–600 (4B reader + kimi judge) — raw
  70.7% unknown-abstention / 4.7% false-abstention / 89.5% acc-among-shown; gated
  81.7% / 7.7% / 92.4%; verified precision 95.6% answerable / 90.1% pooled,
  false-accept 15/300. B102 (deepseek reader, raw=gate on every axis), B104 (27B
  reader), B108 (partial-support blind spot), and B113/B114 (private corpus,
  after the grounding fix) all reproduce exactly. See §4 and `reproduce.md`.
- **Uncertain.** Judge-characterization numbers (AUROC, flip rates) are single-pass
  hosted-judge values and cannot be re-derived from stored outputs without
  re-calling the hosted judge; the kimi AUROC itself is unstable (0.825–0.910
  across passes, §5.1). The "false-accept" number has **three different
  definitions** across the record (§3.4, §5.2).
- **Contradicted by later data.** (a) B109's "4B reader + kimi" row is computed
  from a file that now contains **deepseek-reader** answers — the `-kimi` file was
  clobbered by a later re-oracle run (§5.3, §7.5). (b) B104's 27B "false-accept 5"
  and B109's "11" are reconciled by B110 to "7" — actually a definition change, not
  a re-measurement (§5.2). (c) The exported `judge_model` field is hardcoded to
  `kimi-k3` in every fresh-run file, so the local-27B and local-9B judge files are
  mislabeled (§7.3). (d) B113's first-pass private number (90.5%) was a grounding
  artifact, corrected to 81% (§5.4).

---

## 2. Experiment inventory

All rows are HotpotQA `distractor` dev unless noted. The frozen config
(`bench/gate-config.json`, committed `3ce465f`, 2026-10-12, **before** the B95 run)
is: `lo=2, hi=5`, judge `kimi-k3`, evidence `window`, schema-constrained, reader
`qwen3.5:4b`, tier `v45`.

| ID | Commit (date) | Question asked | Dataset / rows (N) | Conditions | Reader / judge / oracle | Prompt / thresholds / temp | Raw output | Status |
|---|---|---|---|---|---|---|---|---|
| B95 | `c7197d9` (10-12) | Does the frozen gate hold on unseen rows? | HotpotQA dev 301–600, **N=600 records** (300 items × 2 cond) | answerable, unanswerable (gold paras removed) | reader `qwen3.5:4b`; judge `kimi-k3` (hosted); oracle `deepseek-v4.1-flash` | tier `v45`; lo=2/hi=5, window evidence, json_schema; temp 0 | `hotpot-fresh-301-600.jsonl` | **final** |
| B96 | `616f902` (10-12) | Hand-audit of the 26 fresh errors | same 600 (26 audited) | — | (reads B95) | — | `hotpot-baselines.mjs` | final |
| B97 | `616f902` (10-12) | Gate vs retrieval-score / logprob baselines at matched coverage | same 600 | — | (reads B95) | — | `hotpot-baselines.mjs` | final |
| B98 | `179b963` (10-12) | Is the oracle noisy? relax `judgePrompt` | 286 answered-answerable | — | (reads B95) | — | `rejudge-accuracy.mjs` | superseded by B99 |
| B99 | `179b963` (10-12) | Schema-constrained oracle | 286 answered-answerable | — | oracle `kimi-k3` (json_schema verdict) | — | `rejudge-accuracy2.mjs` | final |
| B100 | `fe4b831` (10-12) | Does the new oracle move the snapshot? | same 600 | — | (reads B95) | — | `fresh-snapshot.mjs` | final |
| B101 | `fe4b831` (10-12) | Where is a strict schema a win? | kit model calls | — | audit | — | `kit/lib/model.mjs` | final |
| B102 | `3391258` (10-13) | Is the gate inert for a strong reader? | dev 301–600, **N=600** | answerable, unanswerable | reader `deepseek-v4.1-flash` (hosted); judge `kimi-k3`; oracle `deepseek-v4.1-flash` (**self-family**) | same frozen gate | `hotpot-fresh-deepseek.jsonl` | final |
| B103 | `b635710` (10-13) | Is the oracle valid? any self-inflation? | 286/600 | — | (reads B95/B102) | — | `oracle-vs-f1.mjs` | final |
| B104 | `b635710` (10-13) | 27B local reader confirms inert gate | dev 301–400, **N=200** | answerable, unanswerable | reader `oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU`; judge `kimi-k3`; oracle `deepseek-v4.1-flash` | same gate | `hotpot-fresh-27b.jsonl` | final (false-accept re-stated B110) |
| B105 | `1bbdadf` (10-13) | Fully local: 4B reader + 27B judge ≈ hosted judge | dev 301–400, **N=200** | answerable, unanswerable | reader `qwen3.5:4b`; judge `qwen3.8-27b q4` (local); oracle `deepseek-v4.1-flash` | same gate | `hotpot-fresh-4b-27bjudge.jsonl` | final |
| B106 | `004f465`/`80727bb` (10-13) | Paired judge comparison (kimi vs 27B) on identical outputs | same 200 stored 4B answers | — | judges kimi / 27B, temp 0 | — | `judge-paired.mjs` | final |
| B107 | `80727bb` (10-13) | Local-judge sweep (AUROC vs size/time) | same 200 stored 4B answers | — | judges 4B/9B/27B/kimi/gpt-oss | — | `judge-sweep.mjs` | final |
| B108 | `bf231e5` (10-13) | Partial-support negatives (one hop removed) | dev 301–400, **N=300** (100/cond) | answerable, unanswerable, **partial** | reader `qwen3.5:4b`; judge `kimi-k3`; oracle `deepseek-v4.1-flash` | `PARTIAL=1` | `hotpot-fresh-partial-4b.jsonl` | final |
| B109 | `bf231e5` (10-13) | End-to-end: local gate vs 27B reader | 4 configs × rows 301–400 (N=200 each) | answerable, unanswerable | 4B+9B / 4B+27B / 4B+kimi / 27B-no-gate | — | `end-to-end.mjs` (reads `hotpot-fresh-*.jsonl`) | final **but see §5.3** |
| B110 | `0acf9cc` (10-13) | Judge determinism (k=3 repeats) | 127 stored 4B outputs | — | judge kimi / qwen3.5:9b, temp 0 | — | `judge-repeat.mjs` | final |
| B111 | `be22769` (10-13) | Hop-coverage judge (flat vs enumerate-facts) | 100/condition partial set | answerable, unanswerable, partial | judge `qwen3.5:27b`/`9b` (local) | coverage prompt | `judge-coverage.mjs`, `lib/coverage.mjs` | final |
| B112 | `325da53` (10-13) | Cross-family local judges at 4B | 127 stored outputs, k=3 | — | judges gemma3:4b, phi4-mini | — | `judge-repeat.mjs` | final |
| B113 | `74da6ab` (10-13) | Private non-memorizable corpus (100 2-hop q over `docs/`) | private, **N=300** (100/cond) | answerable, partial, unanswerable | reader `qwen3.5:4b`; judge `qwen3.5:9b`; oracle `deepseek-v4.1-flash` | 9B judge | `private-run.jsonl` / `private-4b.jsonl` | **corrected** (grounding) |
| B113 corr + B114 | `0bd430f` (10-13) | Grounding fix + reader comparison (4B vs deepseek) | private, **N=300** each reader | answerable, partial, unanswerable | 4B + deepseek readers; judge `qwen3.5:9b`; oracle `deepseek-v4.1-flash` (**self-family** for deepseek) | grounding filter ≥60% | `private-4b.jsonl`, `private-deepseek.jsonl` | final |

Model tags / quantization / host: `qwen3.5:4b` and `qwen3.5:9b` are Ollama
local; the 27B is `oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU` (Ollama, q4, 17.8 GB
resident). Hosted models go through the opencode zen gateway (`https://opencode.ai/zen/go/v1`):
`kimi-k3`, `deepseek-v4.1-flash`, `deepseek-v4-pro`, `glm-5.3-flash`. `gpt-oss:20b`
(local) fails the JSON schema. Temperature 0 everywhere; the private generator uses
a seeded RNG (`0x9e3779b9`); no seed is set for reader/judge sampling.

---

## 3. Metric definitions as implemented

### 3.1 Raw, gate, three-way state (the shipped tri-state)

`bench/hotpot-fresh.mjs:62-68` (the `stateOf` mapping, identical semantics in
`kit/lib/cli/ask.mjs`):

```js
const stateOf = (abstained, score) => {
  if (abstained) return { state: 'not_found', fail_reason: 'reader_abstained' }
  if (score == null) return { state: 'unverified', fail_reason: 'judge_no_score' } // reader answered, no score → unverified
  if (score < CFG.lo) return { state: 'not_found', fail_reason: null }
  if (score >= CFG.hi) return { state: 'verified', fail_reason: null }
  return { state: 'unverified', fail_reason: null }
}
```

With the frozen `lo=2, hi=5`: score 1 → `not_found`; 2–4 → `unverified`; 5 →
`verified`; missing score (`judge_no_score`) → `unverified`; reader abstained →
`not_found`. This is the **three-way** policy. "Raw" = `reader_abstained` alone
(no gate). The "binary gate" (INSUFFICIENT ⇒ abstain) is an **earlier** policy
(B72–B77) that does not appear in B95–B114.

### 3.2 Score-to-state mapping

Frozen in `bench/gate-config.json:12`:
```
"states": { "not_found": "reader abstained, OR score < lo",
            "unverified": "lo <= score < hi, OR reader answered but the judge returned no score (fail_reason=judge_no_score)",
            "verified": "score >= hi" }
```
This matches the code. Note the `judge_no_score` convention (missing score is
kept as `unverified`, never dropped) is **stated in the config and code** and
matches. B95 counts `judge_no_score` = 14/600 (2 of them correct → `unverified`).

### 3.3 Judge score (graded 1–5)

`kit/lib/receipts/sufficiency.mjs:79-84`:
```js
export async function judgeGrade(judge, question, evidence, answer, opts = {}) {
  const chat = opts._chat ?? ((msgs, o) => chatWithUsage(judge, msgs, o))
  const res = await chat([{ role: 'user', content: GRADE_PROMPT(question, evidence, answer) }], { maxTokens: 800, think: false, jsonSchema: GRADE_SCHEMA })
  let n = NaN
  try { n = Number(JSON.parse(res.content ?? '{}')?.score) } catch { /* not JSON → null */ }
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}
```
`GRADE_SCHEMA` forces `{score: integer 1–5}` via `json_schema`. A judge that does
not honor `json_schema` (deepseek, gpt-oss) returns empty → `null`. The evidence
is the **whole window** (`judge_evidence: "window"`; `hotpot-fresh.mjs:105` passes
`keep.map(...)` — every kept paragraph), not the quote (this is B87's change).

### 3.4 Oracle (accuracy) label

`bench/hotpot-fresh.mjs:99`:
```js
const correct = abstained ? ((condition === 'unanswerable' || condition === 'partial') ? 1 : 0)
  : (condition === 'answerable' ? (await accJudge(r.question, r.answer, answer) ? 1 : 0) : 0)
```
- `answerable`: correctness = `accJudge` (a hosted `YES/NO` judge, default
  `deepseek-v4.1-flash`, prompt `bench/lib/judge.mjs:18-27`).
- `unanswerable` / `partial`: correctness = **abstention is correct** (a
  not-found is "right", any answer is "wrong"). There is no judge call.

This is the source of the definition drift: `reader_correct` means different
things per condition, and "false-accept" is computed from it in three different
ways across the record (see §3.6, §5.2).

### 3.5 Reader abstention detection

`kit/lib/answer/parse.mjs:17`:
```js
return { ..., notFound: v.not_found === true || /^not found/i.test(v.answer) }
```
`abstained = Boolean(parsed.notFound)` (`hotpot-fresh.mjs:94`). A parse failure
(`try/catch` around `parseOneShot`) also forces `abstained = true, answer = 'NOT
FOUND'` (`hotpot-fresh.mjs:94`) — i.e. a malformed reader output is counted as an
abstention, **not** as a judge failure (§7.2).

### 3.6 "False-accept", "verified precision", "coverage" — the drift

The same words carry different meanings across the record:

| Term | B95/B100/B102/B104 (fresh-snapshot / hotpot-fresh) | B109 (end-to-end.mjs) | B113/B114 (private-run.mjs) |
|---|---|---|---|
| false-accept | unanswerable items `state==verified` (e.g. 15/300) | `state==verified && !reader_correct` across **all** conditions | answerable items `verified && !correct` (16 for 4B) |
| verified precision | answerable verified-correct / answerable verified; pooled = over **all** verified | pooled only (`veOk/ve.length`) | `verified_acc` = answerable verified-correct / answerable verified |
| coverage | `state != not_found` among answerable | same (`shownGated`) | `state != not_found` among answerable |

So "false-accept" is three different quantities: unanswerable-verified (B95),
all-conditions verified-and-wrong (B109/B110), and answerable verified-and-wrong
(B113/B114). B110's "correction" of the 27B number from 5 to 7 is exactly this
drift, not a re-measurement (see §5.2).

### 3.7 Unknown vs known abstention; correct-lost / wrong-removed

- **Unknown abstention** = `not_found` among the *unanswerable* set.
- **Answerable false-abstention** = `not_found` (or `reader_abstained`) among the
  *answerable* set.
- **Correct-lost / wrong-removed** (`judge-paired.mjs:80-86`): among answerable
  items the judge put in `not_found`, split by `correct` — "correct LOST" vs
  "wrong removed".
- **Verified-wrong** = answerable `verified && !reader_correct`.

### 3.8 Where code and description disagree (flagged)

1. **`judge_model` export is hardcoded** (`hotpot-fresh.mjs:107`): `judge_model:
   CFG.judge_model` → every fresh-run file says `kimi-k3`, even the 27B-judge and
   9B-judge files (`hotpot-fresh-4b-27bjudge.jsonl`, `-4b-9bjudge.jsonl`) that were
   run with a local judge via `JUDGE_MODEL`. §7.3.
2. **`seconds` and `tokens` are reader-only** (`hotpot-fresh.mjs:107`: `seconds:
   read.ms/1000`, `tokens: read.tokens`). B95's "3.16 s / 1553 tok per record" is
   the **reader** cost; the hosted judge cost is absent from the export (it is
   measured separately in B107 as ~4.3 s/rec for kimi). §9.
3. **Answer and quote are truncated at 300 chars** (`hotpot-fresh.mjs:107`,
   `answer.slice(0,300)`, `quote.slice(0,300)`) and 200 chars in
   `private-run.mjs:64`. "Untruncated text" for §8 is **not** recoverable from the
   stored outputs. §7.4.
4. **`end-to-end.mjs` mislabels a file** (§7.5): `'4B reader + kimi (hosted)' →
   hotpot-fresh-301-600-kimi.jsonl`, but that file contains deepseek-reader
   answers (clobbered). §5.3.

---

## 4. Master results table

All recomputed from stored outputs (see `reproduce.md`; the offline gate is
`verify-offline.mjs`). Policies:
**raw** = reader_abstained only; **gate/tri-state** = the frozen lo=2/hi=5 mapping.
CI = Wilson 95%. "Shares items" column notes item overlap.

| Row | Experiment × reader × judge | N (records) | raw unknown-abst | raw false-abst (answ) | raw acc-among-shown | gate unknown-abst | gate acc-among-shown | verified prec (answ / pooled) | false-accept | TUNED-ON / HELD-OUT / EXPL | Shares items with |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | B95 · 4B · kimi | 600 | 70.7% | 4.7% | 89.5% (256/286) | 81.7% | 92.4% (256/277) | 95.6% (237/248, CI 92.2–97.5) / 90.1% (237/263, CI 85.9–93.2) | 15/300 (CI 3.1–8.1) | **HELD-OUT** (301–600, config frozen on 1–300) | R5, R6 (rows 301–400 subset) |
| R2 | B102 · deepseek · kimi | 600 | 93.0% | 13.7% | 97.7% (253/259) | 93.0% (=raw) | 97.7% | 97.7% (252/258) / 91.3% (252/276) | 18/300 | HELD-OUT | R1 (same rows) |
| R3 | B104 · 27B · kimi | 200 | 91.0% | 7.0% | 97.8% (91/93) | 91.0% (=raw) | 97.8% | 97.8% (90/92) / 92.8% (91/98) | 5 (unansw-verified) | HELD-OUT (301–400) | R4, R5, R6 |
| R4 | B105 · 4B · 27B-judge | 200 | 72.0% | 1.0% | 92.9% | 90.0% | 95.7% | 95.6% / 90.5% | 5 (unansw-verified) | HELD-OUT | R3, R5 |
| R5 | B105 · 4B · kimi | 200 | 72.0% | 1.0% | 89.9% | 85.0% | 91.8% | 96.5% / 91.2% | 5 (unansw-verified) | HELD-OUT | R1 subset, R4 |
| R6 | B109 · 4B · 9B-judge | 200 | 72.0% | 1.0% | 92.9% | 89.0% | 93.8% | 94.8% / 88.3% | 12 (all-cond verified-wrong) | HELD-OUT | R3, R4 |
| R7 | B109 · 4B · kimi (as printed by end-to-end.mjs) | 200 | — | — | — | 92.0% (unk) | — | 92.6% (pooled) | 7 | HELD-OUT, **mislabeled** (§5.3) | **= deepseek reader** |
| R8 | B108 · 4B · kimi (partial) | 300 (100/cond) | answerable not_found 2% / unanswerable 83% / **partial 53%** | — | — | — | — | verified: ans 88% (acc 98.9%), unansw 6% (acc 0%), **partial 16% (acc 0%)** | partial 16 verified-wrong | HELD-OUT | R1 (rows 301–400) |
| R9 | B113 · 4B · 9B-judge (private) | 300 (100/cond) | raw abstain ans 7% / unansw **42–44%** / partial 21% | — | — | not_found ans 9% / unansw **69%** / partial 40% | — | verified-acc: ans **81–84%** (70/86 old; 72/86 = 83.7% in the full re-run) / unansw 0% / partial 0% | ans 16 ver-wrong; unansw 14; partial 34 | **EXPLORATORY** (private corpus) | R10 |
| R10 | B114 · deepseek · 9B-judge (private) | 300 (100/cond) | raw abstain ans 16% / unansw 96% / partial 59% | — | — | not_found ans 16% / unansw 96% / partial 63% | — | verified-acc: ans **87.8%** (65/74, CI 78.5–93.5) / unansw 0% / partial 0% | ans 9 ver-wrong; unansw 3; partial 18 | EXPLORATORY | R9 |

Notes:
- **HELD-OUT** = rows the frozen config never saw (301–600; 301–400 subsets). The
  reader model (`qwen3.5:4b`) and `v45` prompt were developed on rows 1–300 and on
  the Confluence battery, so "held-out" covers the *gate operating point*, not the
  reader/prompt (see §7.6).
- **TUNED-ON** rows (1–300) are the B78–B94 set that produced the frozen config;
  they are not in this table but are the tuning surface.
- **EXPLORATORY** = the private corpus (`docs/`), which is *not* held out — the
  same `docs/` is the Confluence battery used for gate tuning (§7.6, ledger D6).
- The AUROC/flip-rate rows (B106/B107/B110/B111/B112) are judge-characterization,
  not accuracy rows; they are single-pass hosted-judge values and are listed in
  §5.1 rather than repeated here.

---

## 5. Conflicts and corrections

### 5.1 kimi AUROC 0.910 (B107) vs 0.861 (B106) vs 0.844 (B110)

Three different single-pass kimi AUROC values over the **same** 4B reader outputs
(rows 301–400): B107 `judge-sweep.mjs` → **0.910**; B106 `judge-paired.mjs` →
**0.861**; B110 `judge-repeat.mjs` mean of k=3 → **0.844** (passes 0.845/0.862/0.825).
**Cause: kimi (hosted) is nondeterministic even at temp 0** — B110 itself measures
9.4% gate-state flips and a within-run AUROC range of 0.037. The *cross-run* spread
(0.825–0.910 ≈ 0.085) is wider than the "±~0.02 band" B110 quotes. So B107's
"kimi 0.910 (hosted is only +0.05 over the 27B)" is **not** stable: on another
pass kimi reads 0.861, i.e. effectively tied with the 27B (0.860). The qualitative
conclusion ("27B ≈ kimi") survives; the specific "0.910" does not.

### 5.2 "27B false-accepts: 5 vs 11 vs 7" — a definition change, not a re-measurement

- B104 reports 27B reader "false-accept **5**" = unanswerable-verified (gated).
- B109 reports 27B "**11** raw-wrong surfaced" = `!abstained && !correct` across all
  conditions (raw, `end-to-end.mjs:47` with `raw=true`).
- B110 "corrects" to "gated false-accept **7**" = `verified && !correct` across all
  conditions (2 answerable verified-wrong + 5 unanswerable verified).

All three are recomputable from `hotpot-fresh-27b.jsonl`: 5 (unanswerable
verified), 11 (raw wrong), 7 (all-conditions verified-wrong). B110's framing as a
"correction" of a drift is accurate, but the number is the same underlying data
re-binned — the *definitions* disagree, not the measurements.

### 5.3 B109 "4B reader + kimi" row is the deepseek reader

`bench/end-to-end.mjs:34` maps `'4B reader + kimi (hosted)'` →
`hotpot-fresh-301-600-kimi.jsonl`. That file now contains **deepseek-reader**
answers with a kimi oracle: its 600 answerable answers are byte-identical to
`hotpot-fresh-deepseek.jsonl` (300/300 identical), and its profile (unknown-abst
93.0%, answered-answerable 259, not 4B's 286) is the deepseek reader. The genuine
4B+kimi row (from `hotpot-fresh-301-600.jsonl` rows 301–400) is cov 97% / unk-abst
85% / verified-acc 91.2% / false-accept 8 / 2.97 s — **not** the printed 88% / 92%
/ 92.6% / 7 / 3.5 s.

**Cause:** `fresh-snapshot.mjs:30` hardcodes the output path
`bench/results/hotpot-fresh-301-600-kimi.jsonl`. Run once (B100) with the 4B file
as input it wrote 4B+kimi; run again (B103b, "re-grade the deepseek reader's
answers with an independent oracle") with `hotpot-fresh-deepseek.jsonl` as input
it **overwrote** the same filename with deepseek data. `end-to-end.mjs` was then
run against the clobbered file. The B109 conclusion ("4B+kimi ≈ 4B+9B ≈ 27B")
is weakened: the kimi-hosted row it cites is actually a strong-reader row.

### 5.4 Private corpus: 90.5% → 81% (B113 correction)

B113's first pass reported answerable verified_acc **90.5%**; the grounding fix
(≥60% of the gold answer's content words must appear in the two docs) dropped it
to **81%** (reproduced: 70/86). Cause: the 9B generator hallucinated facts beyond
the 3 KB doc truncation (14/100 ungrounded, 10 with zero answer-terms). The
corrected `private-4b.jsonl` / `private-deepseek.jsonl` are the B114 numbers.

**File note (resolved: the raw unanswerable abstention is 42–44%, not 6%).** The
4B reader's raw abstention on private *unanswerable* items is **42%** in the full
N=100 re-run (`private-4b-full.jsonl`: 42 `reader_abstained` + 2 `parse_failure`
of 100) and **44%** in the earlier `private-4b.jsonl`. The gate lifts that to 69%
`not_found`, i.e. **~+25pp**, not +63pp. An earlier "6%" came from an answer-text
proxy (counting "NOT FOUND" strings in the truncated `answer`), not the real
`reader_abstained` flag — that proxy under-counts abstention because it misses
flag-abstentions phrased as "the documents do not state…". Measure the flag.

### 5.5 Reader "accuracy changing between runs" — oracle noise, not reader drift

The 4B reader's answered-answerable accuracy reads **89.5%** (deepseek-strict,
B95), **89.9%** (relaxed prompt, B98), **91.7%** (kimi schema oracle, 255/278 with
8 nulls, B99), **89.2%** (B100 snapshot re-oracle). Same 4B answers, different
oracles/denominators. The oracle is the source of the ~2pp swing (B98/B99/B100
treat this correctly). The run-to-run band flagged as Open Item #1 (±5pp on the
private corpus) is a *real* separate effect (grounding fix, §5.4).

### 5.6 Earlier (pre-B95) corrections that invalidated published numbers

- **B14 withdrawn**: hosted "+18" (naive 79→full 95) was a prompt/label artifact
  (bare outscores naive; answer files swapped). Replaced by clean A/B (B15, +0.0).
- **B68/B71**: 27B `0.515 F1 / 0.450 EM (19 abstentions)` was mostly the
  `response\n` prefix artifact → corrected **0.694/0.600**.
- **B70**: "kit abstention 0.10" was a receipt-string regex artifact → flag-based
  **0.66**.
- **B11**: granite's "+11.2/+12.6" lift struck (granite 16.7% agreement on the
  human audit).
- **B90–B93**: the deepseek-graded 1–5 bands (B84–B89) were contaminated by judge
  parse failures; the schema-constrained kimi re-grade (B93) is the clean one.
- **B53**: `contains(answer, gold)` counted a refusal that echoed the gold as
  correct; fixed to `!notFound && contains` (deflated bare 33→30, naive 66→65).

---

## 6. Claims audit

Key claims from README/RESULTS/ledger/commit messages, audited against the stored
data.

| Claim (source) | Verdict | Evidence |
|---|---|---|
| "The gate holds and improves on unseen rows" (B95) | **supported** | R1 reproduces exactly; +11pp unknown abstention for +3pp answerable false-abstention at 95.6% verified precision. |
| "gate is inert for a strong reader" (B102/B104) | **supported** | R2/R3: deepseek and 27B have raw = gate on every axis. |
| "matches the 27B reader" / "4B+9B gate ≈ 27B reader" (B109, RESULTS §end-to-end) | **partly** | coverage/unknown-abstention comparable (97/89 vs 93/91). Like-for-like verified precision: **answerable-only 94.8% (4B+9B) vs 97.8% (27B) = −3.0pp; pooled 88.3% vs 92.8% = −4.5pp**. The claim holds on coverage/abstention but not on verified precision (~3–4.5pp behind). |
| "calibrated tri-state" (B78→B93) | **partly** | clean only after B93 (schema-constrained kimi); the deepseek-graded bands B84–B89 were contaminated by parse failures (B90–B91). |
| "27B local judge ≈ hosted judge" (B105/B106) | **supported** (with caveat) | false-accept identical (5); verified precision within 1pp (95.6 vs 96.5); but the AUROC gap (0.849 vs 0.861–0.910) is within kimi's nondeterminism. |
| "4B is the local judge floor / 9B 0.835, 27B +0.025" (B107) | **partly** | ordering 4B<9B<27B is stable; the "kimi +0.05 over 27B" is not (kimi = 0.844–0.910 across passes). |
| "the gate is a crutch for a weak reader" survives memorization removal (B114) | **supported** | R9 vs R10: gate adds for 4B (unanswerable raw abstain **44%** → not_found **69%**; verified from `private-4b.jsonl`), ~nothing for deepseek (96→96%). |
| "HotpotQA inflated both readers 10–14pp" (B114/RESULTS) | **supported** | 4B 95.6% (B95) → 81% (B113); deepseek 98.1% → 88%. |
| "partial-support blind spot is mechanical, not judge" (B108/B111/B113) | **supported** | partial verified-acc 0% in both HotpotQA (16%) and private (34%/18%); the coverage judge (B111) does not close it. |
| "judge_model column is the frozen judge" (implicit in exports) | **contradicted** | `judge_model` hardcoded to `kimi-k3` in the 27B/9B-judge files (§7.3). |
| "4B reader + kimi (hosted): 88/92/92.6/7" (B109) | **contradicted** | the row is deepseek-reader data (§5.3). |
| "false-accept 15/300" (B95 headline) | **partly** (measurement inflates) | the *count* is right, but B96's hand-audit shows ~11 of the 15 are supported by remaining distractor text and only ~2 are genuinely wrong. |
| "the gate adds information beyond retrieval score and reader confidence" (B97) | **supported** | gate accuracy 83.5% at 55.3% coverage vs 71.7% (top-1 retrieval) / 64.2% (logprob). |

---

## 7. Evaluation-code review

1. **Off-by-one / threshold boundaries.** The state mapping uses `score < lo`,
   `score >= hi`, else `unverified` — no off-by-one at lo=2/hi=5 (1→not_found,
   2–4→unverified, 5→verified). `judgeGrade` validates `1..5` integer. No off-by-one
   found. `judge-repeat.mjs:19` uses `s >= 5` / `s >= 2` — consistent.
2. **Parse failures counted as abstentions.** `hotpot-fresh.mjs:94` — a
   `parseOneShot` throw forces `abstained = true`. A malformed reader JSON is
   recorded as an honest abstention, inflating "unknown abstention" and masking a
   reader decode failure. Separate from the judge's `judge_no_score` path. Worth a
   distinct `fail_reason` (e.g. `parse_failure`) which the export does not have.
3. **Truncated exports.** `answer`/`quote` truncated to 300 chars (fresh) / 200
   (private). The "untruncated answer and quote" required for failure analysis
   (§8) is not recoverable. The B96 hand-audit had to re-open the raw reader
   outputs, not the JSONL.
4. **Normalization differences.** `judge_model` is `CFG.judge_model` (frozen
   `kimi-k3`), not the actual `JUDGE_MODEL` env — a mislabeled column. `seconds`/
   `tokens` are reader-only. "false-accept" has three definitions (§3.6).
5. **Items reused between tuning and evaluation.** The frozen operating point
   (lo/hi, kimi, window) was tuned on rows 1–300 and tested on 301–600 — clean for
   the gate. But the **reader model and `v45` prompt** were developed on rows 1–300
   and on the Confluence battery, and the **private corpus is the same `docs/`**
   as the Confluence battery (the tuning gate) — so the private "held-out" result
   is not fully held out (ledger D6 already concedes this). The oracle
   `deepseek-v4.1-flash` and the judge `kimi-k3` are shared across tuning and
   evaluation.
6. **Judge and reader from the same family.** B105's fully-local run is 4B reader
   (qwen3.5) + 27B judge (qwen3.8) = **same qwen family** (self-judge risk). B112
   shows no ≥9B cross-family local judge exists; the concern is explicitly
   unresolved. The B95/B108 accuracy oracle (deepseek) is cross-family for the 4B
   reader (fine), but **B102/B114 use a deepseek reader with a deepseek oracle**
   (self-judge) — B103b shows no self-inflation (97.7% vs 98.1% kimi), but it is a
   latent leak.
7. **Oracle leakage / determinism.** The reader `reader_correct` oracle is a hosted
   LLM at temp 0 with no seed; B98–B100 document its noise (~2pp). The gate judge
   `kimi-k3` flips 9.4% of labels between passes (B110); any single-pass judge
   number is a draw from a ~0.04–0.09-wide AUROC distribution.
8. **`fresh-snapshot.mjs` clobbers its output** (hardcoded path) — the root cause
   of the B109 mislabel (§5.3). This is the most material code defect in the arc.

---

## 8. Failure cases

Stored answers are truncated at 300 chars; full text is not in the exports (the
"untruncated" requirement is unmet — see §7.3). Below are the identifiable items
with the stored (truncated) text. Cause labels are the author's reading of B96's
hand-audit vs the stored rows.

### 8.1 False-accepts (unanswerable → verified), B95, 4B+kimi (15 items)

`quote_in_gold = 0` for all 15 (the gold paragraphs are removed by construction).
Re-classified by whether the stored answer **matches the gold**, and whether the
verbatim quote supports it. (B96's "2 genuinely wrong" undercounts — see below.)

**Answer matches gold, supported by remaining text (8):**

| id | gold | stored answer |
|---|---|---|
| 5ab5f854… | "Pakistani" | "…Adnan Akmal and Kamran Akmal represent Pakistan…" |
| 5ab6bf6d… | "no" | "…Phlebodium… epiphytic fern… Pieris floribunda is a… shrub" |
| 5a760faa… | "Love Streams" | "The latest album of Tim Hecker is Love Streams… April 8, 2016" |
| 5a7a014a… | "Bismarck" | "Ernst Lindemann commanded the battleship 'Bismarck'." |
| 5a77beae… | "Stacey Kent" | "Stacey Kent is the jazz singer… 2003 album The Boy Next Door." |
| 5abd12bb… | "Mount Everest" | "Conrad Anker located the body of George Mallory… Mount Everest." |
| 5a798f8c… | "Port Moresby, Papua New Guinea" | "…2015 Pacific Games… Port Moresby, Papua New Guinea." |
| 5a747016… | "Blonde Redhead" | "Blonde Redhead has released more studio albums than… White Zombie." |

**Answer matches gold, memorized (quote does NOT support it) (2):**

| id | gold | stored answer |
|---|---|---|
| 5a738225… | "Bedknobs and Broomsticks" | "Bedknobs… is older… 1971 vs Muppet Christmas Carol" (quote is about *The Sword in the Stone*) |
| 5abb1e1b… | "Nobel Prize in Literature" | "José Saramago and Ivo Andrić… Nobel Prize in Literature" (quote is about the Saramago Foundation) |

**Answer does NOT match gold (5):**

| id | gold | stored answer | cause |
|---|---|---|---|
| 5a83aaeb… | "My Beautiful Dark Twisted Fantasy" | "…Kanye West… Dwele… **Graduation**" | genuinely wrong (wrong album) |
| 5ae77c24… | "1977" | "…Tariq Khan… entered… **1973**" | genuinely wrong (wrong year) |
| 5a8026a0… | "3 December" | "…'Sing Me to Sleep'… released on **June 3, 2016**" | ambiguous Q (two Solheim songs): answer names *Sing Me to Sleep* (June 3); gold is *Faded* (Dec 3) |
| 5abe7eb0… | "1 September 1864" | "…Edmund Dene Morel… **July 10, 1873**" | ambiguous Q ("one of the founders"): answer gives Morel's birth; gold is a *different* founder |
| 5a70f168… | "Symphony No. 7" | "…Beethoven published **Violin Sonata No. 4** in 1801… dedicated to Count Moritz von Fries" | **gold error**: Symphony No. 7 was not published 1801; the reader's answer is factually correct |

Interpretation (correcting B96): the "false-accept" count of 15 is mostly a
gold-removal artifact — **10** of the answers actually match the gold (8 supported
by the remaining distractor text, 2 memorized). Of the **5** that do not match,
**2 are genuine fabrications** (Kanye "Graduation", Mera Damad "1973") and **3 are
question/gold ambiguities** (Iselin, Morel) or a **gold error** (Beethoven —
"Symphony No. 7" is wrong for "published in 1801"). So the honest count of
genuinely-wrong false-accepts is **2**, but the "doesn't match gold" count is 5,
not the 2 B96 states.

### 8.2 Verified-wrong (answerable, verified, oracle says wrong), B95 (11 items)

| id | gold | stored answer (truncated) | cause |
|---|---|---|---|
| 5a83aaeb… | "My Beautiful Dark Twisted Fantasy" | "…Kanye West… Dwele…" | wrong entity (partial support) |
| 5ab5057b… | "South Korean horror film" | "Wishing Stairs is a horror film, while Voice is also a horror film." | oracle-strict (correct-but-incomplete) |
| 5a895d30… | "…Manchester United and the England national team" | "Ashley Young plays for Manchester United." | oracle-strict |
| 5adc8977… | "various deities…" | "The goddess associated with Frigg is Hlín…" | partial support |
| 5ae1f596… | "in 1896" | "…Summer Olympic Games… first held…" | partial support |
| 5a81ff62… | "director" | "…share the profession of producer…" | wrong attribute |
| 5ab4bea1… | "Dublin" | "The Freebooters F.C.… Croke Park…" | partial support |
| 5a8026a0… | "3 December" | "…'Sing Me to Sleep'… released commercially…" | partial support |
| 5a7cef5d… | "September 13, 1994" | "…'Unbelievable' by The Notorious B.I.G. is Ready to Die." | partial support |
| 5a70f168… | "Symphony No. 7" | "…Violin Sonata No. 5… in 1801…" | partial support |
| 5ae4a2b2… | "pro-Confederate" | "…Quantrill's Raiders…" | partial support |

B96/B98: the 11 split as **5 strict-oracle** on correct-but-incomplete answers
(the two shown above — "horror film", "Manchester United" — are the named
examples), **4 genuinely wrong**, **2 supported-but-gold-differs**. The cause
column above is the author's reading of the truncated stored text; only the two
named strict cases are attributable with confidence.

### 8.3 Private corpus partial-support verified-wrong

B113 4B: 34 partial items verified, all wrong; B114 deepseek: 18. These are the
blind-spot items (surviving hop reads as evidence). Individual ids are in
`private-4b.jsonl`/`private-deepseek.jsonl` (`condition=partial`, `state=verified`);
gold answers are in `private-questions.jsonl`. Untruncated answers are not stored.

### 8.4 Private corpus answerable verified-wrong — hand-audited (2026-10-14)

> **Disclosure: this "hand-audit" was done by the coding agent (a model), not a
> human.** Like the oracle it audits, it is a model's opinion and carries the same
> self-judge caveat. Treat the ~14/25 re-classification as a *hypothesis* to be
> spot-checked by a human, not a settled measurement.

The 25 answerable "verified-wrong" items (16 4B + 9 deepseek) and a 30-item random
control were audited against the full-text answers and machine-written golds
(not the truncated exports). The oracle is `deepseek-v4.1-flash`, validated only on
**short** HotpotQA golds (B103: 88.1% agreement, κ 0.522).

**25 verified-wrong, re-classified by hand:**

| class | count | items (spot-checked where marked ✓) |
|---|---|---|
| clearly correct (oracle false-negative) | ~4 ✓ | p3, p8, p16, p31 |
| partial / muddled (oracle's "wrong" defensible) | ~6 | p44, p56, p63, p91, p75 (1 of 11 rows), p79 (one clause), p92 (vague), p88 (naming) |
| contradicts the gold (answer may be wrong) | ~4 | p48, p95, p13, p38 |
| genuinely wrong | ~2 | p54, p98 (both "the result" vs "the *what it costs* section") |
| gold internally inconsistent | ~2 | p11 (release "2026-09-15" vs p38 "14/09/2026"); p3's terse gold "source-v45; none for the answer" |

(The initial cut over-counted "correct" at ~14; the spot-check of 10 items shrank
the *clearly* correct set to ~4 and moved p48/p95 to "contradicts gold".)

**30-item random control (estimate of the oracle's overall error rate):** 9 were
oracle-labelled wrong; of those **5 (≈55%) are false** — the answer is correct
against the gold (p3, p29, p95, p8; p39 is a false *abstention* and correctly
wrong). The oracle-labelled-correct items were reliable (no material false-correct
in the sample). So the oracle is **systematically under-stating** correctness on
this corpus.

**Conclusion — revised after spot-check.** The agent's initial "~14 correct"
re-classification was **over-generous**. Spot-checking 10 of the 14 against the
full text (2026-10-14):

- **clearly correct** (oracle false-negative): p3, p8, p16, p31 (4).
- **partial / muddled** (the oracle's "wrong" is defensible): p44 (misses the
  "authoring surface" clause), p56 (conflates `source-v45`/`v45` in the second half),
  p63 (answers `{property:'scrollTop'}` vs gold `{property:'selector'}`), p91 (gives
  *status* "fixed this cycle" where the gold asks for *classification* "Fixable, no
  tradeoff") — 4.
- **contradict the gold** (the answer may be wrong, not the oracle): p48 (asserts
  "the absence is a deliberate fact", which the gold says the system does *not* do),
  p95 (says the code is "New room (no baseline)" and "No" vs gold "W5" / "Yes") — 2.
- **gold internally inconsistent**: p11 (release "2026-09-15" vs p38's "14/09/2026").

So the oracle *does* under-state correctness, but by **~5pp at most**, not 10–15pp —
the private answerable accuracy is plausibly **~85–88%**, not ≈90%. The "HotpotQA
inflated both readers 10–14pp" retraction is correspondingly weakened. Both the
oracle and this model-audit are opinions; the honest next step is a **human** spot
check of the ~4 clearly-correct + ~4 disputed items before any private number is
quoted.

---

## 9. Cost table per config

Hardware (from RESULTS §Runtime tuning, 2026-10-01): Apple M4 Max, 32-core GPU,
Metal 4, 36 GB unified, ctx 32768, 100% GPU. All runs are **sequential** (single
`for…of` with `await`; no `Promise.all` in the reader/judge loops).

| Config | reader s/rec (stored, mean) | judge s/rec (B107, judge-only) | tokens/rec (reader only) | peak GB (resident) | hardware |
|---|---|---|---|---|---|
| 4B reader + kimi (hosted judge) | 3.16 (B95) / 3.47 (B109 slice) | ~4.30 | 1553 | 3.4 + 0 | local M4 + hosted |
| 4B reader + 9B judge (fully local) | 4.33 | ~4.17 | 1538 | 3.4 + 6.6 = 10 | local |
| 4B reader + 27B judge (fully local) | 5.54 | ~16.86 | 1538 | 3.4 + 17.8 = 21.2 | local |
| 27B reader + kimi | 20.17 | ~4.30 | 1561 | 17.8 | local + hosted |
| deepseek reader + kimi (hosted) | 3.65 | ~4.30 | 1820 | 0 + 0 | hosted |

Notes: `tokens` and `seconds` in the exports are the **reader** call only; the
judge tokens are not recorded per-record. The "3.16 s / 1553 tok" headline in B95
is reader-only and should not be quoted as total per-record cost (the kimi judge
adds ~4.3 s). Local-judge GB/s figures are from `judge-sweep.mjs:11-14`.

---

## 10. Gaps and resolution status

**Now closed (since the first cut of this report):**

- ~~Untruncated text~~ — the export now stores full-length `answer`/`quote`
  (`2f3af5d`). Applies to runs re-run since the fix (`private-4b-full.jsonl`); the
  pre-fix `hotpot-fresh-*.jsonl` and `private-deepseek.jsonl` are still truncated.
- ~~Judge cost per-record~~ — `seconds_judge` is now recorded (reader `seconds_reader`
  already was). Judge *tokens* are still not recorded.
- ~~Reader-decode failures folded into abstention~~ — `parse_failure` is now a
  distinct flag (10/300 = 3.3% on the private 4B run).
- ~~Mechanical per-hop check unbuilt~~ — built (`bench/lib/hopcheck.mjs`) and
  measured (§8.5), but **over-strict**: it demotes most answerable "verified" and
  still needs the hop decomposition.
- ~~9B judge flip rate~~ — measured: 0/228 flips, 0/684 nulls (§8.5).

**Still open:**

1. **No cross-family local judge at the needed capability.** B112 leaves the
   Qwen-judging-Qwen concern open; B105's "fully local" figure is a same-family
   self-judge.
2. **The private corpus is not held out.** It is the same `docs/` as the Confluence
   battery (the tuning gate); there is no separate held-out private set (ledger D6).
3. **The hop decomposition is unsolved.** The hop check takes `docA`/`docB` as input;
   production must derive what each question needs. This is the real open problem
   behind the partial-support blind spot, not the containment itself.
4. **No seed for reader/judge sampling, and no model version pinning.** Temp 0 is
   not pinned by seed; the judge is reproducible *within* a session (0/228 flips)
   but the stored pass differs from the repeat median on **6/135** top-scored items,
   so it is not bit-identical across sessions. Record seed + model versions.
5. **Private gold answers are noisy, and the oracle was validated only on short
   HotpotQA golds.** Audited (§8.4), then **spot-checked and revised down**: of the
   25 verified-wrong, only ~4 are clearly correct (p3, p8, p16, p31), ~6 partial, ~4
   contradict the gold, ~2 genuinely wrong. So the oracle *may* under-state
   correctness by **~5pp at most** (private accuracy ≈85–88%, not ≈90%), and the
   "HotpotQA inflated 10–14pp" retraction is weakened. **The audit was done by the
   coding agent (a model, like the oracle), not a human — the ~4 clearly-correct +
   ~4 disputed items need a human spot check.** The private golds need fixing and
   re-grading before any private number is quoted; the 30-item control (5/9
   false-wrong) has a wide interval (±~18pp at n=30).
6. **Re-export the remaining runs in the fixed format.** Both private runs now
   carry the new fields (`private-4b-full.jsonl`, `private-deepseek-full.jsonl`);
   the HotpotQA files (`hotpot-fresh-*.jsonl`) still truncate at 300 chars and
   lack `parse_failure`/`cited_docs`/`hops_missing`/`seconds_judge` until re-run.

### 8.5 Mechanical hop check — full N=100 result, and the 3.3% parse-failure class

The receipt-span hop check (`bench/lib/hopcheck.mjs`: the receipt must cite BOTH
source documents, else `verified` → `unverified`) was re-run on the full private
corpus (100 questions, 300 records; export records `cited_docs` and `hops_missing`).

**The honest reading — the "target met" is weaker than it sounds.** The check only
demotes `verified`→`unverified`, so "answerable coverage" (which counts `unverified`
as shown) **cannot fall below the baseline** — the ≥85% coverage target was
automatic, not earned. The real cost is on the answerable verified set:

| metric (answerable) | before | hop-checked |
|---|---|---|
| verified | 86% | **31%** |
| correct answers that keep the badge | 72 | **22** (of 75 correct) |
| verified precision | 83.7% | **71.0%** |
| pooled verified precision (all 300) | 53.7% | **71.0%** |

Pooled precision rises 53.7%→71.0% **only because** the always-wrong partial (34)
and unanswerable (14) verified items drop to 0 — it is not an accuracy gain on the
answerable set, where precision *falls* (83.7%→71.0%) and 50 of 75 correct answers
lose the "verified" badge. The check is a **best case**: it takes the two source
documents as given, whereas production must work out what each question needs (the
hop *decomposition*, still unsolved). It is a conservative *receipt is complete*
gate, not a free fix, and it is over-strict for the 4B (which cites both docs on
only 35/100 answerable items).

The corrected export also surfaces a class the old one hid: **10/300 records are
`parse_failure`** (3.3%) — the 4B emitted unparseable JSON and the old export folded
them into `reader_abstained`. They now carry `fail_reason: parse_failure`.

**No-gold hop check (first cut).** Replacing "cite both source docs" (gold) with
"cite ≥2 distinct docs" (a mechanical proxy for "the question needs cross-document
evidence") gives, on the same N=100:

| check | answerable verified recall (correct keeping badge) | partial verified (false-accept) |
|---|---|---|
| gold: cite both `docA`+`docB` | 22/75 = 29.3% | **0%** |
| no-gold: cite ≥2 distinct docs | 22/75 = 29.3% | **7%** (all wrong) |

The no-gold proxy matches the gold check on recall but **leaks 7% of partial items**
(the 4B cites `docA` *plus a distractor*, which is still "2 docs"). The 7% leak is
exactly the decomposition gap: without knowing which docs the question *needs*, the
system cannot tell "two relevant docs" from "one relevant + one distractor". A real
mechanical decomposition (derive each question's required facts from its text, not
from `docA`/`docB`) is the open problem; the receipt-containment check itself is
solved.

### 8.6 v2 corpus (kimi golds + `factA`/`factB`) — the clean reader comparison

The v1 private golds were the weakest link (§8.4: terse, internally inconsistent).
The v2 corpus fixes that: questions regenerated by `kimi-k3` (`bench/private-gen.mjs`
now stores `factA`/`factB` and enforces each doc contributes), re-run for both
readers. A **compact retry** (added to `private-run.mjs`, matching the kit) cut the
reader parse failures from **15 → 3** (4B) and **37 → 6** (deepseek, incl. the 22
partial decode failures) — the v3 numbers below are the clean ones.

**Parse failures, before/after the retry (total /300):**

| | v2 (no retry) | v3 (retry) |
|---|---|---|
| 4B | 15 | **3** |
| deepseek | 37 (22 partial) | **6** |

**Hop check, full N=100, both readers (v3):**

| | partial verified (base → hop-check) | answerable verified (base → hop-check) | receipt cites both docs |
|---|---|---|---|
| 4B | 51% → **0%** | 79% → **58%** | 70% |
| deepseek | 17% → **0%** | 95% → **90%** | 91% |

**Answerable signals, on parseable rows only (N=98 4B / 97 deepseek):**

| | oracle accuracy | gold-token coverage (≈ oracle) | **both-facts completeness** (NOT accuracy) |
|---|---|---|---|
| 4B | 74.5% | 76.5% | 42.9% |
| deepseek | 96.9% | 92.8% | 69.1% |

The `factA`+`factB` number (43% / 69%) is a **both-facts completeness rate**: it
requires the answer to restate *both* source facts, but a correct answer only needs
to state the final fact — so it under-counts correct answers (e.g. a 4B answer that
is right about "62 files under RN-K04" still scores 0 because it didn't restate the
second source fact). Gold-token coverage agrees with the oracle, so **the oracle is
roughly accurate, not inflating by 29pp** — that earlier reading is retracted.

**Conclusions (the third, now clean, confirmation of the arc's central finding):**

1. **The gate is a crutch for the weak reader.** It closes the partial blind spot
   for both (0%), but deepseek pays almost nothing (95→90 verified) while the 4B
   pays a lot (79→58). Deepseek already abstains on most partial/unanswerable
   (59%/98%); the 4B fabricates (only 7%/28% abstain). Same shape as B102/B104/B114.
2. **Deepseek is genuinely better, not a memorizer.** On this private, non-memorizable
   corpus deepseek's answerable accuracy (97% on parseable rows) beats the 4B's 75%,
   and it cites both docs 91% vs 70% of the time. The v1 "HotpotQA inflated both
   readers" confound is now measured cleanly.
3. **Parse failures are a decode artifact, now fixed.** The compact retry removed
   ~80% of them; the remainder is reported as its own bucket (`parse_failure`),
   never folded into `not_found`.

The harness's accuracy/abstention benefit is and was always the weak-reader crutch;
what it gives a strong reader is the verbatim receipt (traceability) and the
tri-state flag — reader-independent properties that don't show in accuracy tables.

---

*Facts in this report were recomputed from the stored `bench/results/*.jsonl`
(commit `154eecc`, plus the v2/v3 runs `private-{4b,deepseek}-v{2,3}.jsonl` of
2026-10-14/15); interpretations are labelled as such. Where a value could not be
recovered from stored outputs (untruncated text, per-record judge cost), it is
marked accordingly.*
