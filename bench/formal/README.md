# Formal verification layer (OOH)

Python-only assurance layer for deterministic claim verification over the OOH
structured snapshot. **No Node, no model calls, and no default reader/judge
changes in the deterministic path.** Everything lives under `bench/formal/`.

This is an **add-on to a reader**, not a replacement for HHEM, MiniCheck, or
LettuceDetect. It checks closed structured claims; it is not a general NLI
system.

## Install and run

```bash
cd bench/formal
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Inventory + evaluation (writes out/inventory.json, out/evaluation.json)
.venv/bin/python -m formal.evaluate

# Tests (stdlib unittest; offline)
.venv/bin/python -m unittest discover -s tests -v
```

The private v2 labels are read only for aggregate scoring when present at
`/Users/raulvegadelvalle/Documents/linea-cero-metro/bench/results/ooh-test-private-v2.jsonl`.
Use `--no-private` to run without them. Labels are never written to `out/`.

## Reader-first pipeline

The product path is:

```text
reader answer
  -> formal/extract.py      prose -> typed claims
  -> formal/spec.py         close unresolved slots, record assumptions
  -> formal/z3check.py      entailment, relevance, coverage receipt
  -> formal/router.py       show / reject / ask / fallback / human
```

`ask --formal-cmd` is a demo/debug bridge for the same verifier. It is not the
only way to use the formal layer.

## Layout

| File | Role |
|---|---|
| `formal/model.py` | Typed IR: `QIR`, `Term`, `Claim`, `AnswerIR`, `Citation`, verdicts |
| `formal/rows.py` | JSON rows, markdown table cross-check, quote→row/field mapping, schema |
| `formal/parse.py` | Deterministic English question → `QIR` |
| `formal/compile.py` | `QIR` → canonical `AnswerIR` (derivation) |
| `formal/extract.py` | Reader prose → claims; lookup, difference, sum, compare, extremum, count, quantified, rank |
| `formal/spec.py` | Specification layer: `SpecRegistry`, `close_qir`, assumptions |
| `formal/spec_examples.py` | Direct IR examples for “most”, “stability”, direction, unit, causal, normative, open-world absence |
| `formal/z3check.py` | Z3 premises + 3-valued entailment + structural relevance |
| `formal/coverage.py` | Closed-corpus index and coverage receipts |
| `formal/router.py` | Deterministic verdict → route |
| `formal/nli.py` | `CommandNLI` fallback adapter |
| `formal/batch.py` | JSONL batch interface |
| `formal/server.py` | Minimal HTTP API |
| `formal/legal.py` | Synthetic legal playbook demo (second schema) |
| `formal/cuad.py` | CUAD clause-presence adapter: TF-IDF baseline + quote/absence receipts |
| `formal/cuad_qa.py` | CUAD fine-tuned span extractor + official AUPR/P@80/P@90 metrics |
| `formal/negative.py` | 17 adversarial cases for test-041/088/091/093/095/100 |
| `formal/evaluate.py` | Inventory, agreement, mutation tests, determinism, runtime |
| `competitive/` | Frozen claim sets, detector runners, audit forms, pre-registration |
| `legal/` | Synthetic contract + playbook, CUAD adapter, and CUAD pilot report |

## Semantics

- **Premises** are the 48 structured rows. Page quotes are evidence attached to
  answers, not premises.
- `jobs2033 = jobs + change` is the only derived field.
- `N/A` annual pay is `has_annual = false`, never zero.
- Physicians and Surgeons pay is **top-coded**: the page says "equal to or
  greater than $239,200", so the premise is `pay >= 239200`, not `pay = 239200`.
- The benchmark's `difference` is **symmetric**: `|a − b|`. A directional
  reading (`a − b`) is a separate claim and is checked separately.
- Absence is **closed-world over the snapshot schema**: place/company pay,
  2010 employment, 2012–22 growth, and 2033-specific openings are not in the
  snapshot. This is not an open-world absence claim.

## Verdicts

```text
ENTAILED                     P ∧ C sat, P ∧ ¬C unsat
ENTAILED_UNDER_ASSUMPTIONS   same, but a recorded spec was used
CONTRADICTION                P ∧ C unsat
UNKNOWN                      both P ∧ C and P ∧ ¬C sat
INCOMPLETE                   missing part, overclaim, or claim does not answer the question
ABSENT_CONFIRMED             the answer correctly says a schema-absent part is not stated
NOT_FOUND_IN_CORPUS          exhaustive search of a declared corpus found nothing
NEEDS_SPECIFICATION          unresolved quantifier/metric/scope/unit/direction/model
NOT_FORMALIZABLE             no deterministic compiler or formal theory
```

`INCOMPLETE` also covers structural mismatch: a true claim about the wrong
field, wrong candidate set, or unfiltered set is not an answer to this question.

## Current evidence (2026-11-04)

Human-audited pilot, not a final benchmark claim:

| Set | Contradicted | False accepts | False rejects | Coverage | One-sided 95% upper bound |
|---|---:|---:|---:|---:|---:|
| 160 public synthetic | 80 | **0** | 1 | 0.74 | 3.7% |
| 80 DeepSeek natural (subset of 320) | 8 | **0** | 0 | 1.00 | 31.2% |
| 160 two-reader natural (subset of 320) | 15 | **0** | 0 | 1.00 | 18.1% |
| **320 four-reader natural (audited)** | **26** | **0** | **0** | **1.00** | **10.9%** |
| Synthetic + natural | 106 | **0** | — | — | 2.8% |

The four-reader natural set is DeepSeek 4.1 Flash DA + Sonnet 5.5 DA +
GLM-5.3-Flash DA + Qwen 3.8 27B DA, human-audited and corrected: **1.00
binary, 0.99 exact, 0 false accepts, 0 false rejects, 1.00 coverage**. The 0.99
exact is four `partial` answers judged `CONTRADICTION`; binary is correct.

On the same 320 natural claims:

| System | Binary | Exact | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **1.00** | 0.99 | **0** | **0** | **1.00** |
| MiniCheck | 0.72 | 0.24 | 13 | 75 | 1.00 |
| LettuceDetect | 0.21 | 0.21 | 186 | 66 | 1.00 |
| HHEM-2.1-Open | 0.76 | 0.25 | 4 | 73 | 1.00 |

The synthetic set's coverage is 0.74 because formal abstains on the 40
contradicted absence claims (`INCOMPLETE`); binary accuracy is 1.00. The one
false reject is the top-coded Physicians maximum.

### CUAD legal pilot

The CUAD adapter is a separate public-benchmark pilot, not part of the OOH
claim. It uses the official 408/102 contract split and a deterministic
per-category TF-IDF clause detector with a lexical guard, quote, and coverage
receipt. At the balanced operating point: **precision 0.882, recall 0.660,
micro F1 0.755, 110 false accepts (3.7% of absent clauses), 423 false rejects,
quote support 0.552** on 4,182 claims. At the precision-first point:
**precision 0.911, recall 0.568, 69 false accepts (2.4%), 537 false rejects,
quote support 0.602**. This is a baseline, not a CUAD leaderboard result and
not legal advice. Details: `legal/CUAD-PILOT.md`.

`--mode span` runs the official-style Jaccard ≥ 0.5 / AUPR / P@80 / P@90
harness. The TF-IDF sentence-window floor is macro AUPR 0.157 / P@80 0.023 /
P@90 0.000; it validates the metric harness, not a competitive span result.
`--encoder legal-bert` is an optional, slower Legal-BERT baseline; it needs the
separate `legal/cuad/requirements-legal.txt` venv. Full run: precision 0.947,
recall 0.415, micro F1 0.577, 29 false accepts, 728 false rejects, quote
support 0.602. It is more precise but much more conservative than TF-IDF; it
does not solve the weak categories.

`formal/cuad_qa.py` runs a CUAD fine-tuned span model
(`akdeniz27/roberta-base-cuad`) with official-style AUPR / P@80 / P@90 and
question-level presence/no-answer metrics. That is the reader layer; the
verifier layer remains separate. Results are pending.

**Caveats.** The natural set is reader-held-out, not question-held-out; it uses
the same 100 development-informed questions. One auditor labelled it, with no
second rater. The OOH natural set is one corpus and one snapshot, and has only
26 contradicted natural claims. CUAD is a public second-domain baseline, not a
private legal pilot. It does not establish a population false-accept rate,
general NLI, open-world absence, or a second production domain.

## Reproduce

Public synthetic slice:

```bash
cd bench/formal
.venv/bin/python competitive/build_pilot_160.py
.venv/bin/python -m formal.competitive \
  --claims competitive/pilot-160-human.jsonl \
  --detector competitive/detectors/minicheck-160.jsonl \
  --detector competitive/detectors/lettucedetect-160.jsonl \
  --detector competitive/detectors/hhem-160.jsonl
```

The natural slices are local and gitignored. Reports contain aggregates only:
`competitive/private/NATURAL-AUDIT-REPORT.md` and
`competitive/private/MULTIREADER-AUDIT-REPORT.md`.

## Competitive audit workflow

Build a claim set, export a one-question form, audit it, then merge the export:

```bash
.venv/bin/python competitive/build_multireader.py
.venv/bin/python competitive/build_multireader_forms.py
.venv/bin/python competitive/apply_multireader_audit.py \
  --input competitive/private/multireader-320.jsonl \
  --export ~/Downloads/gold-results-deepseek.json \
  --export ~/Downloads/gold-results-sonnet.json \
  --export ~/Downloads/gold-results-glm.json \
  --export ~/Downloads/gold-results-qwen.json \
  --out competitive/private/multireader-320-human.jsonl
```

The gold form hides provisional labels by default. The human label is
authoritative; corrections are recorded alongside the raw export.

## Specification layer

Ambiguity is a typed state, not a guess. A QIR with an unresolved slot returns
`NEEDS_SPECIFICATION`; `close_qir` fills slots from user overrides or the
versioned registry and records every assumption in the verdict.

```python
from formal.rows import build_dataset
from formal.spec import SpecRegistry
from formal.spec_examples import most_bachelors_pay_over_60k
from formal.z3check import verify_question

ds = build_dataset()
resolution, answer, verdict = verify_question(
    most_bachelors_pay_over_60k(),
    ds,
    registry=SpecRegistry(),
)
# verdict.verdict == "ENTAILED_UNDER_ASSUMPTIONS"
# verdict.assumptions[0].source == "default"  (or "user")
# verdict.spec_id is the receipt hash
```

Set `allow_defaults=False` to require an explicit policy. Open-world absence
stays `NEEDS_SPECIFICATION` until a declared corpus and coverage receipt exist;
a causal or normative claim needs an explicit model/theory, and without a
formal theory it remains `NOT_FORMALIZABLE`. Neither is ever silently accepted.

## Epics

- `EPIC-FORMAL-002.md` — specification layer, reader-first verification,
  gate integration, coverage receipts, competitive harness, router.
- `EPIC-FORMAL-003.md` — legal/private-corpus pilot: contract playbook
  compliance and data-room completeness. Synthetic demo only; no real pilot.
