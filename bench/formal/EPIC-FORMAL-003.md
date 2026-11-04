# EPIC-FORMAL-003 — Closed-schema legal verification for private corpora

**Status:** proposed; synthetic proof of concept and public CUAD baseline implemented
**Prepared:** 2026-11-04  
**Predecessor:** EPIC-FORMAL-002 (specification layer, reader-first verification, gate integration, coverage receipts)  
**Related:** `bench/formal/EPIC-FORMAL-002.md` §1.7 (market assessment), `bench/formal/REPORT.md`

### Implementation status

| Piece | Status | Evidence |
|---|---|---|
| Synthetic contract + playbook | complete | `legal/contract.md`, `legal/playbook.json` |
| Deterministic legal fact extraction | complete (demo) | `formal/legal.py` extracts 6 fields with clause/quote |
| Rule engine + receipts | complete (demo) | `verify_playbook`, `verify_contract`; `ENTAILED`/`CONTRADICTION`/`INCOMPLETE` |
| CUAD public benchmark adapter | complete (presence baseline + fine-tuned span runner) | `formal/cuad.py`, `formal/cuad_qa.py`, `legal/CUAD-PILOT.md`, `legal/CUAD-QA-REPORT.md`; 4,182 claims on the official 408/102 split |
| Legal expert review | not started | required before any pilot claim |
| Real document ingestion | not started | PDF/DOCX/OCR/clause segmentation |
| Private deployment/security | not started | required before private data |
| Pilot evaluation | not started | 50–100 expert-labeled requirements |

The synthetic demo contains no client data, no legal advice, and no expert
review. It proves the architecture on a second schema; it is not a legal pilot.
The CUAD adapter runs on a public legal corpus, but it is a deterministic
clause-presence baseline, not a CUAD leaderboard result and not legal advice.

### CUAD public benchmark adapter

CUAD v1 provides 510 commercial contracts, 41 clause categories, and expert
spans. The adapter uses the official 408/102 contract split and a train-only
per-category TF-IDF detector with a lexical guard. Every claim returns either a
supporting sentence with offsets or a closed-corpus absence receipt.

At the balanced operating point on 4,182 test claims: **precision 0.882,
recall 0.660, micro F1 0.755, 110 false accepts (3.7% of absent clauses), 423
false rejects, quote support 0.552**. At the precision-first point: **precision
0.911, recall 0.568, 69 false accepts (2.4%), 537 false rejects, quote support
0.602**. Legal-BERT is more precise but more conservative: **0.947 / 0.415 /
0.577, 29 false accepts, 728 false rejects, quote support 0.602**. The weak
categories are the ones that need legal interpretation rather than lexical
matching. The public CUAD fine-tuned checkpoint `akdeniz27/roberta-base-cuad`
gives **AUPR 0.531 / P@80 0.308 / P@90 0.129**. The harness tradeoff is
**34.5% no-answer false accepts at the zero threshold**, **7.5% at best F1**,
and **3.0% at precision-first** (21% coverage). This is a reader result plus a
harness tradeoff, not a legal claim. Full method, per-category results, and
caveats: `legal/CUAD-QA-REPORT.md` and `legal/CUAD-PILOT.md`.

The current formal evidence remains the OOH pilot described in
`EPIC-FORMAL-002.md` and the root `README.md`: 0 observed false accepts on 106
human-audited contradicted claims (80 synthetic + 26 natural), with 0 false
rejects and 1.00 coverage on the 320-claim four-reader natural set. That result
does not transfer to legal documents without a real legal pilot, expert labels,
and a private deployment/security review.

---

## 0. One-page summary

EPIC-FORMAL-002 turned the formal verifier into a reader-first assurance layer:
a reader answer becomes typed claims, claims are closed with explicit
definitions, citations are gated, and the verdict routes to show/reject/ask/
fallback/human. It is not a general legal AI and it is not a replacement for a
reader or an NLI detector.

This epic applies that layer to **one narrow legal workflow over a private
corpus**. The product statement is:

> A deterministic verifier for defined legal requirements over a closed private
> corpus, with a clause citation and a rule receipt for every result.

Not:

> An AI lawyer that tells you whether a contract is good.

The first pilot should be **contract playbook compliance** for commercial
contracts. Data-room completeness is the second candidate because it exercises
closed-corpus absence with coverage receipts.

### Synthetic proof of concept

A minimal second-schema demo is implemented:

```bash
cd bench/formal
.venv/bin/python -m formal.legal \
  --contract legal/contract.md \
  --playbook legal/playbook.json
```

It extracts six fields from a synthetic contract (governing law, liability cap
months, notice days, renewal months, data protection presence, assignment
consent) and checks six playbook rules. Each finding carries the clause heading,
the quote, the rule, the observed value, a spec hash, and a route. A bad
liability cap returns `CONTRADICTION`; a missing data-protection clause returns
`INCOMPLETE`.

This is a demo, not a legal pilot: no client data, no legal advice, no expert
review, no PDF/DOCX ingestion, no private deployment.

---

## 1. Why legal is a fit — and where it is not

### 1.1 The fit

Legal work contains a large structured subset:

- liability caps, indemnities, payment terms, notice periods
- governing law, jurisdiction, venue
- term, renewal, termination, cure periods
- defined-term consistency and cross-references
- required clauses and prohibited clauses
- dates, amounts, currencies, percentages, thresholds
- version/amendment precedence
- data-room completeness
- policy/control evidence

These are exactly the claims a deterministic verifier can check with a clause
citation and a rule receipt.

### 1.2 The boundary

Legal work also contains an open-textured subset:

- “reasonable efforts,” “material,” “fair,” “commercially reasonable”
- intent, knowledge, good faith
- precedent weighting and jurisdiction conflicts
- interpretation of ambiguous drafting
- strategy, risk allocation, legal advice

These are not closed. The system must return `NEEDS_SPECIFICATION` or route to a
human. It must not pretend certainty.

### 1.3 Product position

- **Decision support, not legal advice.**
- **Assurance layer, not a legal AI platform.**
- **Integrate with the reader and the legal workflow**, not replace them.
- **Human review required** for open-textured, contested, or high-stakes
  conclusions.

---

## 2. First pilot: contract playbook compliance

### 2.1 Workflow

Input:

- a commercial contract (PDF/DOCX, with exhibits and amendments)
- a playbook of defined requirements
- a declared corpus (the contract and its incorporated documents)

Output, per requirement:

- `ENTAILED` — the clause satisfies the rule; cite the clause and the rule
- `CONTRADICTION` — the clause violates the rule; cite both
- `NEEDS_SPECIFICATION` — the rule or the clause is not closed
- `INCOMPLETE` — the clause/document is missing or ambiguous
- `NOT_FORMALIZABLE` — the requirement is open-textured; route to human/NLI
- `NOT_FOUND_IN_CORPUS` — the required clause/document is absent from the
  declared corpus, with a coverage receipt

### 2.2 Example rules

| Rule | Formal check |
|---|---|
| Liability cap ≥ 12 months of fees | amount arithmetic + defined “fees” + period |
| Governing law = Delaware | clause value + jurisdiction |
| Notice period = 30 days | date arithmetic + business/calendar days |
| Renewal term ≤ 12 months | duration arithmetic |
| Data protection clause present | required-clause presence |
| Assignment requires consent | clause presence + condition |
| Payment terms ≤ 60 days | duration arithmetic |
| No unlimited liability | prohibited-clause check |

### 2.3 What the receipt contains

- requirement id and rule text
- contract id, clause id, page/span
- the extracted fact(s) and the defined terms used
- the spec/playbook version and hash
- the gate status of the clause quote
- the formal verdict and any counterexample
- the route: show/reject/ask/fallback/human
- the human reviewer, if any

---

## 3. Second candidate: data-room completeness

Input: a declared data room and a required-document checklist.

Output per item:

- `ENTAILED` — document present and matches the required type
- `NOT_FOUND_IN_CORPUS` — absent from the declared data room, with a coverage
  receipt (files searched, index version, query, exclusions)
- `NEEDS_SPECIFICATION` — the checklist item is ambiguous
- `INCOMPLETE` — document present but incomplete

This is the cleanest use of closed-corpus absence and the coverage receipt.

---

## 4. Architecture

```
contract + playbook
  → document ingestion (PDF/DOCX, OCR, tables, exhibits)
  → clause/defined-term/date/amount extraction
  → typed claim IR (with unresolved slots)
  → playbook spec resolution (definitions, units, day-count, precedence)
  → citation gate (quote exists in the clause/page)
  → formal verifier (Z3)
  → NLI fallback for open-textured prose
  → human review for judgment
  → receipt + route
```

Reuse from EPIC-FORMAL-002:

- `QIR`, `Term`, `Claim`, `Spec`, `Unresolved`, `Assumption`
- `close_qir`, `check_answer`, `verify_question`
- `RuleBasedExtractor` as a baseline; replace/extend with a legal extractor
- `CorpusIndex` and `CoverageReceipt`
- `router.py` and `nli.py`
- `ask --formal` bridge and gate integration

New for legal:

- document ingestion and clause segmentation
- legal entity/defined-term/date/amount extraction
- playbook schema and rule registry
- version/amendment/precedence logic
- clause-level citation and page/span mapping
- privilege/confidentiality/security controls
- legal expert evaluation

---

## 5. Legal schema (initial)

```
Contract:
  id, parties, effective_date, term, governing_law, jurisdiction,
  documents[], amendments[], exhibits[]

Clause:
  id, heading, text, page, span, type, parent, cross_refs[]

DefinedTerm:
  term, definition, clause_id, scope

Obligation:
  actor, action, object, trigger, deadline, remedy, clause_id

Amount:
  value, currency, basis, period, cap_or_floor, clause_id

Requirement:
  id, rule, field, op, value, unit, day_count, precedence, severity

Verdict:
  requirement_id, clause_id, status, counterexample, receipt
```

Open-textured requirements are represented as `Unresolved(kind="theory")` or
`kind="model"`; they never become a guessed `ENTAILED`.

---

## 6. Work breakdown

### Phase 0 — Workflow and schema freeze

- Choose contract playbook compliance as the first pilot.
- Freeze 20–30 requirements and the initial legal schema.
- Define the receipt format and the `NEEDS_SPECIFICATION` taxonomy.
- Define “not legal advice” and human-review policy.
- Recruit a legal expert reviewer.

Exit: reviewed schema, playbook, and receipt; no open questions about scope.

### Phase 1 — Ingestion and clause segmentation

- PDF/DOCX ingestion with page/span preservation.
- Clause segmentation and heading detection.
- Defined-term and cross-reference extraction.
- Exhibit/amendment linkage.
- OCR fallback with confidence.

Exit: clause-level text and spans on a pilot contract set; no silent text loss.

### Phase 2 — Legal claim extraction

- Extract clause type, parties, dates, amounts, obligations, defined terms.
- Map to the typed IR with explicit holes.
- Measure precision/recall on an expert-labeled sample.
- Human-in-the-loop correction for extraction.

Exit: extraction never closes a claim with a missing slot; measured quality.

### Phase 3 — Playbook rule engine

- Requirements as typed rules with units, day-count, precedence.
- Spec registry for definitions and fallbacks.
- Versioned playbook hash.
- `ENTAILED` / `CONTRADICTION` / `NEEDS_SPECIFICATION` / `INCOMPLETE`.

Exit: same contract + same playbook → identical verdicts and receipts.

### Phase 4 — Gate, absence, and receipts

- Gate every clause quote against the source page.
- `NOT_FOUND_IN_CORPUS` for required clauses/documents with a coverage receipt.
- Clause-level counterexamples for `CONTRADICTION`.
- Receipt export for legal review.

Exit: no ungated quote; no open-world absence claim; every result auditable.

### Phase 5 — NLI/human fallback

- Route open-textured requirements to NLI/human.
- Never override a formal `CONTRADICTION` on a closed rule.
- Human review queue and disposition capture.

Exit: formal contradiction is final for closed rules; open-textured claims are
clearly labeled.

### Phase 6 — Security and private deployment

- Private/VPC/on-prem deployment.
- Encryption at rest/in transit; RBAC; audit logs.
- Data residency and retention policy.
- Privilege/confidentiality handling.
- Threat model: prompt injection, document injection, exfiltration.

Exit: security review signed off; pilot data never leaves the agreed boundary.

### Phase 7 — Pilot evaluation

- 50–100 expert-labeled requirements across 20–50 contracts.
- Metrics: precision, recall, false accepts, false rejects, abstention,
  `NEEDS_SPECIFICATION` rate, time-to-review.
- Compare with the current manual playbook review and with a general LLM/NLI
  baseline.
- Legal expert audit of receipts.

Exit: pilot report; go/no-go for a second workflow.

---

## 7. Expectations and acceptance criteria

### Functional

- Every requirement produces a typed verdict and a receipt.
- Every `ENTAILED` has a clause citation and a rule/spec receipt.
- Every `CONTRADICTION` has a counterexample clause/field.
- Every `NEEDS_SPECIFICATION` names the missing definition.
- Every `NOT_FOUND_IN_CORPUS` has a coverage receipt.
- Every quote is gate-verified or explicitly labeled ungated.

### Safety

- 0 false `ENTAILED` on the expert-labeled contradicted set.
- No open-world absence claim.
- No formal `CONTRADICTION` overridden by NLI.
- No legal conclusion without human review where the rule is open-textured.
- No claim of legal advice.

### Quality targets (provisional)

- Clause extraction recall ≥ 95% on the pilot set.
- Defined-term/date/amount extraction precision ≥ 95%.
- Requirement verdict accuracy ≥ 90% against expert labels.
- False accepts ≤ 1% on contradicted requirements.
- Expert audit: ≥ 90% of receipts judged faithful.
- Human review time reduced vs manual baseline (target to be set in Phase 0).

### Security

- Private deployment; no data egress without explicit configuration.
- RBAC and audit logging.
- Retention/deletion policy.
- Privilege/confidentiality review.

---

## 8. Validation plan

- **Unit/golden tests** for the legal schema, rule engine, units, day-count,
  precedence, and versioning.
- **Extraction evaluation** on expert-labeled contracts.
- **Negative tests**: wrong cap, wrong governing law, missing clause, expired
  version, ambiguous defined term, fabricated clause quote.
- **Gate tests**: real quote accepted; fabricated quote rejected; ungated quote
  labeled.
- **Absence tests**: required document present/absent; seeded mention not
  reported absent.
- **Human audit** of `ENTAILED` and `CONTRADICTION` receipts.
- **Security review** and private-deployment test.
- **Baseline comparison** with a general LLM/NLI workflow on the same
  requirements.
- **Determinism**: same contract + same playbook → identical verdicts/receipts.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Legal liability / unauthorized practice | Decision support only; human review; disclaimers; counsel sign-off |
| False confidence from extraction/schema | Measure extraction; never close a missing slot; counterexamples; audit |
| Privilege/confidentiality | Private deployment; RBAC; encryption; retention policy |
| Version/amendment drift | Versioned documents and playbooks; precedence rules; effective dates |
| Jurisdiction/conflict of laws | Explicit jurisdiction scope; `NEEDS_SPECIFICATION` when outside |
| Open-textured terms | `NEEDS_SPECIFICATION` / NLI / human; never guess |
| Adversarial documents | Gate quotes; schema validation; injection tests |
| Long-tail clauses/exhibits | Human-in-the-loop; coverage receipts; scope limits |
| Benchmark overfitting | Multiple contracts, experts, and a held-out set |
| Product overclaim | “Defined legal requirements over a closed corpus,” not “AI lawyer” |

---

## 10. Non-goals

- Legal advice or representation.
- General legal reasoning or strategy.
- Predicting case outcomes.
- E-discovery or litigation support.
- Replacing the legal AI platform or the reader.
- Open-world legal research.
- Autonomous execution of legal decisions.

---

## 11. Decision gates

### Gate A — scope and schema

Pass when the first workflow, 20–30 requirements, legal schema, receipt format,
and human-review policy are frozen and reviewed by a legal expert.

### Gate B — ingestion and extraction

Pass when clause-level text/spans are preserved, extraction meets the
provisional targets, and missing slots are never closed silently.

### Gate C — rule engine and gate

Pass when the playbook produces deterministic verdicts and every displayed
quote is gate-verified or labeled ungated.

### Gate D — safety

Pass when 0 false `ENTAILED` on the expert-labeled contradicted set, no
open-world absence claim, and no NLI override of a formal contradiction.

### Gate E — pilot

Pass when the expert audit meets the receipt-faithfulness target and the
go/no-go decision is documented.

---

## 12. Open questions

1. Which contract type and playbook first: commercial SaaS, procurement, or
   employment?
2. Which 20–30 requirements are both high-value and formalizable?
3. How do we represent “reasonable efforts” without pretending it is closed?
4. What is the minimum clause/span granularity for a legal reviewer?
5. How do we handle amendments and order-of-precedence across documents?
6. What is the human-review SLA and escalation path?
7. Which private deployment model is required by the first customer?
8. What legal expert label volume is enough for the pilot?
9. How do we compare against a general LLM/NLI baseline without overclaiming?
10. What is the liability/insurance position before a paid pilot?

---

## 13. References

- `bench/formal/EPIC-FORMAL-002.md` — specification layer, reader-first
  verification, gate integration, coverage receipts, market assessment.
- `bench/formal/REPORT.md` — EPIC-FORMAL-001 spike report.
- `bench/formal/README.md` — usage, IR, verdict semantics.
- `bench/formal/formal/extract.py` — reader-first claim extraction baseline.
- `bench/formal/formal/coverage.py` — closed-corpus absence and receipts.
- `bench/formal/formal/router.py` — verdict → product action.
- `bench/formal/formal/nli.py` — NLI fallback adapter.
- `bench/formal/formal/legal.py` — synthetic legal playbook demo.
- `bench/formal/legal/` — synthetic contract and playbook.
- `bench/formal/tests/test_legal.py` — 6 legal demo tests.
- `kit/lib/cli/ask.mjs` — `ask --formal` bridge and gate integration.
