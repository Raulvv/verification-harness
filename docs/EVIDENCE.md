# EVIDENCE — why the numbers are credible, and what they don't show

The full evidence behind the headline numbers in the root `README.md`: the
stress tests, the absence study, the formal verification pilot, the historical
record, the known limitations, and the ask. Every figure is a row in the claims
registry, [`PROVENANCE.md`](PROVENANCE.md), and recomputes with `npm run
verify` from the repository root.

## Bare-reader control (post-correction 100)

The headline comparison is DA versus B, and both see the corpus. The question
the bare arm (A) answers is different: **what does the reader do with no
documents at all?** If A scored near B, the "retrieval" result would be model
memory wearing a corpus. It does not.

Arm A: question only — no documents, no harness, no citation prompt. Same
post-correction 100, v2 labels, 3 seeds, current scorer, per-100 means over the
98 local questions (the 2 globals excluded, as in the headline table; the same
×100/98 normalization).

| Reader | A local | Ans correct | Unans abstain | Partial correct | A false /100 |
|---|---:|---:|---:|---:|---:|
| DeepSeek V4.1 Flash | 27.9 | 19.3% | 43.3% | 13.3% | **69.0** |
| Sonnet 5.5 | **40.1** | 16.7% | 70.0% | **25.0%** | **41.8** |
| GLM-5.3-Flash (default) | 37.4 | 15.8% | 69.2% | 15.0% | **53.1** |

- **The corpus is doing the work.** Bare readers answer 15.8–19.3% of answerable
  questions; B answers 86–94% on the same items. The OOH is public, but it is
  not memorized. The answerable rate is nearly flat across families while "local
  correct" is not — the higher totals come mostly from correct abstentions.
- **Failure mode is a family gradient.** DeepSeek fabricates (69.0 false
  accepts, 43.3% abstain); GLM is cautious (53.1, 69.2%); Sonnet abstains most
  (41.8, 70.0%) and leads on partials (25.0% vs 13.3% and 15.0%). Same
  answerable collapse, opposite unanswerable styles.
- **A is a bracket, not the comparison.** B stays the status quo baseline; the
  DA-vs-B claim remains suggestive, not separated.

**Answer budget (disclosed).** A ran at 3,000 tokens (DeepSeek) and 8,000
(Sonnet, GLM), with truncated rows re-run at 16,000 and never scored as false
accepts; B/DA ran at 1,200. At 3,000, 18% of DeepSeek's rows were empty — an
empty answer scores as a shown false accept, so the retry rule exists to keep
truncation out of the error rate. Bare GLM returned no content on the two global
items even at 16,000 (no aggregate route); those cells are excluded with the
globals.

## Hard-set stress tests (separate from the 100)

Two frozen, human-approved stress sets are kept apart from the main 100 and are
not pooled with it.

**H2 — 100 derived-2033 reader questions.** Three seeds, DeepSeek V4.1 Flash,
no aggregate route. Arms: **A** bare reader, **B** plain RAG (status quo), **Q**
retrieval + "quote every claim" prompt (ungated), **D** gate only, **DA** quote
contract + mechanical gate + absence check (the current harness). DA 71–75,
B 15–20, A 0. DA beats B on 51–58 questions per
seed and loses none; false accepts 10–12 vs 31–45 for B. This is a reader
result: the 2033 figure has to be derived from the jobs and change lines.

**H3 — 100 structured questions**: multi-condition count/sum/extremum, top-k,
equality, negation, signed difference, 17 ambiguity, 15 partial. Reader-only,
DA answers 21/83, plain RAG 17/83, bare 2/83. The gap is full-table
aggregation, not reading. With the deterministic reducer enabled, DA answers
83/83: 68 from the reducer over all 46 paid rows and 15 partial from the
reader. That is a harness capability result, not a reader-skill result.

H3 was human-approved and frozen before the reducer was implemented. The
reducer reproduces all 68 answerable golds offline with no model call; the 17
ambiguity items are outside the reader run and still need the specification
layer. The top-k scorer bug found during this work is fixed (array golds
previously scored vacuously).

**The deterministic reducer is sound; the extractor is not yet safe on natural
language.** The parser alone routed **18/30** reviewed paraphrases and **0/4**
blind natural questions; everything routed was correct (18/18). A
schema-validated extractor — model proposes a spec, schema rejects unknown
fields/ops/titles, reducer computes — then reached **30/30** reviewed
paraphrases, **3/4** blind items, and **H3 100/100**. Those are development
sets.

The clean 10-question v2, frozen after the extractor, scored **6/10 with two
false accepts**:

- “beat inflation” was silently mapped to employment growth and answered **25**.
- “2 worst by projected growth” returned the **two best**, because top-k only
  sorts descending; the rank-2 tie was also ignored.

Two schema gaps (work experience, compound max+min) refused safely, and 4/10
router calls returned empty content because hidden reasoning consumed the token
budget. Schema validation checks shape, not meaning.

After fixes — declared-field grounding, `order: asc`, and a 4,000-token router
budget — the same v2 set (development, not clean) goes **8/10 with zero false
accepts**: 3/5 answerable, 5/5 traps refused, 0/10 JSON failures. The two
remaining misses are the schema gaps. H3 stays **100/100**. The clean claim
still requires a fresh v3 set. Reports:
[`V2-REPORT.md`](../bench/formal/competitive/V2-REPORT.md),
[`H3-PARAPHRASE-REPORT.md`](../bench/formal/competitive/H3-PARAPHRASE-REPORT.md).
Details and commands:
[`bench/formal/competitive/README.md`](../bench/formal/competitive/README.md);
full tables: [`bench/ARM-COMPARE-REPORT.md`](../bench/ARM-COMPARE-REPORT.md).

## Citation-quality control (QAMPARI)

Outside OOH, ALCE's QAMPARI is the all-answerable control. On 200 questions DA
matches B: F1 17.5 vs 17.4 (paired +0.1 [−2.5, +2.6]), citation support 68.3
vs 70.4 paired (−2.2, interval includes zero), coverage 79.5 vs 80.0, quote
validity **99.7%** (371/372). DA emits fewer, slightly more precise answers.
**No accuracy gain, no harm.**

The earlier 30-question “+13 citation support” was a pooling artifact; paired
per question it was +4.7 [−0.3, +13.0], and at 200 it is −2.2. This is why the
absence test — SQuAD 2.0, 100 answerable + 100 unanswerable — is the next
experiment. The judge is local MiniCheck, not ALCE's GPT-4, so absolute numbers
are not leaderboard-comparable. Details:
[`bench/formal/alce/README.md`](../bench/formal/alce/README.md).

## Mixed absence (SQuAD 2.0)

100 answerable + 100 unanswerable. B and DA both abstain on about **70%** of
unanswerable questions (71 vs 69); raw false answers are 29 vs 31; overall
exact is 72.0 vs 71.5. Paired differences are within noise.

Adjudication changes the reading: of the answered “unanswerable” items, only
**3 (B) and 6 (DA)** are genuinely unsupported; **15 each** are actually
supported by the context, and the rest are ambiguous. Genuine hallucination is
**3–6%**, not 29–31% — SQuAD 2.0’s unanswerable labels are noisy for a capable
reader. Paired on the 26 items both answered: 2 both genuine, 0 B-only,
2 DA-only, 22 neither.

The quote contract alone did **not** improve abstention. The gate checks that a
quote exists and contains the answer; it cannot tell that a plausible span does
not answer the question (“How is time *not* required …”). A support check can
address only a handful of cases here. Details:
[`bench/formal/squad2/README.md`](../bench/formal/squad2/README.md).

## Formal verification path (opt-in)

`ask` can delegate to an external deterministic verifier. The default path is
unchanged; the verifier is a JSON-in/JSON-out command you supply, so the kit
stays standalone.

```bash
node kit/bin/retrieval-kit.mjs ask \
  --formal-cmd "cd bench/formal && .venv/bin/python -m formal.cli --stdin-json" \
  --corpus bench/corpus/ooh-v1 \
  "This is the best career for someone who wants stability."
```

```text
Q: This is the best career for someone who wants stability.
A: Using the default definitions
   `stability = 1×projected growth + 0.0001×employment change + 0.0001×annual openings`
   and `best = highest stability score`, the top-ranked occupation is
   Software Developers, Quality Assurance Analysts, and Testers (score 63.8).

Assumptions:
  - stability = 1×projected growth + 0.0001×employment change + 0.0001×annual openings [default]
  - best = highest stability score [default]

Evidence:
  [1] Software Developers, Quality Assurance Analysts, and Testers · computer-and-information-technology__software-developers · outlook_pct  (gate: verified)
      Job Outlook, 2023-33 | 17% (Much faster than average)
  [2] Software Developers, Quality Assurance Analysts, and Testers · computer-and-information-technology__software-developers · change  (gate: verified)
      Employment Change, 2023-33 | 327,900
  [3] Software Developers, Quality Assurance Analysts, and Testers · computer-and-information-technology__software-developers · annual_openings  (gate: verified)
      About 140,100 openings for software developers, quality assurance analysts, and testers are projected each year, on average, over the decade.

formal: ENTAILED_UNDER_ASSUMPTIONS · spec spec-v1 · ded593b4...
```

`--no-defaults` requires explicit definitions instead of registry defaults. If a
claim needs a definition that is not supplied, the output is
`NEEDS_SPECIFICATION` and the answer asks for it; it is never guessed. This is
the Phase 0/1 specification layer, not a general prose parser.

Positioning: this is a deterministic verifier for **closed structured claims**,
not a replacement for HHEM, MiniCheck, or LettuceDetect on general prose. The
competitive assessment and the gaps are in
`bench/formal/EPIC-FORMAL-002.md` §1.7.

The product path is reader-first: a reader answer goes through
`formal/extract.py` (prose → typed claims) and then the formal verifier. The
`ask --formal` command is a demo/debug path for the same verifier; it is not the
only way to use it.

### Current formal pilot (2026-11-04)

The formal layer has a **human-audited pilot**, not a final benchmark claim.

| Set | Contradicted | False accepts | False rejects | Coverage | One-sided 95% upper bound |
|---|---:|---:|---:|---:|---:|
| 160 public synthetic | 80 | **0** | 1 | 0.74 | 3.7% |
| 80 DeepSeek natural (subset of 320) | 8 | **0** | 0 | 1.00 | 31.2% |
| 160 two-reader natural (subset of 320) | 15 | **0** | 0 | 1.00 | 18.1% |
| **320 four-reader natural (audited)** | **26** | **0** | **0** | **1.00** | **10.9%** |
| Synthetic + natural | 106 | **0** | — | — | 2.8% |

The four-reader natural set is DeepSeek 4.1 Flash DA + Sonnet 5.5 DA +
GLM-5.3-Flash DA + Qwen 3.8 27B DA, human-audited and corrected: **1.00 binary,
0.99 exact, 0 false accepts, 0 false rejects, 1.00 coverage**. The 0.99 exact is
four `partial` answers judged `CONTRADICTION`; the binary endpoint is correct.
The 80 and 160 rows are historical subsets; the 320 row is the audited set.

On the same 320 natural claims, the general detectors are materially weaker:

| System | Binary | Exact | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **1.00** | 0.99 | **0** | **0** | **1.00** |
| MiniCheck | 0.72 | 0.24 | 13 | 75 | 1.00 |
| LettuceDetect | 0.21 | 0.21 | 186 | 66 | 1.00 |
| HHEM-2.1-Open | 0.76 | 0.25 | 4 | 73 | 1.00 |

The synthetic set's coverage is 0.74 because formal abstains on the 40
contradicted absence claims (`INCOMPLETE`); its binary accuracy is 1.00. The
one false reject is the top-coded Physicians maximum, where the source says
“equal to or greater than $239,200”.

**What this supports:** a deterministic verifier for closed structured claims
can be the assurance layer for a reader, with a mechanically checkable
false-accept record on a pilot. **What it does not support:** a population
false-accept rate, general NLI, open-world absence, question-held-out
evaluation, a second domain, or replacement of the detectors. The natural set
is reader-held-out, not question-held-out; one auditor labelled it; the same
100 development-informed questions are used. The 26 natural contradicted claims
are below the pre-registered minimum of 40, so this is still a pilot.

Reproduce the public synthetic slice:

```bash
cd bench/formal
.venv/bin/python -m formal.competitive \
  --claims competitive/pilot-160-human.jsonl \
  --detector competitive/detectors/minicheck-160.jsonl \
  --detector competitive/detectors/lettucedetect-160.jsonl \
  --detector competitive/detectors/hhem-160.jsonl
```

The natural slices are local and gitignored; only aggregate results are
published. Details: [`bench/formal/EPIC-FORMAL-002.md`](../bench/formal/EPIC-FORMAL-002.md),
[`bench/formal/competitive/PILOT-160-REPORT.md`](../bench/formal/competitive/PILOT-160-REPORT.md),
[`bench/formal/competitive/PRE-REGISTRATION.md`](../bench/formal/competitive/PRE-REGISTRATION.md),
and [`bench/formal/EPIC-FORMAL-003.md`](../bench/formal/EPIC-FORMAL-003.md).

### CUAD legal pilot

The formal layer also has a public legal-benchmark adapter for **CUAD v1**:
510 commercial contracts, 41 clause categories, official 408/102 split. It is a
deterministic clause-presence baseline with a quote and a closed-corpus coverage
receipt, not a legal-advice system — a test of whether the presence-plus-quote
pattern transfers to a second domain. The harness result is the
absence/threshold tradeoff: no-answer false accepts fall from **34.5% at the
zero threshold** to **7.5% at best F1** and **3.0% at a precision-first
threshold**, at **21% coverage**.

| Operating point | Precision | Recall | Micro F1 | False accepts | False rejects | Quote support |
|---|---:|---:|---:|---:|---:|---:|
| Balanced | 0.882 | 0.660 | 0.755 | 110 (3.7% of absent) | 423 | 0.552 |
| Precision-first | 0.911 | 0.568 | 0.700 | 69 (2.4% of absent) | 537 | 0.602 |

The optional Legal-BERT encoder is more precise but much more conservative:
**precision 0.947, recall 0.415, micro F1 0.577, 29 false accepts, 728 false
rejects, quote support 0.602**. It does not solve the weak categories; it
mostly abstains on them.

This is a baseline, not a CUAD leaderboard result. The detector is TF-IDF, not a
legal language model; the weak categories are the ones that need legal
interpretation.

The public CUAD fine-tuned checkpoint `akdeniz27/roberta-base-cuad` is the
reader comparison: **macro AUPR 0.531, P@80 0.308, P@90 0.129** on the official
test split. That is in the published RoBERTa-base/RoBERTa-large range, below
DeBERTa-xlarge at P@80/P@90. On a fixed 20-contract subset, the official
RoBERTa-large checkpoint reaches **0.573 / 0.445 / 0.338**, a subset comparison
not the full split. Details:
[`bench/formal/legal/CUAD-QA-REPORT.md`](../bench/formal/legal/CUAD-QA-REPORT.md)
and [`bench/formal/legal/CUAD-PILOT.md`](../bench/formal/legal/CUAD-PILOT.md).

## Historical results

The superseded rows — the pre-correction 6k result, the one-seed
post-correction matrix, and the pilot-v2 ranked tables — are kept in
[`HISTORY.md`](../HISTORY.md). They are not comparable to the current numbers
and are the record behind the limitations below.

## Known limitations

Named explicitly, because the alternative is letting a reader over-read the
numbers.

- **Solo study, lab-scale comparison.** One person wrote the questions, built
  the system, and scored it. The closest published work — IBM's STAIR, arXiv
  2609.03874 — is an 18-textbook, six-domain, tens-of-thousands-of-questions
  lab effort. The gap is real; this study was not sized to win it.
- **One corpus, one domain, one snapshot.** 48 BLS pages. Nothing here
  establishes the same result on legal, financial, or internal-policy corpora.
- **Three seeds, three readers — post-correction.** The current 100 is 3 seeds,
  DeepSeek, Sonnet, and the GLM default; the ranked pilot is the development
  fit. Three seeds reduce run noise but do not make this a held-out set; the
  clean held-out set is deferred.
- **Underpowered historical headline.** The old 6k B/C/D headline was 2 versus 8
  wrong-shown rows; p=0.070; the Wilson intervals overlap. The corrected
  3-seed matrix is in the root [`README.md`](../README.md) § Current result;
  the pilot is a consolidation, not a separation proof.
- **Coverage and partials.** On the pre-fix held-out, D covers less on the
  shown count (46 vs 55) and handles partials worse (17/20 vs 20/20). The
  ranked pilot is the current measurement: DA is 100% coverage on Sonnet/GLM,
  97% on GLM-Flash, 94% on DeepSeek, 100% on the 27B, 69% on the 4B; the 27B
  and 4B lose partials (6/12 and 0/12). The held-out D row is the historical
  pre-correction record. The gate buys verification, not a large
  coverage gain.
- **Not pre-registered.** Four partial labels and two scorer phrasings were
  corrected post-hoc — all disclosed.
- **Single human auditor.** One person audited the wrong rows; the second rater
  was a model and weakly concordant (12/18).
- **Private labels.** External re-scoring is limited to published hashes; only
  the dev set is inspectable.
- **Builder = evaluator.** Same author for questions, system, and scoring.
  Disclosure and a shipped scorer mitigate; they do not remove it.
- **Reader and task scope.** The gate needs a reader that follows the
  contract, and its comparative benefit depends on the failure mode. The 4B
  fails the contract (DA 15/60 false accepts; 0/12 partials); the 27B DA is
  24/24 answerable, 0/60 wrong, 6/12 partials; the 27B Q answers 12/12
  partials but pays 6/60 false accepts. GLM-5.3's fabrications were caught;
  Sonnet 5.5's false absences were not. All frontier evidence is a 20-item
  public pilot, not the post-correction 100. Built for extractive answers over stable
  corpora; synthesized prose over long documents over-refuses.
- **Citation completeness is model-enforced.** The gate verifies the quotes
  that are shown, not that every operand a calculation used was quoted. Q
  coverage in the ranked pilot is 53–88% on the hosted readers and 82% on the
  27B (DA's coverage figures: see *Coverage and partials* above). B carries no quotes. Support is a manual claim-level audit (AI
  adjudication, not human); the automated MiniCheck over-refused.
- **Author-defined ceiling.** "88% of the reachable ceiling" uses a 52-item
  ceiling we defined. A descriptive denominator, not a law.
- **Formal pilot is not a final claim.** The formal verifier has 0 observed
  false accepts on 106 human-audited contradicted claims, but the natural-only
  set has 26 contradicted claims (10.9% one-sided 95% upper bound), one
  auditor, and the same development-informed 100 questions. The OOH natural
  set is one corpus and one snapshot; CUAD is a public second-domain baseline,
  not a private legal pilot. The result is reader-held-out, not
  question-held-out. It does not establish general NLI, open-world absence, or
  a population false-accept rate.

What survives all of this is the narrower claim: **the gate is mechanically
checkable at inference time.** Whether a quote exists in the cited file does
not depend on the benchmark's statistical power. The *comparative* claim — no
accuracy cost versus plain RAG — is the one still owed a pre-registered,
multi-seed, second-corpus run.

**When not to use it.** If your reader is cautious (errors are false
absences, not fabrications), or your buyers do not need an independent audit
trail, plain RAG with citations is cheaper and at least as accurate on this
evidence. The gate's case is specific: confident fabricators, high-stakes
wrong answers, and a requirement to re-check the receipt later.

**Ask.** A funded experiment (clean held-out set, independent replication,
human second rater, API/compute, local GPU) and a consultancy pilot where the
harness fits best (governance/audit on a real corpus, with CTO and
mid-management tech leads), with working time to run it. The trial has a kill
rule written down first — the same shape as the benchmark kill rule in the
root [`README.md`](../README.md) § Current result (≤2.5× same-reader baseline
per 100, ≤$0.50/100): proceed only if wrong-shown is no worse than the
current RAG **and** coverage is at least 80% of the reachable ceiling **and**
cost stays within the current setup. Miss any one and we stop.
