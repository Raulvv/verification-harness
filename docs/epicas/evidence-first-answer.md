# Evidence-first answering — quotes before prose, numbers anchored to the quote

Status: open
Since: 2026-10-20
Answers: does splitting the one-shot read into a quote pass and an answer-from-quotes pass, plus a mechanical number anchor, raise answerable accuracy toward the own-quote ceiling without unacceptable coverage loss?

Scope: the answer pipeline (`kit/lib/answer/*`, `kit/lib/receipts/*`) and the
private clean-room benchmark arms. Not the retrievers and not the app.

- **Claim under test**: the clean-room failure is *binding*, not knowledge —
  the reader quotes the right passage and then attaches a salient in-window
  number to the wrong slot. Moving the answer step onto the quotes alone, and
  checking the answer's numbers against them mechanically, should recover most
  of the gap between measured accuracy and the own-quote ceiling.
- **Evidence base** (provisional until the arms are pinned): clean-room 4B arm,
  100 answerable questions — **79% correct** (80% after crediting one
  over-specified gold), **21 misses**, of which **8 are fully recoverable from
  the row's own quote** and **all 21 have the needed fact somewhere in the
  5-doc window**. 15/15 wrong numbers are real corpus numbers (13 in-corpus,
  9 literally in the reader's own quote; 2 wrong arithmetic over real inputs);
  **0 invented from nothing**. Own-quote ceiling **88%**, window ceiling
  **~99%**.
- **Second arm** (hosted deepseek, self-family oracle): **94/100** answerable
  raw, **95.7% verified** (88/92), **70.4% pooled**; 20 parse failures (all
  recorded, not silently scored); adjusted **96–97%** after p82 (real error),
  p85/p21 (oracle false negatives), p86 (gold ambiguity) and p93 (parse + gold
  defect). Own-quote ceiling **97%**, window ceiling **~99%**.
- **Related work**: the meta-layer epic in the canonical tree
  (`docs/epicas/claim-level-qa.md`) and the extraction epic
  (`docs/epicas/verification-harness-public-extraction.md`). The mechanism here
  is the meta-layer's `[recomputed]` doc-anchor applied to the reader's own
  prose.

---

## 1. The epic

> **As** the maintainer of the answer pipeline,
> **I want** the answer to be composed from the evidence it cites, and its
> numbers checked against that evidence,
> **so that** a correct quote cannot coexist with a wrong number, and the
> 4B arm's binding errors become either correct answers or honest abstentions.

### Static finding: the contract is declared, never enforced

- `kit/lib/answer/prompt.mjs` already instructs: *"Every claim, step or number
  in your answer must be supported by at least one quote… One quote per
  claim."*
- `ONESHOT_SCHEMA` returns `{answer, quotes[], not_found}` in **one call**, with
  no per-claim link and no ordering. The model can emit prose and then quote
  whatever it likes.
- `assembleOneShot` / `rehomeLegs` (`kit/lib/answer/assemble.mjs`) verify only
  the **quotes** are byte-verbatim and drop unverifiable legs. Nothing tests the
  **answer's** numbers against the kept quotes.

So the rule exists as prose; violating it costs nothing. A prompt reorder inside
the same JSON does not fix it — the model still computes both jointly. The fix
is a **separate call with the docs removed** plus a **mechanical check**.

## 2. Design

### Pass A — quote (sees docs + question)

Return `{not_found, evidence: [{doc, quote}]}` only. One atomic span per fact;
no `answer` field. Reuse `liftEvidence` / `evidenceMatches` to keep every span
verbatim-by-construction.

### Pass B — answer (sees question + lifted quotes ONLY)

Return `{answer, not_found}`. The 5-doc window is gone, so the competing
numbers are gone. The prompt says: use only these quotes; every number must
appear in a quote; if the quotes do not answer, say NOT FOUND.

### Anchor C — mechanical, no model

1. `numbersIn(answer) ⊆ numbersIn(quotes)`, with an **allowlist for derived
   values** (e.g. `150 = 50 × 3`, `212.5 = 25 × 8.5`), otherwise correct
   arithmetic becomes a false negative.
2. Optional `claim → evidence index` so "one quote per claim" is checkable.
3. On violation: flag `unverified` (or abstain), never silently pass.

### Fallbacks

- Under-quote → Pass B abstains → one retry over the full window (the existing
  "second chance" shape), or an honest abstention.
- Keep the current single-pass behind a flag for A/B and for the `noquote` /
  `source` tiers.

## 3. What this does NOT fix

- **Wrong or incomplete evidence selection.** If Pass A quotes `69/69` when the
  question needs `80/81` (p91) or omits `1553` (p20), answer-from-quotes is
  confidently wrong. That is a retrieval/coverage problem, tracked separately.
- **Competing numbers inside one quote.** p24's quote contains `10.5k tokens`,
  `13 s`, and `8.5 s`; the window shrinks but binding is still required.
- **Derived-value policy.** Too permissive lets wrong arithmetic through; too
  strict rejects correct computation. This is the main design risk.

## 4. Iterations

### I1 — Post-hoc detector (no extra call)

Replay the stored clean-room rows: flag every answer whose numbers are absent
from its kept quotes. Measure how many of the 15 misbinding cases it catches,
and the **precision/coverage delta** if flagged answers become abstentions.

**Done when**: catch rate and delta are measured, and the derived-value
allowlist is specified from the observed cases.

**Result (2026-10-20, stored answers, no model).** The anchor is implemented
(`numbersIn` / `claimNumbers` / `derivedNumbers` / `unanchoredNumbers` in
`kit/lib/receipts/text.mjs`) and replayed with `bench/anchor-audit.mjs`.

| arm | scored | correct | wrong | caught wrong | flagged correct | precision if flagged abstains |
|---|---:|---:|---:|---:|---:|---:|
| 4B (b119) | 100 | 79 | 21 | 13/21 (61.9%) | 20/79 (25.3%) | 79% → 88.1% (coverage 100 → 67) |
| deepseek (b120) | 98 | 94 | 4 | 0/4 | 21/94 (22.3%) | 95.9% → 94.8% (coverage 98 → 77) |

The b120 zero is the finding, not a bug: its four misses are p82 (a
derived-value error — 48 items ≠ 48 × 3 = 144 points), p86 (competing numbers
inside one quote — 2 vs 4), and p85/p21 (oracle false negatives). A number
anchor cannot see wrong arithmetic, or a wrong slot when both candidates are in
the quote. The 4B arm is where the anchor has teeth: 13/21 misses are
unsupported-number binds, and 3 more are blind only because the gold number is
already in the row's own quote (p28, p40, p47).

The 20/21 flagged "correct" rows are not detector noise: most are correct
answers whose **quote does not contain the number** (quote under-coverage —
e.g. p5's 78%→90% is in the answer, not the receipt). That is the same binding
gap seen from the other side, and exactly what the two-pass call is meant to
force. Normalization removed the mechanical false positives: versions (`v4.5`,
`0.1.0`), ISO dates, `§`-sections, ledger row ids (`B118`), number words
("three" → 3), the trivial count 1, and arithmetic the answer shows over quoted
operands (`26 × 3 = 78`).

**Allowlist rule, observed:** allow a derived result only when the answer shows
the arithmetic and both operands are in the quotes (or the question); do not
allow a bare total. p0/p8/p44 are anchored this way; p25/p31/p42 still need an
explicit sum/product in the prose, which the Pass B prompt now asks for.

### I2 — Two-pass implementation

Add `QUOTE_SCHEMA` + `ANSWER_FROM_EVIDENCE` to `prompt.mjs`, a `runQuote` /
`runAnswer` split in `oneshot.mjs`, and the anchor in `receipts/text.mjs`.
Tests: quote ordering, answer-number-not-in-quote → flagged, derived number
allowed, under-quote → retry/abstain, single-pass flag unchanged.

**Done when**: `npm run kit:test` green and the new tests fail when the anchor
is removed (non-vacuous guard).

**Done (2026-10-20).** `QUOTE_SCHEMA`, `ANSWER_EVIDENCE_SCHEMA`,
`PROMPT_QUOTE` and `PROMPT_ANSWER_EVIDENCE` in `prompt.mjs`; `parseQuote` in
`parse.mjs`; `runQuote` / `runAnswerEvidence` / `runEvidenceFirst` in
`oneshot.mjs`; `askOneShot(..., { evidenceFirst: true })` with
`evidenceAnchor: 'abstain'`, `evidenceFallback: false` and `evidenceAllow`.
The CLI exposes `--evidence-first` / `--evidence-anchor`. Six new one-shot
tests and four new text tests; `npm run kit:test` is 169/169 in both the
canonical and the published copy. The single pass remains the default. The
anchor guard was proven non-vacuous by stubbing `unanchoredNumbers` to `[]`
and watching the new tests go red.

### I2b — Quote selection first (the gate failed on composition)

The targeted gate showed the quote pass, not the answer pass, is the bottleneck:
the 4B quote-only call abstained or under-selected on the hard rows, so the
answer pass had nothing to compose. Three candidates, all on the same 43-row
targeted set before any full arm:

1. **Hybrid**: reuse the single-pass read's own quotes (already byte-verified),
   discard its answer, then run Pass B. Tests composition without a new quote
   selector; keeps the model's stronger joint quote behavior.
2. **Selective two-pass**: run the single pass first; only when its answer is
   unanchored (the 20 flagged-correct rows) run Pass B over the single-pass
   quotes. Leaves the 57 anchored/easy rows untouched.
3. **Stronger quote pass**: 9B quote pass → 4B answer pass; or a quote prompt
   that asks for every number/unit the answer will need. *Not tested: the owner
   excluded an additional quote-pass model.*

**Kill criterion**: if a candidate does not beat 22/43 on the targeted set
without breaking an anchored-correct row, stop; the single pass ships.

**Result (2026-10-20, 4B only, no extra quote-pass model, same 43):**

| variant | correct | reader abstained | verified | verified correct | shown |
|---|---:|---:|---:|---:|---:|
| single-pass baseline | 22/43 | 0 | 29 | 18 | 41/43 |
| hybrid | 11/43 | 12 | 20 | 10 | 28/43 |
| selective | 10/43 | 11 | 19 | 9 | 30/43 |
| hybrid + anchor abstain | 8/43 | — | — | — | 20/43 |
| selective + anchor abstain | 7/43 | — | — | — | 23/43 |

Transitions vs baseline: hybrid **5 fixed, 16 broken**; selective **3 fixed,
15 broken**. The selective trigger fired on **33/43** rows (10 shipped from the
first pass; 2 of those correct), so the "only the hard rows pay" saving is real
but the repair is not.

**Not cleared.** Neither candidate beats 22/43 or meets the kill criterion.
The p82 case is the boundary in one row: the single pass's 144 is correct but
unanchored (the quote has 48/48 and 3 points, no shown arithmetic); both
hybrid and selective rewrite it as 48. The anchor flags the receipt; the
answer pass cannot recover the computation. Quote/answer composition alone
does not fix the derived class.

**Decision:** the single pass ships; the two-pass/hybrid/selective modes stay
opt-in. The anchor remains a post-hoc receipt audit (13/21 wrong caught;
20/79 correct flagged on b119), used in report mode, not as a hard gate.

### I3 — A/B on the private clean-room arms

4B and the hosted reader, same questions, single-pass vs two-pass. Report
answerable accuracy, verified precision, coverage/abstention, partial, cost per
question, parse-failure rate.

**Pre-registered expectation (before I3):** 4B answerable **84–88%**,
verified **90–92%**, coverage **93–97%**, partial **38–45%**, unanswerable
**20–25%**, pooled **52–58%**, parse 0; deepseek answerable **97–98%**,
verified **98–99%**, coverage **94–97%**, partial **22–28%**, unanswerable
**3–5%**, pooled **73–77%**, parse 10–20/300. These are estimates, not
measurements; I3 replaces them.

**Targeted re-run set (only if I3 is approved):** fully local 4B, answerable
condition only, only the 21 b119 misses + the 4 b120 misses + the 20 b119
flagged-correct rows (**43 unique**; p82 and p86 overlap), not the 300-row
matrix.

**Gate result (2026-10-20, targeted local 4B, 43 unique rows, answerable
condition, report mode; anchor-abstain computed post-hoc):**

| variant | correct | reader abstained | verified | verified correct | shown |
|---|---:|---:|---:|---:|---:|
| single-pass baseline (b119) | 22/43 | 0 | 29 | 18 | 41/43 (95.3%) |
| two-pass, report | 9/43 | 15 | 17 | 9 | 24/43 (55.8%) |
| two-pass + anchor abstain | 5/43 | 27 | 11 | 5 | 13/43 (30.2%) |

Transitions: **4 fixed** (p3, p40, p67, p81), **17 of 22 correct broken**
(16 flagged-correct + p85), 5 kept correct, 5 wrong→abstain, 12 still wrong.
The two-pass is a receipt improvement on a few rows and a large accuracy
regression on the rest.

**Not cleared; the full arm is not run.** All 21 b119 misses are in this set.
With the 57 non-targeted b119 rows already correct, the two-pass's full-arm
upper bound is **57 + 4 = 61/100**, below the 79 single-pass baseline, even if
no easy row breaks. The sign cannot reverse, so the 300-row run is not worth
its cost. The single pass stays the default; the two-pass stays opt-in. I2b
ran and also failed (hybrid 11/43, selective 10/43); I3 remains stopped before
the full arm.

**Done when**: the numbers are in the ledger with a run id, and the net effect
(accuracy vs coverage vs cost) is stated. *(Superseded by the gate result:
I3 is stopped before the full arm; the targeted rows are recorded, not
ledgered as a shipped run.)*

### I4 — Default decision

**Decided (2026-10-20): the single pass stays the default.** The
two-pass/hybrid/selective modes remain opt-in (`EVIDENCE_MODE`), and the
number anchor ships as a report-mode receipt audit, not a hard gate. No full
300-row arm is run: all 21 b119 misses are in the 43-row targeted set, and the
best candidate fixed 5 while breaking 16. A formal ADR is the remaining
bookkeeping; it should record this negative result and the p82 derived-value
boundary.

Two-pass becomes the default, stays opt-in, or is reverted.

**Done when**: an ADR records the decision with the A/B numbers, and
`CHANGELOG.md` / the kit README reflect the shipped behavior.

## 5. Falsifiers

- I1's detector misses most of the 15 → the anchor is not the right lever.
- I3 shows coverage loss ≥ accuracy gain → keep the single pass; record and stop.
- Removing the anchor leaves the new tests green → the guard was vacuous.
- A wrong quote still yields a confidently wrong answer at the same rate → the
  binding hypothesis is wrong; the failure is selection, not composition.

## 6. Guardrails

`kit/AGENTS.md` applies: one unit per commit, gate by blast radius
(`npm run kit:test` for pure logic; the browser battery when the runtime is
touched), no vacuous tests, `CHANGELOG.md` for user-visible changes. The public
repo stays private; no private run rows, tokens, or corpora enter it. No
third-party queries are needed for this work.

## 7. Target-version 43 result (2026-10-21)

The target version (top-3 + base + lexical candidates, verifier-all) was run on
the 43 hard rows: **20 right, 0 wrong, 23 abstain**; 7 oracle-null rows (p1,
p21, p42, p47, p74, p79 re-checked true; p91 pending); 0 verified false
accepts. The summary's "4 false accepts" are verified rows whose oracle call
returned 429, not wrong answers.

The no-target single-read experiment was a regression: 30 rows, **3 right, 1
wrong** (p72: 93.9% vs the gold 95.6%), 23 abstain, 3 null. It was reverted to
the target version. The target version is frozen; the full-hosted 43
comparison is next; the 300 runs only if the 43 stays at 0 wrong.
