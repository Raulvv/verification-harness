# Reproduce — headline numbers from stored outputs

The per-run side files are gitignored in the canonical tree
(`bench/results/**`); the recompute
snippets below read the committed, sha256-pinned artifacts instead —
`bench/results/unified-public.jsonl` (the published partition; the canonical
tree's root `unified.jsonl` holds the same rows plus the never-published runs)
and the b121 pair (`bench/results/b121-e2eir-4b*.jsonl`, both committed with
their `.sha256` pins) — so they run on a fresh clone. The
generation commands here (reader/gate runs hit models) recreate the side files;
blocks that still need them (hop check, judge repeat) are labeled inline.

**Since 2026-10-14 the exports are full-length** (`answer`/`quote` untruncated) and
carry `parse_failure`, `cited_docs`, `hops_missing`, `seconds_judge`, and the real
`judge_model` (commit `2f3af5d`, `c20a7bf`; the field is named `judge` once
merged into the canonical root `unified.jsonl`). The private run is now **resumable** —
a re-run over the same `OUT` skips already-present `(id, condition)` pairs.

```sh
PARTIAL=1 READER_MODEL=qwen3.5:4b JUDGE_MODEL=kimi-k3 node bench/hotpot-fresh.mjs 301 600   # B95 → hotpot-fresh-301-600.jsonl
PARTIAL=1 READER_MODEL=deepseek-v4.1-flash node bench/hotpot-fresh.mjs 301 600             # B102 → hotpot-fresh-deepseek.jsonl
READER_MODEL=oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU node bench/hotpot-fresh.mjs 301 400  # B104 → hotpot-fresh-27b.jsonl
JUDGE_MODEL=oamazonasgabriel/qwen3.8-27b:q4-km-32gbGPU node bench/hotpot-fresh.mjs 301 400   # B105 → hotpot-fresh-4b-27bjudge.jsonl
JUDGE_MODEL=qwen3.5:9b node bench/hotpot-fresh.mjs 301 400                                  # B109 → hotpot-fresh-4b-9bjudge.jsonl
node bench/private-gen.mjs 100          # B113 questions → private-questions.jsonl
OUT=bench/results/private-4b-full.jsonl READER_MODEL=qwen3.5:4b node bench/private-run.mjs bench/results/private-questions.jsonl   # B113 (full N=100, resumable)
OUT=bench/results/private-deepseek.jsonl READER_MODEL=deepseek-v4.1-flash node bench/private-run.mjs bench/results/private-questions.jsonl  # B114
```

From a fresh clone, every headline number is recomputed **offline** (no model
calls, pinned artifacts only) by the snippets below. Each was run and the result
compared to the recorded value.

## Snapshot recomputation (all runs, one snippet)

Run with `node --input-type=module` (reads `bench/results/unified-public.jsonl`,
committed and pinned in both trees; the run exports' `reader_correct` column is
named `oracle_correct` in the artifact — same column, different name):

```js
import { readFileSync } from 'node:fs'
const all = readFileSync('bench/results/unified-public.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const load = (run) => all.filter(x => String(x.run_id).startsWith(run))
const pct = (a, b) => b ? 100 * a / b : 0
const f1 = (x) => x.toFixed(1)
function snap(r) {
  const a = r.filter(x => x.condition === 'answerable'), u = r.filter(x => x.condition === 'unanswerable')
  const rawShown = a.filter(x => !x.reader_abstained), gateShown = a.filter(x => x.state !== 'not_found')
  const verAns = a.filter(x => x.state === 'verified'), verAll = r.filter(x => x.state === 'verified')
  return {
    rawUnk: pct(u.filter(x => x.reader_abstained).length, u.length),
    rawFA: pct(a.filter(x => x.reader_abstained).length, a.length),
    rawAcc: pct(rawShown.filter(x => x.oracle_correct === 1).length, rawShown.length),
    gateUnk: pct(u.filter(x => x.state === 'not_found').length, u.length),
    gateFA: pct(a.filter(x => x.state === 'not_found').length, a.length),
    gateAcc: pct(gateShown.filter(x => x.oracle_correct === 1).length, gateShown.length),
    precAns: pct(verAns.filter(x => x.oracle_correct).length, verAns.length), nAns: verAns.length,
    precAll: pct(verAll.filter(x => x.oracle_correct).length, verAll.length), nAll: verAll.length,
    fa: u.filter(x => x.state === 'verified').length,
    vw: verAns.filter(x => x.oracle_correct === 0).length,
  }
}
const s = snap(load('b95-'))
console.log('B95', 'raw', f1(s.rawUnk), f1(s.rawFA), f1(s.rawAcc), 'gate', f1(s.gateUnk), f1(s.gateFA), f1(s.gateAcc), 'ver', f1(s.precAns), s.nAns, f1(s.precAll), s.nAll, 'fa', s.fa, 'vw', s.vw)
const d = snap(load('b102-'))
console.log('B102', 'raw', f1(d.rawUnk), f1(d.rawFA), f1(d.rawAcc), 'ver', f1(d.precAns), d.nAns, f1(d.precAll), d.nAll, 'fa', d.fa, 'vw', d.vw)
const t = snap(load('b104-'))
console.log('B104', 'raw', f1(t.rawUnk), f1(t.rawFA), f1(t.rawAcc), 'ver', f1(t.precAns), t.nAns, f1(t.precAll), t.nAll, 'fa', t.fa)
const j27 = snap(load('b105-'))
console.log('B105 27Bjudge', 'gate', f1(j27.gateUnk), f1(j27.gateFA), f1(j27.gateAcc), 'ver', f1(j27.precAns), j27.nAns, f1(j27.precAll), j27.nAll, 'fa', j27.fa)
```

### Actual vs recorded (ran 2026-10-14, commit `154eecc`)

| # | value | recorded | computed | match |
|---|---|---|---|---|
| B95 raw | unk-abst / false-abst / acc | 70.7 / 4.7 / 89.5 | 70.7 / 4.7 / 89.5 | ✅ |
| B95 gate | unk-abst / false-abst / acc | 81.7 / 7.7 / 92.4 | 81.7 / 7.7 / 92.4 | ✅ |
| B95 verified | ans / pooled | 95.6 (n=248) / 90.1 (n=263) | 95.6 / 90.1 | ✅ |
| B95 | false-accept / verified-wrong / judge_no_score | 15 / 11 / 14 | 15 / 11 / 14 | ✅ |
| B102 | raw unk / false-abst / acc; ver ans/pooled; fa/vw | 93.0 / 13.7 / 97.7; 97.7 / 91.3; 18 / 6 | identical | ✅ |
| B104 | raw unk / false-abst / acc; ver ans/pooled; fa | 91.0 / 7.0 / 97.8; 97.8 / 92.8; 5 | identical | ✅ |
| B105 27B judge | gate unk / false-abst / acc; ver ans/pooled; fa | 90.0 / 6.0 / 95.7; 95.6 / 90.5; 5 | identical | ✅ |
| B105 4B+kimi | gate unk / false-abst / acc; ver ans/pooled; fa | 85.0 / 3.0 / 91.8; 96.5 / 91.2; 5 | identical (first 200 of B95 — derived; printed by the end-to-end run below, not the snippet above) | ✅ |

## End-to-end table (B108/B109) — read-only script

The script reads `unified.jsonl` first, then the published partition
`bench/results/unified-public.jsonl`, then the canonical tree's gitignored
exports if present:

```sh
node bench/end-to-end.mjs
```

Output matches B108 (partial: not_found 53 / verified 16 / verified_acc 0 —
as labeled, forced-0, unaudited; the audited unanswerable cell reads 4/6
gold-correct in the ledger) and
all four of B109's rows (§3.4's fifth row — the deepseek reader, 88 / 92 /
92.6 / 7 — is a `b103b-` slice checked by the same arithmetic, not printed by
this script):

| row | recorded (B109) | computed now | verdict |
|---|---|---|---|
| 27B reader, no gate | 93 / 91 / 11 / 20.2s / 17.8GB | 93 / 91 / 11 / 20.17s / 17.8 | ✅ |
| 4B + 27B judge | 94 / 90 / 90.5 / 9 / 5.5s / 21.2 | identical | ✅ |
| 4B + 9B judge | 97 / 89 / 88.3 / 12 / 4.3s / 10 | identical | ✅ |
| 4B + kimi (hosted) | 97 / 85 / 91.2 / 8 / 2.97s / 3.4 | 97.0 / 85.0 / 91.2 / 8 / 2.97 / 3.4 | ✅ |

(The raw 27B row's `11` is answered-and-wrong — that row has no gate to be
verified under; the `verified && wrong` count §3.4 quotes for the same run is
7.)

History: before `2f3af5d` this table's kimi row read 88 / 92 / 92.6 / 7 / 3.5s — the §4 clobber's deepseek answers (`hotpot-fresh-301-600-kimi.jsonl`, report §5.3) — since fixed, with B109 carrying a correction note and the genuine row (verified-wrong 8).

## Open-pool e2e (b121) — read-only snippet

Reads the committed b121 pair (both files shipped and pinned); reproduces the
§3.4 b121 block: recall, accuracy, both gate rows, agreement, promotions.

```js
import { readFileSync } from 'node:fs'
const core = readFileSync('bench/results/b121-e2eir-4b.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l))
const loc = readFileSync('bench/results/b121-e2eir-4b-ours9b.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l))
const pct = (a, b) => b ? (100 * a / b).toFixed(1) : '0.0'
const ours = core.filter(r => r.arm === 'ours')
const acc = rows => pct(rows.filter(r => r.oracle_correct === 1).length, rows.length)
const recall = k => pct(ours.reduce((s, r) => s + r[k], 0), ours.length)
const gate = rows => {
  const ver = rows.filter(r => r.state === 'verified')
  const shown = rows.filter(r => r.state !== 'not_found')
  return {
    coverage: pct(shown.length, rows.length), shownN: shown.length,
    verPrec: pct(ver.filter(r => r.oracle_correct === 1).length, ver.length),
    verN: ver.length, verWrong: ver.filter(r => r.oracle_correct === 0).length,
  }
}
console.log('recall d/h/i:', recall('recall_dense'), recall('recall_hybrid'), recall('recall_iterative'))
console.log('accuracy bare/naive/ours:', acc(core.filter(r => r.arm === 'bare')),
  acc(core.filter(r => r.arm === 'naive')), acc(ours))
console.log('kimi gate:', gate(ours))
console.log('local gate:', gate(loc))
const kStates = new Map(ours.map(r => [r.id, r.state]))
const agree = loc.filter(r => kStates.get(r.id) === r.state).length
const promoted = loc.filter(r => r.state === 'verified' && kStates.get(r.id) !== 'verified')
console.log('agreement:', `${agree}/${loc.length}`, pct(agree, loc.length),
  '| promoted:', `${promoted.filter(r => r.oracle_correct === 1).length}/${promoted.length}`)
```

Recorded output: recall `83.3 76.7 88.0` · accuracy `25.3 80.3 80.3` ·
kimi gate `{coverage:'89.7', verPrec:'93.5', verN:230, verWrong:15}` · local
gate `{coverage:'90.3', verPrec:'88.2', verN:263, verWrong:31}` · agreement
`256/300 85.3` · promoted `20/36` — with `shownN` 269/271.

## Private corpus (B113/B114) — read-only snippet

**Tree:** this section resolves in the canonical tree only — runs `b113-`,
`b117-` and `b118-` are private and never ship, so the snippet below reads zero
rows in the published tree. The fresh private arm the article §3.6 publishes
(`b119`/`b120`) recomputes from `bench/results/unified-public.jsonl`.

**Gold-drift disclosure:** the frozen b119/b120 question golds predate the
2026-10-19 wording fix — 4 gold rows in `bench/results/private-questions.jsonl`
still read "~25% more tokens" where `bench/BENCHMARKS.md` and `kit/README.md`
now say "~32.5% more tokens". The stored runs above were graded against the
golds as frozen; a rerun today would pit corrected readers against those same
frozen golds. The golds are frozen in the repo and never edited — disclosed
here, not rewritten.

**Corpus drift & manifest re-pin:** `corpus/manifest.json` is rebuilt at export,
so its 8 pins describe the published files after the wording fixes — 6 of the 8
were edited in round 18 and 3 again in round 19. The corpus is therefore partly
self-referential (it includes the article that quotes these numbers). The stored
b119/b120 runs are frozen at an earlier revision: **12 rows (7 b119 + 5 b120;
9 verified) quote text absent from every shipped file** — the phrase `not yet
public` survives only in the pre-round-18 history — and **9 artifact rows per
arm (3 questions) carry the pre-edit `~25% more tokens` gold wording**. The
shipped pins describe the published bytes, not the bytes the runs read; no
measurement was regenerated.

**`oracle_correct` on refused rows:** the label describes the reader's *answer*,
not the *decision*. On B95, the 245 unanswerable `not_found` rows carry
`oracle_correct=1` in 212 cases and `0` in 33. The baseline script keys its
decisions on `state` and `condition`, never on the refused row's label.

**Parse-failure labels:** an earlier export scored parse failures as `1` on the
non-answerable conditions. The canonical runner now writes `reader_correct=null`
for a parse failure (it stays in `not_found`, unscored). The stored b120 rows
carry the old forced-`1` label on the 8 non-answerable cases; the audit side-file
re-labels them, and the article is explicit that they are not correct
abstentions.

```js
import { readFileSync } from 'node:fs'
const all = readFileSync('unified.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const load = (run) => all.filter(x => String(x.run_id).startsWith(run))
const pct = (a, b) => b ? 100 * a / b : 0
for (const [run, label] of [['b113-','B113 4B'], ['b117-','B114 4B'], ['b118-','B114 deepseek']]) {
  const r = load(run)
  for (const c of ['answerable','partial','unanswerable']) {
    const g = r.filter(x => x.condition === c)
    const ve = g.filter(x => x.state === 'verified')
    const sh = g.filter(x => x.state !== 'not_found')
    const answ = g.filter(x => x.reader_abstained !== 1 && x.parse_failure !== 1)
    console.log(label, c, 'raw_abstain', pct(g.filter(x=>x.reader_abstained===1).length,g.length).toFixed(1),
      'raw_answer', pct(answ.length,g.length).toFixed(1),
      'shown', sh.length,
      'not_found', pct(g.filter(x=>x.state==='not_found').length,g.length).toFixed(1),
      'verified', ve.length,
      'verified_acc', pct(ve.filter(x=>x.oracle_correct).length, ve.length).toFixed(1),
      'shown_acc', pct(sh.filter(x=>x.oracle_correct).length, sh.length).toFixed(1))
  }
}
```

The snippet above reads the artifact directly (runs `b113-`/`b117-`/`b118-`);
the generation commands produce the side files bound to those runs: use
**`private-4b-full.jsonl`** for B113 (the full N=100, full-length re-run
that restated it) and
**`private-4b-v3.jsonl`** / **`private-deepseek-v3.jsonl`** for B114 (corpus v3,
the paired readers `b117-private-4b-v3` / `b118-private-deepseek-v3`).
`private-4b.jsonl`, `private-deepseek.jsonl`, `private-run.jsonl` and the
`-v2` passes are **superseded** (truncated, ungrounded or pre-fix) and must not
be used for the current numbers.

| value | cell from the artifact | match to ledger |
|---|---|---|
| B113 4B answerable | shown 91 / verified 86 / shown_acc **81%** (74/91), verified_acc 83.7% (72/86) | ✅ ledger quotes 81% of shown (74/91) |
| B113 4B partial | verified 34 (0 correct — as labeled, forced-0, unaudited) | ✅ |
| B113 4B unanswerable | raw abstain **42%** → not_found 69 / verified 14 (0 correct — as labeled, forced-0, unaudited) | ✅ |
| B114 4B answerable | raw answer **98%** → shown 93 / verified 79 → **84.8%** (67/79), verified-wrong 12 | ✅ |
| B114 4B partial | verified 51 (0 correct — as labeled, forced-0, unaudited) | ✅ |
| B114 4B unanswerable | raw abstain **28%** → not_found 57 | ✅ |
| B114 deepseek answerable | raw answer **96%** → shown 96 / verified 95 → **98.9%** (94/95), verified-wrong 1 | ✅ |
| B114 deepseek partial | verified 17 (0 correct — as labeled, forced-0, unaudited) | ✅ |
| B114 deepseek unanswerable | raw abstain **98%** → not_found 98 | ✅ |

(B113 is quoted at its shown-denominator — 74/91 = 81% — per the round-4 pin;
72/86 = 83.7% is the same run's verified-only cell, not a disagreement. The
earlier `44%`/`81.4%` pair came from the superseded `private-4b.jsonl`.)

## Mechanical hop check (B111 fix) — needs the gitignored export

```sh
node bench/hopcheck-eval.mjs bench/results/private-4b-full.jsonl
```

| condition (N=100) | baseline verified | hop-checked verified | hop-checked coverage |
|---|---|---|---|
| answerable | 86% | 31% | 91% |
| partial | 34% | **0%** | 60% |
| unanswerable | 14% | 0% | 31% |

**Target met: partial verified 0% (<5%), answerable coverage 91% (≥85%).**

## 9B judge determinism (B110 analog) — judge-only, needs local Ollama

```sh
node bench/private-judge-repeat.mjs bench/results/private-4b-full.jsonl 3   # k=3
```

Full N=228 answered records: **0/228 score flips, 0/228 state flips, 0/684 nulls**;
of 135 items ever scoring 4–5, the median-of-k differs from the single stored pass
on **6**.

## v2/v3 private corpus (kimi golds + factA/factB) — generation + re-grade

```sh
OUT=bench/results/private-questions-v2.jsonl node bench/private-gen.mjs 100   # kimi-k3 generator, stores factA/factB
OUT=bench/results/private-4b-v3.jsonl READER_MODEL=qwen3.5:4b node bench/private-run.mjs bench/results/private-questions-v2.jsonl
OUT=bench/results/private-deepseek-v3.jsonl READER_MODEL=deepseek-v4.1-flash node bench/private-run.mjs bench/results/private-questions-v2.jsonl
node bench/hopcheck-eval.mjs bench/results/private-4b-v3.jsonl                # hop check
node bench/private-regrade.mjs bench/results/private-4b-v3.jsonl bench/results/private-questions-v2.jsonl   # re-grade (parse-failure bucket + gold-cover + both-facts)
```

`private-run.mjs` now does a **compact retry** on reader parse failure (matching the
kit); it cuts parse failures 15→3 (4B) and 37→6 (deepseek).

Answerable, on parseable rows (N=98 4B / 97 deepseek):
**oracle 74.5% (4B) / 96.9% (deepseek)**; gold-token coverage 76.5% / 92.8% (≈ oracle);
both-facts completeness 42.9% / 69.1% (a completeness rate, NOT accuracy).

## Not reproducible from stored outputs (pre-fix runs only)

- **Judge characterization** (B106 AUROC, B107 sweep, B110 flips, B111 coverage,
  B112 cross-family): these re-grade stored reader outputs with a judge, i.e. they
  make fresh model calls. Reproducing them requires re-running the judge (the
  recorded numbers are single-pass; hosted judges are nondeterministic).
- **Untruncated text / judge seconds / parse_failure in the OLD hotpot exports**
  (`hotpot-fresh-*.jsonl`, `private-deepseek.jsonl`): those files predate the export
  fix, so `answer`/`quote` are still truncated and `seconds_judge`/`parse_failure`
  are null there. The full-length, flag-carrying export applies to runs re-run since
  `2f3af5d` (e.g. `private-4b-full.jsonl`).

## Mismatches found & fixed

One mismatch was found: the B109 "4B reader + kimi" row — root cause was `fresh-snapshot.mjs` writing to a hardcoded path that a later kimi re-oracle of the deepseek reader overwrote (`hotpot-fresh-301-600-kimi.jsonl`), which `end-to-end.mjs` still read as "4B + kimi". Fixed (`2f3af5d`). Everything else reproduced to the recorded precision.
