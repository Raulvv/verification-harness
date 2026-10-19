# The Verification Harness

### How to measure — and trust — an abstaining QA system. A local 4B, a mechanical tri-state gate, a pinned artifact of recomputable records, and an audit that caught its own mistakes.

**The result first.** On held-out HotpotQA rows the frozen gate lifts a local
4B reader's unknown-abstention from **70.7% to 81.7%** for **+3pp** answerable
false-abstention — everything it keeps under `verified` is right **95.6%** of
the time (verified precision: the share of shown answers the independent oracle
confirms) — and it is **inert** for strong readers on the public arm
(deepseek, 27B: raw = gate on the answerable and unknown-abstention axes) —
with one measured carve-out: on partial support, the same strong reader's
gate score still separates correct from incorrect answers ~6.6× (§3.6). A fully local stack (4B reader + 9B judge, ~10 GB resident,
~8.5 s/question — eval-loop means, §5) lands within **3–4.5pp** of a 27B reader's verified precision —
directional, the Wilson intervals overlap — at **~2.4× the speed end to end**
(~4.7× on reader time alone) and **56% of the memory** (eval loop, §5). A
private, non-memorizable control closes the loop: questions generated from
this repository's own documentation — a corpus no model can have memorized,
written after the gate was frozen (§2.5) — with the same matrix run on it:
with memorization removed, the weak reader gives up ~9pp of answerable
accuracy and the strong reader gives up nothing (§3.6). And every
**[recomputed]** number in this
article derives offline, byte-for-byte, from a single sha256-pinned artifact
— the shipped `bench/results/unified-public.jsonl`, the public subset of the
canonical `unified.jsonl` (§2.7).

The product this article describes is two things: a **read-system** (the
retrieval-kit: receipt contract, mechanical citation gate, tri-state
sufficiency verdict) and the **harness that measures it** — the frozen-config
discipline, the schema-constrained judge, the private corpus, the partial
condition, and the reproduction pipeline. The harness is the part we argue you
should adopt even if you never run our kit: it is how you find out whether *your*
QA system knows when it doesn't know.

*The boundaries, up front.* The held-out numbers are HotpotQA — a public
benchmark whose gold answers a capable model may have seen, and whose
"unanswerable" condition is leaky: stripping the two gold paragraphs often
leaves the answer sitting in the distractors (§3.1). The private corpus is the
control, and it is clean-room: its docs were written after the gate was frozen
and were never used for its tuning (§2.5). The sufficiency judge's accuracy is oracle-relative —
a hosted model's opinion, validated on short golds — and the headline gate
numbers are a single pass of a judge we ourselves measure as nondeterministic
(§6.5). The partial-support blind spot (one hop of a two-hop question removed) is
**unsolved**: every configuration, at every size, verifies some partial items,
and of the items each stack marks `verified`, audited cells measure 12.5%–56%
wrong (§3.5–§3.6). We mark every number **[recomputed]** (derivable
from `unified.jsonl`), **[ledger]** (recorded in the claims ledger, reproduced
by a named script or a documented re-grade), or **[opinion]**.

---

## 1. Evaluating abstention is harder than evaluating accuracy

A QA system that always answers is easy to score: match against the gold. A QA
system that can *refuse* — that must decide, per question, whether its evidence
supports an answer — is harder to score, and the field's default metrics hide
the failure that matters. Four problems, each of which bit us during this arc:

**Binary abstention hides the middle.** "Answered or refused" forces a single
threshold on a continuous judgment. In practice a judge's support score has
three regimes: clearly unsupported (refuse), clearly supported (show, trusted),
and the middle (show, but flagged — the system saw something, not enough to
stake a verdict on). Collapsing the middle into either bucket loses the
operating point that makes the system usable: on our held-out run the middle
band holds **29 of 300** answerable items [recomputed] — real questions the
reader answered and the judge was unsure about, or failed to score (both land
in the same visible band) — and **19 of those 29 (65%)
are oracle-correct** [recomputed]: the band is information, not noise. A binary
policy must either hide them or lie about them.

**A judge is a noisy instrument.** The obvious way to grade "does the evidence
support the answer?" is to ask a model. But hosted judges are nondeterministic
even at temperature 0: kimi-k3, re-grading the *same* stored answers three
times, produced AUROC 0.845 / 0.862 / 0.825 against the accuracy oracle and
**flipped the gate state on 9.4% of items** between passes [ledger B110]. Any
single-pass *nondeterministic* judge number is a draw from a distribution
~0.04 AUROC wide on a fixed itemset —
wide enough to invent a gap between a local 27B judge and a hosted frontier
judge where none exists. Harnesses that report single-pass numbers from such a
judge are reporting dice rolls.

**Public benchmarks are contaminated.** HotpotQA's facts are in every capable
model's training data. A strong reader answers from memory; retrieval becomes
decoration; and a harness evaluated only there cannot tell reading skill from
recollection. So we measure the inflation directly instead of asserting it —
same reader, same judge where the runs allow it, public vs private corpus
— and §3.6 reports the comparison: the 4B reader (judge-identical pair)
gives up **~9pp** of answerable accuracy when memorization is removed, the
deepseek reader (judge differs between the two cells; disclosed) gives up
nothing; a harness on public data
alone would never even notice the question.

**Evaluation code clobbers its own outputs.** Our own arc produced the cautionary
example: a snapshot script hardcoded its output path; a later re-oracle run
overwrote a 4B-reader file with deepseek-reader data; the end-to-end table then
reported a "4B + hosted judge" row that was, in fact, a strong-reader row —
understating the 4B stack's coverage by **9 points** (88% printed vs 97%
genuine) and overstating its verified precision [recomputed; §4]. Nothing
crashed. The number was simply wrong, and only a byte-for-byte reproduction
pass caught it.

These are not exotic failure modes. They are what happens when you evaluate an
abstaining system with the same informalism you would use for a classifier. The
rest of this article is the harness we built in response — piece by piece, with
the measured consequences of each decision.

*Why not just turn on RAGAS?* [opinion] If your team evaluates RAG today, the
odds are a toolkit score or fifty golden questions eyeballed by whoever wrote
them. The four failures above are precisely what those setups inherit: a single
judge call reported as a number (no k-repeat, no flip rate), a binary
faithfulness label (no priced middle band), a public benchmark (memorization
uncontrolled), and results that live in a dashboard rather than a
content-addressed file anyone can re-derive. The harness is not a rival
library — the pieces map one-to-one: a schema-constrained judge is a custom
metric class with `response_format`, the accuracy oracle is a second judge from
a different family, and the reproduction layer is arithmetic over one JSONL
file (pandas, `jq`, a forty-line script — the method is language-free; our
scripts happen to be JavaScript). What the toolkits do not give you is the
discipline: a frozen config committed before the run, two readers and two
judges by default, and a published artifact that makes every number
re-derivable.

---

## 2. The harness, piece by piece

Seven components. Each exists because a specific failure mode forced it; each
is adoptable independently of the rest.

### 2.1 The tri-state policy

The shipped policy maps the judge's 1–5 support score — and the reader's own
abstention — to three states:

```
reader abstained                    → not_found
judge returned no score             → unverified  (fail_reason: judge_no_score)
score <  lo (=2)                    → not_found
lo ≤ score < hi (=5)                → unverified
score ≥ hi (=5)                     → verified
```

Three properties are load-bearing. **The reader's abstention is the first
citizen**: if the model itself refused, no judge can resurrect the answer.
**A missing score is never dropped**: a judge that fails to return JSON leaves
the item `unverified`, visible, rather than silently removing it from the
denominator (B95 had 14 such items; two were correct) [recomputed]. **The
bands are frozen before the run**: `lo=2, hi=5` was committed to
`gate-config.json` *before* the held-out run that validates it — the operating
point was not tuned on the rows it is scored on. The kit ships this as
`ask --sufficient --unverified`; the harness runs the identical mapping
(`stateOf` in `bench/hotpot-fresh.mjs`), so the experiment *is* the product
policy, not an approximation of it.

Raw (no gate) is defined as the reader's abstention flag alone. Every table
below reports both.

### 2.2 The schema-constrained judge

The judge is asked one question — *does the retrieved evidence support the
answer?* — and must answer with `{score: integer 1–5}` enforced by a JSON schema
(`response_format: json_schema` on hosted endpoints, `format: 'json'` on
Ollama). This is not cosmetic: prose verdicts fail differently per model family
(deepseek and gpt-oss each
fail schema validation differently; gpt-oss:20b returns schema-nulls in the
judge sweep [ledger B107]), and a regex over reasoning
text is an eval bug waiting to fire. The schema makes a non-compliant judge
fail *loud* — an empty string, counted as `judge_no_score`, never as a score.

The judge sees the **whole retrieved window**, not the answer's own quote: the
question is "does the evidence the system actually read support the claim," and
bounding it to the receipt's quote under-supports synthesis answers (measured
earlier on the Confluence battery). This is a config knob
(`--judge-evidence window|receipt|union`) — the frozen gate uses `window`.

### 2.3 The independent oracle

Correctness labels — *is the answer actually right?* — come from a **separate**
hosted judge (deepseek-v4.1-flash by default; kimi-k3 for the schema-clean
re-grades), never from the sufficiency judge and never from the reader. Two
disciplines travel with it. **Cross-family where possible**: the 4B reader
(qwen3.5) is graded by deepseek — no self-family leakage. **Self-family is
flagged, not hidden**: the deepseek-reader runs use a deepseek oracle
(self-judge risk), and the harness quantifies it — re-grading the same answers
with kimi moves accuracy 97.7% → 98.1%: no material self-inflation, but the
caveat stays in the ledger [ledger B103]. The oracle's own error rate is
estimated against a mechanical contains-gold proxy (88.1% agreement, κ 0.522 on
short golds [ledger B103]) — validation, not trust.

### 2.4 The frozen-config discipline

`bench/gate-config.json` — thresholds, judge, evidence mode, prompt tier — is
committed **before** the run it governs. Held-out means *the config never saw
these rows*: B95 evaluates rows 301–600; the operating point was tuned on rows
1–300 and an earlier dev set. This is trivially easy to skip and impossible to
reconstruct afterwards; without it, every threshold number is a training error.
The reader model and prompt tier are *not* held out in B95 (they were developed
on rows 1–300) — the claim is scoped to the *gate operating point*, and the
ledger says so.

### 2.5 The private, non-memorizable corpus

HotpotQA answers may be recalled. The control is a corpus no model has seen:
100 two-hop questions **generated from this repository's own documentation**
— the files this repo ships (README, this article, the kit's docs, the
benchmarks note, and the claims-ledger excerpt), a set written
after the gate was frozen and never used for its tuning (clean-room),
published after the training cutoff of every tested model. The exact file list
and per-file sha256 are pinned in `corpus/manifest.json`, frozen before any
question is generated — numbers never precede their corpus. Each question
stores both gold documents (`factA`/`factB`) and passes a grounding filter
(≥60% of the gold answer's content words must appear in the two docs — a
generator that hallucinates beyond its own truncation window is caught), under
three **by-construction** conditions:

- **answerable** — both hops present;
- **partial** — one gold hop removed (the other stays);
- **unanswerable** — both removed, with topically related distractors left in.

The partial condition is the harness's most important contribution beyond the
binary: it simulates the failure retrieval systems actually produce — the
window contains *part* of the answer — and it is the one condition every
configuration fails (§3.5). The questions come from a model (kimi-k3), which
makes the golds themselves an instrument with error bars; the grounding filter
exists because a first-pass generator hallucinated golds beyond its own
truncation window (§4 keeps that correction — and its model-done spot-check —
visible).

### 2.6 The compact-retry decode fix

Small models fail JSON decode: a constrained JSON answer can stall mid-object,
and the parser rejects the partial. The fix is the kit's own production
behavior — one tight re-ask on a truncated decode — and parse failures are now
their own bucket (`fail_reason: parse_failure`), never folded into abstention:
a decode failure is an infrastructure event, not an honest "the docs don't
say." The record had to learn this the hard way: an earlier export folded
parse failures into abstention, and the corrected export is how we found it
(`report §8.5`). The fresh private run's parse-failure counts sit in §3.6's
table [recomputed: **0** for the 4B, **10/300** for deepseek].

### 2.7 Verifiability: one artifact, one checksum, offline recomputation

Every run the article cites is in **`unified.jsonl`** — one JSON object per
(question × condition) with the reader's answer, the judge's
score, the tri-state, the oracle label, timings, and the condition's gold. The
file is pinned by `unified.jsonl.sha256` (hash in the closing note), and every
rate, count, and reader timing below is recomputable with a forty-line script
and **zero model calls** (judge timings come from the characterization sweep,
§3.3) —
the stored outputs *are* the measurement; recomputation is arithmetic. The
full artifact stays in the canonical tree and never ships; this repo ships
its public subset `bench/results/unified-public.jsonl` (sha256-pinned), and
this section and `reproduce.md` are the spec for rebuilding the same
discipline over your own outputs. Where a number requires re-grading (the
judge-characterization AUROCs — they were produced by
re-calling judges on stored answers), it is marked **[ledger]**, and the
ledger row names the script that produced it. Where a number requires an
**oracle audit** — answered partial and unanswerable rows whose run-time
`oracle_correct` was forced to 0 (§3.5) — it is marked **[report]**, and the
committed audit side-file (`bench/results/audit-*.jsonl`, joined by
(run, id, condition, state)) is the source: the raw run record keeps its
run-time labels forever, the correction lives beside it, never inside it —
so a re-derivation joins the two files, and the blind second-pass verdicts
travel with each audit. [report] numbers are not offline-arithmetic like
[recomputed] ones; they are reproducible *file joins* over recorded model
verdicts, one model call per row already paid for and stored — and
`verify-offline` performs those joins on the audited share cells (the §3.5
and §3.6 splits), so every audited polarity is machine-checked against the
shipped side-files; the verdicts themselves remain recorded model calls.

This is the receipt discipline applied to the experiment record itself: an
article number that does not recompute from the artifact is a bug in the
article, found by the artifact — the same way the harness found its own
clobbered file (§4).

---

## 3. The results: the full reader × judge matrix

All runs are HotpotQA distractor dev unless marked *private*. "Raw" is the
reader's abstention alone; "gated" applies the frozen tri-state. Verified
precision is the share of items the gate marked `verified` that the independent
oracle says are correct — the metric that matters if you show `verified`
answers to a user. False-accept counts unanswerable items the gate marked
`verified` (the fabrication leak). Reader timings are per record, from the run
exports; judge timings come from the characterization sweep (§3.3) — the
HotpotQA exports do not store per-record judge seconds. Every local model ran
via Ollama on the reference machine — a MacBook Pro (M4 Max, 34 GB RAM) — and
hosted latencies were measured client-side on the same box; absolute seconds
are that machine's, not a server's (§5).

### 3.1 The gate earns its keep on a weak reader

B95 — the headline experiment: the frozen config (`lo=2, hi=5`, kimi judge,
window evidence, schema-constrained), reader `qwen3.5:4b` (local), held-out
rows 301–600, N=600 [recomputed]:

| metric | raw | gated | Δ |
|---|---|---|---|
| unknown-abstention (unanswerable → not_found) | 70.7% | **81.7%** | **+11.0pp** |
| answerable false-abstention | 4.7% | 7.7% | +3.0pp |
| accuracy among shown (answerable) | 89.5% (256/286) | 92.4% | +2.9pp |
| verified precision (answerable) | — | **95.6%** (n=248) | — |
| verified precision (pooled, incl. unanswerable) | — | 90.1% (n=263) as labeled; **93.9% (247/263) audited** [report] | — |
| false-accept (unanswerable → verified) | — | 15/300 | — |

The trade is the point: **+11 points of unknown-abstention for +3 points of
answerable false-abstention**, and everything the gate keeps under `verified`
is right 95.6% of the time (Wilson 95% CI 92.2–97.5) [ledger B95] — one
hosted-judge pass, so read the gate-state rates as ±1–2pp — a heuristic, not a
measured bound (§6.5). The gate is
not free — it ends with 23 of 300 answerable questions hidden (7.7%; the raw
reader already hid 14 of them) — but the price is mostly cosmetic: the 9 answers the gate
*newly* hides are **0-for-9 against the oracle** — every one of them would have
been wrong [recomputed]. It is a *priced* trade, made on rows the config never
tuned on, with the price printed on the table.

The scary row has a footnote too. An audit of all 26 errors in this run
(model-done — disclosed §3.4) found the **15/300 false-accepts are largely the
gold's fault**: removing the
two gold paragraphs left the answer supported by the remaining distractor text
in 11 of 15 cases, 2 more were memorized-correct outside the window, and only
**2 are genuine fabrications** — so HotpotQA's unanswerable condition is leaky,
and 15/300 is an upper bound [ledger B96, N=26 audited]. A committed re-audit
of the same 15 false-accepts, under this article's stricter standard
(a "supported" answer must match the gold's fact, not merely sit in a
topic-related remaining sentence), puts the split at **10 supported /
5 genuinely wrong** — the 2 B96 named (Kanye/*Graduation*; the *Mera Damad*
actor) plus 3 fact-contradicting answers the looser pass had counted as
supported (wrong song/release for Solheim, wrong birth date for Morel, wrong
piece for Beethoven) [report:
`bench/results/audit-hotpot-b95.jsonl`, blind second pass]. Direction unchanged — the
false-accept row is still an upper bound — magnitude not: the audited pooled
precision is **93.9%**, and the table above prints both.

The gate also beats the cheap alternatives at matched coverage. At the gate's
55.3% shown-or-flagged coverage (all 600 rows; the §3.4 tables count coverage
answerable-only), the best top-1-retrieval-score cutoff under that same
coverage cap reaches only 71.7% decision accuracy, and the best mean-log-prob
cutoff 64.2% — against the gate's **83.5%** (a correct decision = right answer
shown or correct refusal; a show-nothing rule scores 50% by construction)
[recomputed, B97]. The judge adds information that
neither retrieval similarity nor reader confidence carries; it is not a
threshold on a signal you already had.

### 3.2 The gate is inert on a strong reader — by design

The same frozen gate — the same kimi judge as §3.1 — run unchanged on two
strong readers, moves nothing:

| reader | N | unknown-abst (raw = gate) | false-abst | acc among shown | verified prec (answ / pooled) | false-accept | tri-state fired |
|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash (hosted) | 600 | 93.0% | 13.7% | 97.7% | 97.7% / 91.3% | 18 | 4 times |
| qwen3.8-27b q4 (local) | 200 | 91.0% | 7.0% | 97.8% | 97.8% / 92.8% | 5 | 5 times |

[recomputed] *Tri-state fired* counts items the reader answered that the gate
flagged `unverified` (score in [2,5)) instead of trusting it — the flag, not a
demotion. A strong reader already abstains on 91–93% of unknowns and answers
correctly ~98% of the time — on answerable rows the gate has little to catch —
and the few flags that fire are weaker catches than they look. Their location
is right: 3 of deepseek's 4 and 4 of the 27B's 5 sit on unanswerable items the
reader answered anyway [recomputed] — but audited, only **1 of the 9 flagged
answers is actually wrong**: the two answerable flags carry live oracle labels
(both correct), and of the 7 unanswerable flags the strict oracle and an
independent blind pass agree (7/7) that **6 are gold-correct** — correct
answers whose gold the window by construction did not contain (B96's leak
shape: remaining text or memory, not resolved per row here)
[report: `bench/results/audit-hotpot-b102.jsonl`, `bench/results/audit-hotpot-b104.jsonl`]. So the flag
is an evidence check — *this window does not back that answer* — not an error
detector; on a strong reader it almost never coincides with a factual
mistake. The flag fires
on only 4–5 of 200–600 items. This is the finding
that *scopes* the product: **the sufficiency gate's abstention value is
reader-dependent**. It is a crutch for a weak reader, not a reader-independent
safety layer. What the strong reader still gets, at every size, is the other
half of the system the gate does not measure: the mechanical receipt — a
byte-verbatim citation a machine re-checks — which is size-free and
traceability, not accuracy (the kit's earlier finding, and unchanged here).

One measured carve-out, from the private arm (§3.6, reading 2): the
"raw = gate" equivalence above holds on answerable and unknown-abstention
axes, but on **partial support** the same strong reader's gate score is not
inert — its `verified` flag marks gold-correct answers 79.4% of the time
while its unverified-shown answers are correct 12.0% of the time (Wilson
intervals non-overlapping). The precise statement is therefore: the gate is
inert exactly where the strong reader is already right (answerable rows,
honest abstention) and informative exactly where it is most often wrong
(partial support) — it does not add accuracy to a strong reader, it *sorts*
its residual uncertainty. The claim of §3.1 — "inert for strong readers" —
should be read with this scoping; this section's table was measured on the
public arm, where the partial condition's false-verifies (B108-style,
§3.5) were the one place "raw = gate" already quietly failed.

One honest asterisk on the deepseek row: its accuracy oracle is deepseek
itself (self-family). The harness re-graded the same answers with kimi:
98.1% vs 97.7% self-judged — no material self-inflation, but the caveat stays
in the ledger [ledger B103].

### 3.3 The judge is a dial, not a switch: local judges, characterized

If the gate is only useful for weak readers, the next question is what the
judge costs — and whether it can run locally. Three experiments answer it,
all re-grading the **same stored 4B answers** (the judge is isolated from the
reader by construction).

**Discrimination (AUROC vs the accuracy oracle), single pass** [ledger B107]:
qwen3.5:4b **0.781** · qwen3.5:9b **0.835** · qwen3.8-27b q4 **0.860** ·
kimi-k3 (hosted) **0.910**. The 4B self-judge is too weak to grade its own
family. gpt-oss:20b does not honor the JSON schema at
all and cannot serve as a judge without a porting layer.

**Determinism (k=3 repeats on the same 127 outputs)** [ledger B110]: the local
9B reproduced **0.835 / 0.835 / 0.835** — zero score flips, zero state flips,
zero nulls. Hosted kimi produced 0.845 / 0.862 / 0.825 and **flipped the gate
state on 9.4% of items** between passes. A gate whose label depends on which
pass you drew is not a gate: for any application that must be reproducible,
the local judge is a *reliability upgrade*, not a downgrade — and the hosted
judge's apparent +0.05 AUROC edge over the 27B (0.910, one N=200 pass) does not
survive replication: on a 127-item subset it re-reads 0.825–0.862 across three
passes (mean 0.844) [ledger B110], and a paired comparison on identical
outputs (N=200) puts it at 0.861 vs the 27B's 0.849 — the two judges are tied
within noise, and the 0.05 gap between the sweep's 0.910 and the paired 0.861
(same protocol, two single kimi passes over the same stored answers) is itself
the dice-roll point [ledger B106, B107]. A full re-run on 2026-10-16 — same
script, same stored answers — closed the file: the three local judges
reproduced **0.781 / 0.835 / 0.860** to the third decimal, while kimi
re-scored **0.855** — inside the 0.825–0.862 band this section's own repeats
had already measured [ledger B110], and below the 27B it originally beat.
Across days, the local numbers did not move; the hosted one never stayed
still [ledger B107, B110].

**End-to-end equivalence (4B reader, rows 301–400, N=200)** [recomputed — all
columns except *judge-only cost*, which is §3.3's original characterization
sweep at nominal model sizes (§5, ledger B107; the 2026-10-16 re-run appears
in the cost table below)]: a
27B local judge vs the hosted kimi judge on the same reader:

| judge | gate unknown-abst | false-abst | acc among shown | verified prec (answ / pooled) | false-accept | judge-only cost |
|---|---|---|---|---|---|---|
| qwen3.8-27b q4 (local) | 90.0% | 6.0% | 95.7% | 95.6% / 90.5% | 5 | ~16.9 s, 17.8 GB |
| kimi-k3 (hosted) | 85.0% | 3.0% | 91.8% | 96.5% / 91.2% | 5 | ~4.3 s, 0 GB |

The 27B local judge is slightly stricter (more abstention) but lands within
1pp of hosted verified precision with an **identical false-accept count** —
the whole gate can run with zero egress. The paired comparison on identical
outputs (B106) puts the agreement at κ 0.825 with states agreeing on 179/200
items [ledger]. The 9B sits between: usable (AUROC 0.835, deterministic,
6.6 GB, ~4.2 s) but visibly looser — its end-to-end verified precision is
88.3% pooled vs the 27B's 90.5% and kimi's 91.2% (§3.4). Cross-family local
alternatives at 4B (gemma3:4b AUROC 0.584, phi4-mini 0.627) are near-random —
deterministic and schema-valid, but not usable [ledger B112]. The same-family
caveat (qwen reader judged by qwen) stands unresolved; no ≥9B cross-family
local judge was available to test.

**What the dial costs** (token-measured re-run, 2026-10-16, same script and
stored answers) [ledger B107]:

| judge | resident | AUROC | s/rec | tokens/call | marginal $/1k judged |
|---|---|---|---|---|---|
| qwen3.5:4b (local) | 3.4 GB | 0.781 | 2.4 s | 1,494 | $0 |
| qwen3.5:9b (local) | 6.6 GB | 0.835 | 4.5 s | 1,494 | $0 |
| qwen3.8-27b q4 (local) | 17.8 GB | 0.860 | 17.3 s | 1,583 | $0 |
| kimi-k3 (hosted) | — | 0.855 | 3.0 s | 1,769 | ~$7.43 |

The judge prompt is ~1.5k tokens regardless of model — the evidence window
dominates, and the local judges finish the schema in 11 completion tokens
(kimi writes 177; token counts across backends use each one's own tokenizer,
so magnitudes, not decimals, are the comparison). Hosted dollars are an **estimate** at
zen's posted API rate ($3/$15 per 1M, October 2026) applied to the measured
means; the locals are $0 marginal on hardware the reader already occupies, and
seconds-per-record varied between passes with machine conditions (the
locals' AUROC did not). The upshot: on public data the judge dial is
measurably free — the hosted judge's original AUROC edge did not survive
replication, its determinism never held (B110), and the 9B — not the 27B —
is the floor worth
buying down from. On private data the dial is free twice over: the judge sees
the evidence, which is your document text, so the local judge closes the
judge leg of §5's egress rule — and with a local reader the whole stack *is*
that rule — while the reader, not the judge, sets the accuracy ceiling (§3.6:
local vs hosted reader under the same free judge).

### 3.4 End to end: what each stack actually buys you

The corrected end-to-end table (rows 301–400; coverage = answerable items shown
or flagged; unk-abst = unanswerable → not_found; ver-wrong = items marked
`verified` that the oracle says are wrong, across both conditions) [recomputed]:

| stack | coverage | unk-abst | pooled ver-prec | ver-wrong | reader s/rec | resident |
|---|---|---|---|---|---|---|
| **4B + kimi judge** (hosted judge) | 97% | 85% | 91.2% | 8 | 2.97 s | 3.4 GB |
| **4B + 27B judge** (fully local) | 94% | 90% | 90.5% | 9 | 5.54 s | 21.2 GB |
| **4B + 9B judge** (fully local) | 97% | 89% | 88.3% | 12 | 4.33 s | 10 GB |
| **27B reader, no gate** (local) | 93% | 91% | 92.8% | 7 | 20.17 s | 17.8 GB |
| **deepseek reader** (hosted, no gate delta) | 88% | 92% | 92.6% | 7 | 3.47 s | — |

The comparison that matters for adoption: **4B + 9B judge vs the 27B reader**.
Comparable coverage (97 vs 93) and unknown-abstention (89 vs 91); the 27B is
ahead on verified precision by 3.0pp answerable-only (97.8 vs 94.8) and 4.5pp
pooled (92.8 vs 88.3) — directional on N=200 (the Wilson intervals overlap:
27B pooled 85.8–96.5 vs 4B+9B 80.7–93.2), so read it as a consistent edge, not
a settled magnitude — while the 4B stack is **~4.7× faster on reader time
(~2.4× end to end; the stack total includes the judge the ungated 27B row
skips) at 56% of the resident memory**, and carries the tri-state
flag the raw 27B reader does not produce. The 4B + hosted-kimi stack *exceeds* the 27B's coverage (97 vs 93)
at 1/7 the reader latency, conceding unknown-abstention (85 vs 91) and
reproducibility (§3.3) for the best verified precision the 4B can reach.
Every stack leaks the same shape of residual error: 7–12 verified-wrong items
per 200 — what the sufficiency judge does not catch. The hand-audit split on
the B95 run's 11 verified-wrong: **5** oracle-strictness on correct-but-
incomplete answers, **4** genuinely wrong, **2** supported-but-gold-differs
[ledger B96]; the private-corpus equivalent is §3.6's audited cells —
residual verified-wrong per 100: **10** answerable + **27** partial + **14**
unanswerable for the 4B, **2 + 7 + 4** for deepseek [report], the partial
and unanswerable shares audited the same way (blind second pass, zero or
near-zero disagreement) — with the disclosure that these "hand" audits are
performed by a model, not a human, and that B95's finer three-way sub-split
(oracle-strictness vs genuinely-wrong vs supported-but-gold-differs) was
not re-run on the private arm. The one-hop partial class is counted
separately in §3.5.

*(An earlier version of this table mislabeled the deepseek row as "4B + kimi";
the artifact caught it — §4. The 4B + kimi row above is recomputed from the
genuine B95 outputs sliced to the same 200 items. Oracle note: the four
qwen/27B rows carry the default deepseek accuracy oracle; the deepseek row
carries the independent kimi re-oracle (b103b), which moved its accuracy
97.7% → 98.1% — no material difference [ledger B103].)*

**The same stacks under real retrieval — b121 (2026-10-18, N=300).** Every
window above was *given* — gold docs or by-construction fixtures. b121 removes
that gift: HotpotQA distractor-dev questions answered over an open pool of
2,964 paragraphs, each paragraph gold for one question and a distractor for the
others, so retrieval can genuinely miss. The IR side uses only established
methods, measured rather than invented — both-gold recall@6:
**83.3% dense · 76.7% hybrid (RRF) · 88.0% iterative** — the iterative arm is
the hybrid window plus a 40-token bridge re-query, the multi-hop lever
[recomputed].

Reader accuracy over that open pool: bare **25.3%** · naive **80.3%** · ours
**80.3%** — deepseek's strict oracle, naive and ours reading the same iterative
window: retrieval buys the 25→80, and the harness's contribution on top is the
flag, not the score [recomputed].

The gate itself, both judges, over byte-identical reader answers (the 9B arm
re-judges the stored answers against recomputed windows — 0 window mismatches)
[recomputed]:

| b121 stack | shown coverage | pooled ver-prec | ver-wrong | same stack, gold windows |
|---|---|---|---|---|
| **4B + kimi judge** (hosted) | 89.7% (269/300) | **93.5% (215/230)** | 15 | 91.2% |
| **4B + 9B judge** (fully local) | 90.3% (271/300) | **88.2% (232/263)** | 31 | 88.3% |

Verified precision lands within noise of the gold-window numbers above:
**retrieval noise costs coverage (97% → ~90%), not trust**. The two judges
agree on the state of **85.3% (256/300)** of items; where the local judge
promotes the hosted judge's middle band, **20/36** are correct; judge latency
is at parity (kimi 3.76 s/rec vs 9B 3.32 s/rec over the 279 answered rows),
and the local arm reuses the hosted arm's reader answers exactly — the gap in
the table is the judge alone, worth ~5pp for going $0. The `not_found` rows
(31 kimi / 29 local) are refusals: 21 reader abstentions plus answers the
cutoff pushed down — and, by the runner's design, refusals are never
oracle-checked (forced 0; the §3.5 lesson about by-construction labels applies
to this run's refusal rows too).

Caveats at the numbers: public, memorizable data — §1's inflation applies to
the 80% — and all two-hop (this pool has no factual/single-hop stratum; §6's
sample-size and k-repeat limits stand as written). One run, one pass per
judge, and the fully-local stack is same-family three-deep: reader, judge,
embedder (§6.4). Four upstream HotpotQA gold keys were wrong; the pinned
artifacts carry the corrected golds with every affected row re-labeled by the
same strict oracle, and one item is unescrutable — the audit trail is §4.

### 3.5 The partial-support blind spot: measured, and unsolved

The harness's third condition is the one every configuration fails. Give the
reader a two-hop question, put **one** gold hop in the window and remove the
other, and ask the gate to judge what comes back. On HotpotQA (B108,
4B+kimi, N=100/condition) [recomputed]: 53% of partial items are rejected
(`not_found`), 31% flagged, and **16% marked `verified` — and after a strict
oracle audit of those 16, 14 are gold-correct: only 2 of 16 (12.5%) are
actually wrong, so the gate false-verifies partial support at 12.5% on this
arm** [report: `bench/results/audit-hotpot-b108.jsonl`, blind second pass 22/22 (16/16
on the shown-partial subset)]. An earlier version of this cell
read "every one of them wrong (0% verified accuracy)" — that was a
by-construction label, not a measurement: the run's oracle pass was never
asked on answered partial rows, so `oracle_correct` was forced to 0. A
restatement of the correction then inverted the audit's polarity, reading
the 14 gold-correct rows as 14 wrong; the committed split is 14/16
gold-correct (blind-confirmed 16/16 on this subset), and the audit is
*better* for the gate than the forced label claimed — on this public arm
most removed hops turned out unnecessary (the question stayed answerable
from the surviving window, the artifact B96 documents). The severe
false-verification lives on the private arm: those partial rows, audited
the same way, land in §3.6 — same failure class, both readers, with a
measured split the gate's own score actually tracks for the stronger one.

The mechanism is mechanical: the surviving hop *is* real evidence for a related
claim, and a judge scoring "does the window support the answer?" against one
true hop says yes. Asking the judge to enumerate required facts does not fix
it: the hop-coverage judge reclassifies partials from `verified` to
`unverified` but leaves 13 of the 16 items `verified` (measured on the
pre-audit labels: the audit found only 2 of the original 16 answers
genuinely wrong, so at most 2 of those 13 can be false-verifies) — and at 9B the judge
rubber-stamps the missing hop as supported [ledger B111]. The only check that
closes the class is **mechanical**: require the receipt to cite *both* source
documents. Run in best case (the two gold docs handed to the checker), it takes
partial verification to **0%** for both readers — but it demotes the 4B's
answerable verified set from 79% to 58% (over-strict: the 4B cites both docs on
only 70% of answerable items even when its answer is right) [report §8.6]. The
unsolved half is **decomposition** — deriving which documents a question
*needs* without being told — and until it is solved, the honest statement is:
the gate catches full fabrications and full abstentions; it does not catch
half-truths.

### 3.6 The private corpus, final numbers

The private arm runs the same matrix as §3 on the frozen corpus (§2.5):
kimi-k3-generated questions over the eight files pinned in
`corpus/manifest.json` (the article's own documentation — no model can have
memorized it), grounding-filtered, three by-construction conditions,
N=100 per condition, two readers (the local 4B and the hosted deepseek)
under the local 9B judge — 600 rows, runs `b119-cleanroom-4b` and
`b120-cleanroom-deepseek`, both in the pinned artifact (§2.7). deepseek is
also the oracle (§2.3's self-oracle caveat applies to the deepseek row).
Parse-failure buckets (§2.7's pointer): **0** for the 4B, **10 of 300**
(3.3%) for deepseek — 2 answerable, 6 partial, 2 unanswerable — each a
recorded `parse_failure`, never folded into abstention.

Every state cell below is [recomputed] from `unified.jsonl`. Every
**accuracy** cell on the partial and unanswerable rows is [report]: those
rows' `oracle_correct` was forced to 0 at run time (the oracle pass was
never asked on answered partials — §3.5), and the true labels live in the
committed audit side-files (`bench/results/audit-classify.jsonl`,
`bench/results/audit-partial-unverified.jsonl`), joined by (arm, id, condition, state),
each label blind-pass-confirmed (disagreement rate: 5/107 adjudicated on the
private pre-audit, 0/65 on its partial rows, 0/68 + 0/22 + 0/7 on the
HotpotQA audits; the b108 pass is the 22-row condition-keyed re-key of an
earlier 18-row id-keyed pass). The
cells are written after the corpus that produced them, never before.

**4B reader (`b119-cleanroom-4b`).**

| condition | shown | verified | verified correct | unverified-shown correct |
|---|---|---|---|---|
| answerable | 96% | 82 (85.4% of shown) | **87.8%** (72/82, CI 79.0–93.2) [recomputed] | — |
| partial | 88% | 48 (54.5% of shown) | **43.8%** (21/48, CI 30.7–57.7) [report] | 17.5% (7/40, CI 8.7–32.0) [report] |
| unanswerable | 64% | 16 (25.0% of shown) | **12.5%** (2/16, CI 3.5–36.0) [report] | not audited |

**deepseek reader (`b120-cleanroom-deepseek`).**

| condition | shown | verified | verified correct | unverified-shown correct |
|---|---|---|---|---|
| answerable | 98% | 92 (93.9% of shown) | **97.8%** (90/92, CI 92.4–99.4) [recomputed] | — |
| partial | 59% | 34 (57.6% of shown) | **79.4%** (27/34, CI 63.2–89.7) [report] | 12.0% (3/25, CI 4.2–30.0) [report] |
| unanswerable | 12% | 9 (75.0% of shown) | **55.6%** (5/9, CI 26.7–81.1) [report] | not audited |

Four readings, in the order they matter:

**1. The contamination inflation is reader-dependent, and it is large where
it exists.** §1's comparison, now filled in: same local 9B judge, same
oracle, public (HotpotQA, B109) vs private corpus — for the **4B** the
answerable shown-accuracy falls **93.8% → 84.4%** and the verified
precision **94.8% → 87.8%** [recomputed, both sides]: the weak reader was
living off memorized answers to the tune of ~9pp on the public set. For
**deepseek** the same comparison is **flat** (97.7% → 98.0% shown-accuracy)
[recomputed; caveat: the public deepseek cell carries the hosted kimi judge
and the private cell the local 9B — at 86–98% coverage the shown set
barely moves, but the pair is not judge-identical]: the strong reader
needs no memory it might have. The inflation the public-benchmark critique
predicts is real, and it is a property of the *reader*, not of the
harness — which is exactly why a harness measured only on public data
cannot see it.

**2. The partial-support class reproduces, with the split the gate's own
score tracks — for one reader.** Partial false-verification on the private
corpus: 4B 43.8% of verified items correct (so **56% false-verify**),
deepseek 79.4% (**21% false-verify**). And the unverified-shown column is
the new measurement: the gate's sufficiency score *separates* correct from
incorrect partial answers — deepseek 79.4% vs 12.0% (the Wilson intervals
do not overlap), 4B 43.8% vs 17.5% (they barely touch). So §3.2's "inert
for a strong reader" survives on answerable rows but needs its carve-out
here: on partial support, trusting `verified` alone buys the strong reader
a 6.6× selective-precision lift over taking everything it shows — the gate
is not inert on this class, it is *the one place on the private corpus its
score earns its keep*. For the weak reader the separation exists and still
lands `verified` below a coin flip: the blind spot's home turf. One in
five of the strong reader's verified partials is still wrong; the class is
better sorted, not closed.

**3. The unanswerable condition's verified-correct cells are a corpus
redundancy artifact, disclosed as such.** 2/16 (4B) and 5/9 (deepseek) of
the verified unanswerable answers are gold-correct — inspection shows
these are self-referential questions about this harness whose facts are
restated across sibling fixture docs, so removing the *named* gold document
often leaves the fact standing in another (the eight-doc corpus documents
itself densely). This is B96's HotpotQA shape on a new corpus — there,
11 of 15 "false-accepts" were supported by the remaining text — and it
means this condition is a **lower bound** on fabrication-catching here, not
a clean fabrication test. A sparser corpus would score the same gate
better; we report the number we measured.

**4. Private-corpus windows are wider, so the loop is slower.** Up to six
documents × 3000 characters per window vs HotpotQA's two-hop windows:
reader means **12.3 s** (4B) and **8.1 s** (deepseek), judge means **9.0 s**
and **5.7 s** — **~21.2 s** and **~13.9 s per question** end to end
[recomputed] — against ~4.3 s for the 4B on HotpotQA. §5 prices these
stacks with these numbers; the per-record times are in the artifact.

---

## 4. Why you can trust these numbers: the harness audits itself

Every eval harness eventually publishes a wrong number. The distinguishing
property is not error-free output — that does not exist — but a **reproduction
discipline that catches the error before a reader does**. This section lists
what the harness caught in its own record, because the list *is* the
methodology's strongest evidence.

**The clobbered file (the material one).** `fresh-snapshot.mjs` hardcoded its
output path. Run once (B100) with the 4B outputs as input, it wrote the
expected file; run again (B103b) to re-oracle the *deepseek* reader's answers
with an independent judge, it overwrote the same filename. The end-to-end
table (B109) then read that file as "4B + hosted judge" — reporting a
strong-reader row under a weak-reader label, understating the 4B stack's
coverage by 9 points. The reproduction pass caught it because recomputing the
row from the *original* B95 artifact gave different arithmetic than the table:
the deepseek file's 300 answerable answers were **byte-identical** to the
deepseek run's (verified from `unified.jsonl`: `b103b` answers ≡ `b102`
answers, answer by answer). Root cause fixed; the corrected row is §3.4; the
mislabeled number never appears in this article without its correction.

**The mislabeled column.** Every fresh-run export hardcoded `judge_model:
"kimi-k3"` — including the runs whose actual judge was the local 27B or 9B.
The judge *results* were correct; the provenance column lied. Fixed in the
export; the fix is why this article cites judges from the run commands, not
from that field, for pre-fix files.

**The drifting definition.** "False-accept" appeared in the record with three
different meanings: unanswerable items marked `verified` (B95),
`verified && wrong` across all conditions (B109), and answerable
`verified && wrong` (B113). All three are computable from the same artifacts —
the 27B reader's "5 vs 11 vs 7" discrepancy across reports was three
counting rules over one dataset, not a re-measurement — 5 = unanswerable
marked `verified` (B95's false-accept sense), 11 = answered-and-wrong (raw,
no gate), 7 = `verified && wrong` across conditions (B109's sense). The
harness response: the
definitions now travel with the numbers (every table in §3 states its
denominator), and the reproduction snippets compute each variant explicitly so
a future reader cannot silently mix them.

**The unstable instrument.** The judge-characterization experiments initially
reported kimi AUROC 0.910 as a single value. The determinism harness (B110)
then measured the same judge at 0.825–0.862 on adjacent passes — the "hosted
is +0.05 over the local 27B" claim was a dice roll that happened to come up
high. The claim was demoted in the ledger; every judge number in §3.3 now
carries its pass structure. A harness that cannot re-roll its own judge is
trusting it; this one re-rolled and reported the spread.

**The earlier corrections, kept visible.** The arc's pre-history includes
withdrawn results — a "+18 accuracy" that was a prompt/label artifact (B14),
a 27B score inflated by a `response\n` prefix (B68/B71), an abstention rate
measured by regexing receipt strings instead of reading the flag (B70), a
"judge" with 16.7% human agreement (B11). None were silently deleted: each is
struck in the claims ledger with its replacement (the five rows sit
outside the published excerpt's B95–B118 scope — canonical tree, not
published). The private-corpus first
pass (answerable verified accuracy 90.5%) was corrected to 81% of shown
answers (74/91) when the
grounding filter exposed a generator hallucinating beyond its truncation
window — the correction *lowered* our own headline, which is the direction
audits rarely travel.

**The benchmark's golds (b121).** The open-pool run's golds were audited in
full: provenance byte-identical to the HotpotQA source, 278 of 279 non-yes/no
golds verbatim inside their supporting paragraphs, every remaining item
adjudicated on its paragraphs. Four upstream keys were wrong — a chronology
read backwards (Craig v. Boren is 1976; Paramount is 1948), a career length
miscounted (six decades vs 14 years), a mission tied to the wrong people
(Mexia sailed to the Ais; the key said Apalachees, from an unrelated
paragraph), and a question that asked who someone *is* when it meant who she
*married* (Star & Dagger's bassist → Chris Lee) — and one item's gold has no
support in its paragraphs at all (kept, flagged unescrutable). The
corrections went into the pinned artifacts and **every affected row was
re-labeled by the same strict oracle, never by hand**; all flipped labels
moved the same way — 0 → 1: the reader answers were right and the key was
wrong (four in the `ours` arm — the same four questions the local arm
re-labels — four in `naive`, two in `bare`). The source cache stays byte-pristine as a mirror of upstream,
so a regeneration would reintroduce the old keys — the caveat travels with the
correction record, and the pinned results are now the source of truth for
these 300 items.

**The mechanism behind the catches.** Three rules, each cheap, each currently
enforced:

1. **A claim without a reproducible artifact is a defect.** Every number in
   the claims ledger names the script and the result file that produced it;
   **[recomputed]** headline numbers are recomputable offline from stored
   outputs (`reproduce.md`) — no model calls to verify a published figure.
2. **The artifact is content-addressed.** `unified.jsonl` ships with a sha256
   manifest; verify the checksum and the recomputation in this article is
   against the exact bytes we measured, not a file that drifted.
3. **One definition per metric, stated at the table.** Where a word has drifted
   historically (false-accept), the table says which definition it uses.

This is the receipt discipline pointed at the experiment record itself: the
same property the product gives a user's answers — *a claim that resolves to
evidence, or an explicit refusal* — the harness demands of its own numbers.

---

## 5. What you get at each model size

The matrix in §3 collapses to a decision: **the gate's abstention value scales
down with reader strength; the judge's value scales up with judge capability;
the receipt is size-free.** Below, each viable stack with its measured price.
All figures are HotpotQA rows 301–400 unless marked *private*;
timings from the reference machine's runs (MacBook Pro M4 Max, 34 GB — §3);
GB figures are nominal quantized model sizes summed across the resident models
(reader + judge), not measured peak RSS. Judge
seconds come from the §3.3 characterization sweep on HotpotQA-sized windows
(private-corpus judge means — 9.0 s on the 4B arm, 5.7 s on the deepseek
arm, wider windows — are in §3.6). This section prices the *eval loop*, not a service: no
p95, throughput, concurrency, or dollars-per-query are reported — per-record
reader and judge times are in the artifact, so a p95 is derivable, but we quote
means — and the buying advice below is for a single-user harness.

**4B reader + 9B judge — the fully local workhorse.** ~10 GB resident,
~8.5 s/question (4.3 s reader + 4.2 s judge). Coverage 97%, unknown-abstention
89%, pooled verified precision 88.3% (94.8% answerable-only), 12/200
verified-wrong [recomputed]. The deterministic judge (0 flips in k=3) means
re-grading the same stored reader outputs always gives the same gate labels —
the property that makes it usable as a *test harness* for your own changes, not
just a production gate (the reader's own determinism is not measured, and model
tags are pinned by name — §6.8). Choose this
when the corpus is
private, the hardware is one machine, and 88–95% verified precision is the
budget.

**4B reader + hosted judge — best 4B precision, reproducibility traded.**
Coverage 97%, unknown-abstention 85%, pooled verified precision 91.2%
(96.5% answerable), 8/200 verified-wrong, ~7.3 s/question (3.0 s reader +
4.3 s hosted judge) [recomputed]. The hosted judge discriminates better on
average (k-repeat subset 0.825–0.862, mean 0.844; the single-pass N=200 sweep
read 0.910 — vs the 9B's 0.835, the ranges overlap) but is nondeterministic
(9.4% state flips) — fine when each answer is graded once for a user, wrong
for a benchmark you will re-run. Zero local memory beyond the 4B; one network
dependency.

**4B reader + 27B judge — fully local, maximum gate quality.** 21.2 GB
resident, ~22 s/question (5.5 s reader + 16.9 s judge). Pooled verified
precision 90.5%, within 1pp of hosted with an identical false-accept count
[recomputed, §3.3]. The judge is 4× slower than the 9B for +2.2pp pooled
precision — buy it only when egress is forbidden *and* you need the tighter
judge (the measured difference is 12 vs 9 verified-wrongs per 200 —
directional, not settled). Note the same-family caveat (qwen reader,
qwen judge) applies here and to the 9B.

**27B reader, no sufficiency gate needed.** 17.8 GB, ~20.2 s/question. The
gate is inert on it (§3.2): raw = gate, unknown-abstention 91%, verified
precision 92.8% pooled / 97.8% answerable [recomputed]. What you still get
from the system is the mechanical receipt — the verbatim citation the gate
re-checks — which is the traceability layer, not an accuracy layer, and is
model-size-free (verified quotes survive from 0.8B readers up
[docs/v4-read-system.md §6] — canonical tree, not published).
Choose the 27B reader when accuracy per question matters more than questions
per second.

**Hosted strong reader (deepseek-class).** ~3.5 s/question reader time on
HotpotQA (judge times are not recorded on those rows), **8.1 s reader /
13.9 s end to end** on the private corpus's wider windows (§3.6); inert under
the gate on the public arm — and on the private arm's partial rows its
`verified` flag buys a 6.6× selective-precision lift (§3.6, reading 2),
the one place its score earns its keep. The cost is egress: the corpus
window leaves the machine on every query. For regulated corpora this
disqualifies the stack regardless of its numbers — the local 9B-judge stack
exists precisely for that case.

**One line per tier** [opinion, grounded in the table above]: *at 4B the gate
is the product; at 27B the receipt is the product; the judge is a dial you
turn toward determinism (local) or discrimination (hosted), and the corpus's
privacy decides whether the dial is even yours.* All timings above are
sequential, batch-1, single-user numbers from one MacBook Pro M4 Max
(34 GB RAM) — they do not transfer
to a discrete-GPU or CPU-only server without re-measuring.

---

## 6. The honest limits

Stated before you adopt, in the order they will bite you:

1. **Partial support is unsolved.** Every stack verifies some one-hop-removed
   items, and 12.5%–56% of those verifications are wrong (audited cells,
   §3.5–§3.6). The mechanical
   two-doc check closes the class at a large false-abstention cost for weak
   readers; the decomposition problem (which docs does this question *need*?)
   is open. If your corpus's questions are predominantly multi-hop and your
   windows are noisy, this is the failure mode you will see.
2. **The oracle is an opinion.** Correctness labels come from a hosted model,
   validated on short golds (88.1% agreement with a mechanical proxy,
   κ 0.522 [ledger B103]). On longer, machine-written golds a model-based spot
   check can estimate the oracle *under*- or *over*-stating correctness, but
   that estimate is itself a model's opinion until a human checks it (the
   private arm's audits — 107 + 65 rows, model-judged, blind second pass,
   5/107 and 0/65 agreement — landed with the runs; §3.6's [report] cells
   rest on them; §4 keeps the earlier one visible). Treat every "accuracy" here as
    oracle-relative; the state distributions (abstention, verification rates)
    do not depend on it. The golds are a second machine-written instrument:
    the grounding filter exists because a first-pass generator hallucinated
    golds beyond its own truncation window (§4), and any re-classification
    spot-check is model-done until a human runs it.
3. **The private corpus is our own documentation.** Clean-room (written after
   the gate was frozen, never used for its tuning — §2.5) removes *tuning
   leakage* and memorization alike, but it is still *this repo's* prose —
   README, article, kit docs — not your domain's corpus. A clean adoption
   generates its private corpus from its own docs, under the same freeze
   discipline (§7.1).
4. **Same-family judging is an open risk.** The fully local stacks judge qwen
   answers with qwen (9B/27B). No ≥9B cross-family local judge was available
   to break the tie; the small cross-family models tested are near-random
   (§3.3). If your reader is qwen, budget for a cross-family check before
   trusting local verified-precision numbers.
5. **Hosted-judge numbers need k-repeats.** Any single-pass figure involving
   kimi (or any hosted judge) is one draw from a ~0.04 AUROC inter-pass band
   on a fixed itemset (§3.3). The harness's own convention — report k-repeat means, state N and
   pass structure — is not optional hygiene; it is what makes two judge
   numbers comparable at all. By that convention the B95 headline is itself a
   limitation: a single kimi pass, whose gate-state rates should be read as
   ±1–2pp — a heuristic at the measured 9.4% *gross* item-level flip rate
   (items whose gate state changed between two passes); the *net* drift of the
   aggregate rates, were the pass re-rolled, is unmeasured. We did not re-roll it here — that
   would cost hosted calls against stored answers; the local-judge rows are
   the reproducible ones. The oracle is a second hosted instrument and was
   never k-repeated at all: B103's re-oracle moved one reader's accuracy by
   0.4pp, but its own flip rate is unmeasured — treat oracle labels as one
   draw too.
6. **Scope of the task.** The harness measures *extractive* question answering
   over a *stable* corpus: answers that can be quoted, documents that do not
   change mid-run. Synthesis answers legitimately exceed one quote and break
   sufficiency judges (measured on an earlier Confluence battery); mutating
   corpora need pinned snapshots. These are product boundaries of the
   underlying kit, inherited by any harness built the same way.
7. **Sample sizes.** The judge-comparison rows are N=200; the B95 headline
   (N=600: verified precision 95.6%, CI 92.2–97.5) is the most stable number
   here. The private arm's per-condition rows are N=100, whose intervals are
   directional at that size; §3.6 prints a Wilson interval on every accuracy
   cell, and the audited cells carry the model-audit uncertainty on top of
   the sampling one — read those as directional too.
8. **Models are pinned by tag, not digest.** `qwen3.5:9b`, `kimi-k3` and
   friends are mutable; the 0-flip determinism claim holds for one machine ×
   one runtime × one tag, and a re-pull can silently change it. The artifact
   records tags, not weights — a full pin (digest + backend + quantization)
   is the next harness upgrade.

---

## 7. Adopting the harness

If you build QA systems — ours or anyone's — the reusable artifact is the
method, not the models. The full loop, as run here:

1. **Build a private, by-construction corpus.** Generate questions from docs
   your models have not trained on; store both gold hops; emit three conditions
   (answerable / partial / unanswerable); filter generated golds by grounding
   (the answer's content words must appear in the cited docs). The doc root is
   `GEN_ROOT` (default `docs/` — point it at your frozen corpus), and the
   corpus itself should be frozen and pinned before generation, as
   `corpus/manifest.json` does here.
   Reference implementation: `bench/private-gen.mjs` — and mind its default:
   it generates with a **hosted** model (`GEN_MODEL=kimi-k3`), and what leaves
   the machine at build time is your document text itself: each attempt sends
   two sampled docs' titles and first ~3,000 characters, and receives the
   question, gold answer, and two gold-facts back (§2.5). For a private or regulated corpus set
   `GEN_MODEL` to a local model — any name the script's `isHosted` list doesn't
   match (e.g. `qwen3.5:9b`; the list covers the qwen3.6+ hosted names) routes
   to Ollama — and the script then never touches the hosted credential file, so
   building the corpus under the same egress rule you would enforce at query
   time costs nothing. One caveat the script header already records: the older
   local 9B generator produced terse, inconsistent golds, so re-check gold
   quality against the grounding filter after a local regen.
2. **Freeze the gate config before the run it governs.** Thresholds, judge,
   evidence mode — committed, dated, then never touched mid-experiment
   (`bench/gate-config.json` is the template).
3. **Run the reader × judge matrix**, not a single cell. Raw and gated on the
   same outputs; at least two readers (one weak, one strong) and two judges
   (one local, one hosted, or two local at different sizes).
   `bench/hotpot-fresh.mjs` (HotpotQA-shaped) and `bench/private-run.mjs`
   (private corpus) are the run scripts; both are model-agnostic via
   `READER_MODEL`/`JUDGE_MODEL`.
4. **Characterize the judge separately from the reader.** Re-grade *stored*
   outputs with each judge (`bench/judge-sweep.mjs`), then k-repeat the
   contenders (`bench/judge-repeat.mjs`). Publish AUROC *and* flip rate.
5. **Recompute every headline number offline, from the stored artifact, and
   ship the artifact with a checksum.** `reproduce.md` is the worked example:
   every **[recomputed]** table in this article was regenerated from
   `bench/results/unified-public.jsonl` with arithmetic only, zero model calls
   ([ledger] tables re-grade stored answers with a named script — §2.7);
   `shasum -a 256 -c bench/results/unified-public.jsonl.sha256`
   (or `sha256sum -c` on Linux) is the one-line provenance check, run from the
   repo root. If a
   number in your report does not recompute
   from your artifact, the number is wrong or the artifact is — either way you
   want to know before your users do (§4).
6. **Keep a claims ledger.** One row per published number: the claim, the
   script, the artifact, the status (verified / scoped / opinion). Ours is
    `retrieval-claims-ledger.md` (the excerpt shipped with this repo); it is
    the reason §4's list is a feature list rather than a correction notice.

The read-system these experiments validate — the receipt contract, the
mechanical citation gate, the tri-state sufficiency verdict — is the
retrieval-kit (`kit/README.md`): `ask --sufficient --judge qwen3.5:9b
--unverified` runs the shipped version of the policy §2.1 specifies. The
harness is what tells you whether to trust it on *your* corpus; that question
has no universal answer, which is the entire reason the harness exists.

---

*Every [recomputed] number in this article derives from the experiment's
artifact — in this repo, `bench/results/unified-public.jsonl` (sha256
`88165f6fd26af787edc66fef4348cbb4c1e945c10918b6d8d1dd4697aed3ea33`, pinned in
`bench/results/unified-public.jsonl.sha256`), the public subset of the
canonical `unified.jsonl` (sha256
`0adc142ca0380dfc8b00f7def12ee1a7eef8125fec7f7ba214ab0bca94b9eb3f`, canonical
tree — not published); [ledger] numbers resolve to rows B95–B118
of `retrieval-claims-ledger.md`, the ledger excerpt shipped with this repo;
report sections cited are `report.md`. From the repo root,
`shasum -a 256 -c bench/results/unified-public.jsonl.sha256` (macOS;
`sha256sum -c` on Linux) is the one-line provenance check, and `reproduce.md`
regenerates every [recomputed] table from the artifact with arithmetic alone. Corrections and the full experiment inventory: `report.md`
§2–§5.*
