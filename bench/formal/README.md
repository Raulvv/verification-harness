# Formal verification spike (OOH)

Python-only prototype for deterministic claim verification over the OOH
structured snapshot. **No Node, no model calls, no default reader/judge
changes.** Everything lives under `bench/formal/`.

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

## Layout

| File | Role |
|---|---|
| `formal/model.py` | Typed IR: `QIR`, `Term`, `Claim`, `AnswerIR`, `Citation`, verdicts |
| `formal/rows.py` | JSON rows, markdown table cross-check, quote→row/field mapping, schema |
| `formal/parse.py` | Deterministic English question → `QIR` |
| `formal/compile.py` | `QIR` → canonical `AnswerIR` (derivation) |
| `formal/spec.py` | Specification layer: `SpecRegistry`, `close_qir`, assumptions |
| `formal/spec_examples.py` | Direct IR examples for “most”, “stability”, direction, unit, causal, normative, open-world absence |
| `formal/z3check.py` | Z3 premises + 3-valued entailment + structural relevance |
| `formal/negative.py` | 17 adversarial cases for test-041/088/091/093/095/100 |
| `formal/evaluate.py` | Inventory, agreement, mutation tests, determinism, runtime |

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

```
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
