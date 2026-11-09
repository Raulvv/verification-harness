# EPIC-FORMAL-001 spike report

**Status:** complete, uncommitted, default behavior unchanged. Python-only
(`z3-solver` in `bench/formal/.venv`), no model/API calls, no 300-question run.

## 1. Acceptance

| Acceptance | Result |
|---|---|
| 30–50 formalized questions | **40 value-bearing questions** (20 lookup, 4 compare, 7 difference, 3 sum, 6 extremum) |
| 100% compile to IR | **100/100** test + **14/14** dev; 0 `NOT_FORMALIZABLE` |
| Zero false `ENTAILED` on contradicted negatives | **17/17** known-row cases pass, **0** false `ENTAILED`; **91/91** mutations not `ENTAILED` |
| Explicit `UNKNOWN` / `NOT_FORMALIZABLE` | 1 `UNKNOWN` (top-coded test-095); `NOT_FORMALIZABLE` path tested, 0 instances in inventory |
| Deterministic verdicts | identical rerun (verdict + canonical answer) |
| No model/API, no default changes, no 300 run | yes |

The 40 value questions are the 30–50 target. The remaining 60 questions are
also compiled, but by the separate **absence** (40) and **partial** (20)
compilers; they are not counted as value-claim formalizations.

## 2. Formalizable list and per-type coverage

### Value questions (40/40 answerable)

| Type | n | IDs |
|---|---:|---|
| lookup | 20 | test-014, 017, 020, 031, 033, 040, 043, 044, 050, 057, 058, 059, 062, 067, 073, 075, 076, 077, 084, 090 |
| compare | 4 | test-001, 053, 064, 065 |
| difference | 7 | test-007, 011, 038, 041, 087, 088, 092 |
| sum | 3 | test-019, 081, 089 |
| extremum | 6 | test-005, 030, 048, 079, 095, 100 |
| count/filter (dev) | 5 | dev-agg-004, 005, 009, 011, 014 |

The dev set also contributes 7 extremum, 5 count/filter and 2 sum items
(14/14 compiled, 14/14 `ENTAILED`).

### Absence (40/40)

| Scope | n | IDs |
|---|---:|---|
| place pay | 20 | test-003, 025, 026, 028, 032, 046, 049, 056, 060, 066, 068, 069, 070, 072, 074, 082, 083, 086, 094, 096 |
| 2010 employment | 8 | test-006, 008, 013, 037, 039, 045, 054, 099 |
| 2012–22 growth | 6 | test-010, 015, 023, 029, 036, 061 |
| company pay | 5 | test-018, 063, 071, 085, 097 |
| 2033-specific openings | 1 | test-091 |

### Partial (20/20)

| Shape | n | IDs |
|---|---:|---|
| pay stated + place pay absent | 12 | test-002, 004, 009, 016, 021, 034, 035, 042, 047, 078, 080, 098 |
| growth stated + 2010 jobs absent | 4 | test-012, 024, 027, 051 |
| education stated + 2033 openings absent | 4 | test-022, 052, 055, 093 |

Coverage: **40/40 answerable value**, **40/40 absence**, **20/20 partial**,
**0/100 not formalizable**.

## 3. IR schema

```
QIR := Lookup(entity, field)
     | Compare(field, entities[2], higher|lower)
     | Difference(field, entities[2])              # symmetric |a - b|
     | Sum(field, entities[n])
     | Extremum(field, candidate_set, max|min, filter?)
     | Count(candidate_set, filter)
     | Absence(field, entity, scope)
     | Partial(QIR[n])
     | NotFormalizable(reason)

CandidateSet := all | paid | select(titles[n])
Filter        := field op value                  # > >= < <= = !=
Scope         := place | company | year | period | specific_year
                 (all non-empty scopes are outside the snapshot schema)

Term := Const(v) | Field(entity, field) | Diff(a,b) | AbsDiff(a,b)
      | Sum(terms[n]) | Count(candidate_set, filter)
      | ArgMax(field, candidate_set, filter) | ArgMin(...)

Claim        := Term op Term
AnswerPart   := status: stated|not_stated|unknown, claim?, citations[n]
AnswerIR     := AnswerPart[n]
Citation     := (title, slug, field, quote, source)
```

`Term` is typed by field: numeric fields are Z3 `Int`, string fields
(`education`, `work_experience`, `training`) are stable integer codes so Z3
never enters the string solver.

## 4. Z3 verdicts and counterexamples

### Canonical verdicts

| Set | ENTAILED | ABSENT_CONFIRMED | UNKNOWN | CONTRADICTION | NOT_FORMALIZABLE |
|---|---:|---:|---:|---:|---:|
| test-100 | 59 | 40 | 1 | 0 | 0 |
| dev-14 | 14 | 0 | 0 | 0 | 0 |

`UNKNOWN` is test-095 only: the winner (Physicians and Surgeons) is entailed,
but the exact pay is a lower bound. Z3's countermodel sets Physicians pay to
`239,201` while satisfying every premise, so `pay = 239,200` is not entailed.

### Known-row negative cases (17/17, 0 false ENTAILED)

| Row | Case | Verdict |
|---|---|---|
| test-041 | canonical symmetric gap | ENTAILED |
| test-041 | directional `Graphic − Waiters = 450,100` | CONTRADICTION (actual −450,100) |
| test-041 | single operand 21,100 | CONTRADICTION |
| test-088 | canonical symmetric gap | ENTAILED |
| test-088 | signed `Chefs − Accountants = 20,960` | CONTRADICTION (actual −20,960) |
| test-091 | canonical schema absence | ABSENT_CONFIRMED |
| test-091 | annual average 18,500 as 2033-specific | INCOMPLETE |
| test-093 | canonical partial | ENTAILED (education + absence) |
| test-093 | 2033 openings 8,800 overclaimed | INCOMPLETE |
| test-093 | wrong education | CONTRADICTION |
| test-095 | canonical top-coded maximum | UNKNOWN (winner ENTAILED, value UNKNOWN) |
| test-095 | wrong winner below the maximum | CONTRADICTION |
| test-095 | exact value above the lower bound | UNKNOWN |
| test-100 | canonical filtered maximum | ENTAILED |
| test-100 | current harness answer (Accountants 79,880) | CONTRADICTION (actual Airline 171,210) |
| test-100 | boundary: growth exactly 4% | CONTRADICTION (Physicians excluded) |
| test-100 | dropped filter (true unfiltered claim) | INCOMPLETE |

### Mutation tests

91 wrong variants of the 40 value answers: **89 CONTRADICTION, 1 INCOMPLETE,
1 UNKNOWN, 0 ENTAILED**. The single `UNKNOWN` is the top-coded exact-value
mutation; the single `INCOMPLETE` is the dropped-filter structural mismatch.

## 5. Agreement, runtime, failure taxonomy

- **Canonical answer agreement:** 100/100 on the 100-question development set,
  14/14 on the dev aggregate set. Private v2 labels were read only for this
  aggregate scoring and are not reproduced. This is a compiler/table
  consistency check, not an independent correctness proof: the canonical answer
  is derived from the same structured rows used as premises. The independent
  evidence is the 108 adversarial checks (wrong values, wrong winners, wrong
  direction, dropped filters, overclaims, top-coded exact values).
- **Strict acceptance** (`ENTAILED` or `ABSENT_CONFIRMED`): 99/100 test,
  14/14 dev. The one exception is the deliberate top-coded `UNKNOWN`.
- **False `ENTAILED`:** 0 on 17 negative cases and 0 on 91 mutations.
- **UNKNOWN rate:** 1% (test), 0% (dev).
- **NOT_FORMALIZABLE rate:** 0%.
- **Runtime:** 90.95 ms for the 100 canonical checks (mean 0.91 ms, p95
  2.26 ms); 423 ms for the full evaluation including mutations, negatives and
  determinism rerun. Premises build: ~9 ms.
- **Determinism:** identical verdict and canonical answer on rerun.

### Failure taxonomy

| Class | Example | Formal behavior |
|---|---|---|
| Top-coded value | test-095 | winner ENTAILED; exact value UNKNOWN, not ENTAILED |
| Symmetric vs directional difference | test-041, 088, 092 | symmetric gap ENTAILED; signed/directional reading CONTRADICTION |
| Schema absence | 40 unanswerable, 20 partial absent parts | ABSENT_CONFIRMED only for the closed-world snapshot; never open-world |
| Partial overclaim | test-091, 093 | value asserted for an absent part → INCOMPLETE |
| Filter boundary | test-100 | `growth > 4%` excludes the 4% row → CONTRADICTION |
| Incomplete candidate set | test-100 harness answer | 3 examples instead of all filtered rows → CONTRADICTION |
| Structural mismatch | dropped filter | true but irrelevant claim → INCOMPLETE, not ENTAILED |
| N/A pay | Fishing and Hunting Workers, Musicians and Singers | no annual pay; lookup is ABSENT_CONFIRMED, never zero |
| Not formalizable | causal/open-world question | explicit NOT_FORMALIZABLE (0 instances in this inventory) |

### Current-harness coverage finding

The cached held-out output abstains on 7 answerable rows (test-041, 050, 062,
076, 077, 087, 095) and gives a false "cannot be determined" on test-030.
That is 8 answerable questions the formal compiler resolves. These are
coverage failures of the current pipeline, not false accepts by the formal
checker. In particular, test-095's abstention is conservative: the winner is
entailed, only the exact top-coded value is not.

## 6. Recommendation

**High-coverage formal subset, with NLI as the fallback for the residual.**

For the structured OOH benchmark, the formal path is strong enough to be the
primary verifier: 100% of this inventory compiles, 99% is strictly accepted,
and there are zero false `ENTAILED` across 108 adversarial checks. It is
deterministic, cheap (~0.9 ms/question), and auditable.

Do **not** generalize this to general NLI or open-world absence. The formal
verdict is only as broad as the 48-row schema: place/company pay, 2010
employment, 2012–22 growth and 2033-specific openings are absent from the
snapshot, not absent from the world. For questions outside the schema, the
correct architecture is:

1. **Formal first** when the question maps to the table schema (lookup,
   comparison, difference, sum, extremum, count/filter, schema absence,
   partial).
2. **NLI/MiniCheck fallback** only for `NOT_FORMALIZABLE` questions, with the
   formal verdict as a deterministic gate rather than a replacement for NLI.

## 7. Not done (by instruction)

- No commit, no integration, no default reader/judge change.
- The separate 300-question plan untouched and unstaged.
- No 300-question clean-set run.
- No private labels or per-question private outputs published.

## Follow-up

`bench/formal/EPIC-FORMAL-002.md` specifies the next layer: ambiguity as a
deterministic `NEEDS_SPECIFICATION` state, a versioned specification registry,
conditional `ENTAILED_UNDER_ASSUMPTIONS` receipts, prose claim extraction, and
closed-corpus absence. Phase 0/1 are implemented in `formal/spec.py`; Phase 2 is
partial. Phase 1.5 adds human-readable assumptions in the answer and an opt-in
`ask --formal-cmd` bridge that prints the answer, assumptions, evidence quotes,
and formal verdict. The EPIC-FORMAL-001 results above remain unchanged.
