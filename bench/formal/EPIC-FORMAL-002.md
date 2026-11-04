# EPIC-FORMAL-002 — Specification-aware formal verification (four-layer model)

**Status:** in progress; Phase 0/1 complete, Phase 2 partial  
**Prepared:** 2026-11-04  
**Predecessor:** EPIC-FORMAL-001 (the `bench/formal/` Z3 spike)  
**Related:** `bench/formal/REPORT.md`, `bench/formal/README.md`, `PLAN.md` (read-only; separate 300-question plan)

---

## 0. One-page summary

EPIC-FORMAL-001 proved that a deterministic Z3 layer can verify structured
claims over the 48-row OOH snapshot: 40 value questions formalized, 100/100
questions compiled, 0 false `ENTAILED` across 108 adversarial checks, and one
deliberate `UNKNOWN` for a top-coded value.

It also exposed the boundary. The current verifier works because the corpus is a
closed table and the questions are templated. It does **not** handle general
prose, open-world absence, evaluative claims, causal claims, or ambiguity.

This epic adds the missing layer: **specification**. The central design
position is:

> Ambiguity is not a reason to guess or to hand the claim to NLI. Ambiguity is a
> deterministic signal that the claim is not yet closed. The system must return
> `NEEDS_SPECIFICATION` with a typed reason, obtain a definition or context,
> record it as an explicit assumption, and only then verify.

The four layers become:

1. **Citation authenticity** — the quote exists in the document.
2. **Fact mapping and claim extraction** — quote → row/field; prose → typed,
   possibly incomplete claim IR.
3. **Specification + claim entailment** — close the IR with explicit
   definitions, then verify with Z3; NLI only for the residual that cannot be
   closed but is still prose-supported.
4. **Answer relevance and completeness** — does the answer answer this
   question, with all required parts, under the recorded assumptions?

The expected outcome is not “formal verification replaces NLI.” It is a
**deterministic decision procedure for closed claims**, with explicit
specification receipts, and a measured fallback for the rest.

### Implementation status (2026-11-04)

| Phase | Status | Evidence |
|---|---|---|
| 0 — scope/vocabulary | complete | `Unresolved`, `SpecEntry`, `Assumption`, `CoverageReceipt`, new verdicts |
| 1 — spec IR and verdicts | complete | `formal/spec.py`, `NEEDS_SPECIFICATION`, `ENTAILED_UNDER_ASSUMPTIONS` |
| 1.5 — presentation + `ask` bridge | complete | humanized assumptions in the answer; `ask --formal-cmd` prints answer, assumptions, evidence quotes, verdict, spec receipt |
| 1.6 — citation gate in formal path | complete | `ask --formal --corpus` gates every displayed quote; ungated quotes are labeled; fabricated quotes rejected |
| 2 — deterministic registry | partial | defaults + user overrides for quantifier, metric, utility, direction, unit |
| 2.5 — independent competitive benchmark | partial | `formal/competitive.py` + frozen public claim fixture + detector score format; HHEM/MiniCheck/LettuceDetect runs pending |
| 3 — prose extraction | partial | `formal/extract.py`: reader-first baseline for lookup, difference, sum, compare, extremum, count, quantified, rank; unsupported questions explicit |
| 4 — closed-corpus absence | partial | `formal/coverage.py`: declared corpus index, coverage receipt, `NOT_FOUND_IN_CORPUS`; seeded-mention tests; API language guard pending |
| 5 — router/NLI/integration | partial | `formal/router.py` + `formal/nli.py`: deterministic route and command-based fallback; real detector wiring pending |
| 5.5 — productionization | partial | `config --formal-cmd` seals the verifier in the workspace; batch/API/observability pending |
| 6 — evaluation/report | not started | — |

Current test evidence: **79 Python tests** (17 original + 21 spec-layer +
18 reader-first extraction + 5 closed-corpus absence + 6 competitive harness +
6 router + 6 NLI fallback) and **213 kit tests** pass; the EPIC-FORMAL-001
100-question and dev-14 results are unchanged (59 `ENTAILED`, 40
`ABSENT_CONFIRMED`, 1 `UNKNOWN`, 0 false `ENTAILED`). The default `ask` path is
unchanged; the formal path is opt-in.

---

## 1. Context and evidence

### 1.1 What EPIC-FORMAL-001 established

- Python-only prototype under `bench/formal/`; `z3-solver` in a local venv; no
  Node, no model calls, no default reader/judge changes.
- Typed IR for question, answer, citation, absence, and partial.
- Deterministic compilers for lookup, comparison, difference, sum, max/min,
  count/filter, absence, and partial.
- Z3 three-valued entailment: `ENTAILED`, `CONTRADICTION`, `UNKNOWN`; plus
  structural `INCOMPLETE`, schema `ABSENT_CONFIRMED`, and
  `NOT_FORMALIZABLE`.
- Results on the current 100 development set:
  - 40 value questions formalized (the 30–50 target).
  - 40 absence + 20 partial questions compiled.
  - 100/100 compile to IR; 0 `NOT_FORMALIZABLE`.
  - 59 `ENTAILED`, 40 `ABSENT_CONFIRMED`, 1 `UNKNOWN` (top-coded test-095).
  - 100/100 canonical answer agreement with the evaluation labels
    (compiler/table consistency, not independent proof; labels read only for
    aggregate scoring and not reproduced).
  - 0 false `ENTAILED` on 17 known-row cases and 91 mutations.
  - Deterministic rerun; ~0.9 ms per structured question.
  - Caveat: the current 100 is post-correction and development-informed, not
    held out. The 300-question clean set is a separate plan (`PLAN.md`) and is
    out of scope for this epic.
- Key semantic findings:
  - The benchmark’s `difference` is **symmetric** (`|a − b|`); a directional
    reading is a separate claim and can be contradicted.
  - Physicians pay is **top-coded**: `>= 239,200`, not `= 239,200`.
  - Filter boundaries matter: `growth > 4%` excludes a row at exactly 4%.
  - True-but-irrelevant claims (e.g. a dropped filter) must be `INCOMPLETE`,
    not `ENTAILED`.
  - Schema absence is closed-world over the snapshot, never open-world.

### 1.2 What EPIC-FORMAL-001 did not establish

- General prose claim verification.
- Open-world absence.
- Causal, normative, or evaluative claims.
- Automatic claim extraction from free-form answers.
- Resolution of ambiguous quantifiers, metrics, scopes, units, or direction.
- Any claim that formal verification is a general NLI replacement.

### 1.3 Why the next step is specification, not more NLI

NLI is useful for prose-to-prose support. It is weak at arithmetic, candidate-set
completeness, filters, absence, top-coded bounds, direction, and units. Using it
as a “net” for calculated claims creates a false sense of safety.

The real gap is that many claims are not **closed**:

- “Most” has no threshold.
- “Stable” has no metric.
- “Best” has no utility function.
- “Because” has no causal model.
- “Fair” has no normative theory.
- “Not mentioned” has no declared corpus and coverage proof.

The right response is to make the missing parameter explicit, not to guess it or
to score the prose with a probabilistic model. That is the specification layer.

### 1.4 Discussion record — what we considered

The epic grew out of a four-layer discussion. The important moves:

1. **Start from three levels.** The original framing was answer → claim →
   citation.
2. **Refine to four layers.** Citation authenticity, fact mapping/claim
   extraction, claim entailment, and answer relevance/completeness.
3. **Correct the ownership.** Formal verification is strongest at level 2
   (the claim), not level 3 (the citation). The existing mechanical gate owns
   citation authenticity. Formal verification owns the inference from a mapped
   fact to the claim.
4. **Separate the tools.** Gate = quote exists; mapping = quote belongs to the
   right row/field; formal = premise entails claim; NLI = prose-to-prose
   support; human = normative/causal/contested judgment.
5. **Accept the key insight from the design discussion.** Ambiguity should be a
   deterministic flag that says “I need context or a definition,” not a reason
   to guess or to hand the claim to NLI.
6. **Add the refinement.** Detection of ambiguity can be deterministic;
   resolution is a specification step. The transformation from ambiguous prose
   to hard facts is not an inference from the corpus — it is a stipulation that
   must be recorded.
7. **Separate facts from preferences.** “Most” can become a fact under a
   quantifier policy. “Best” becomes a ranking under a utility function. Both
   can be deterministic, but they are different epistemic objects.
8. **Separate verification from coverage.** Open-world absence is not a logic
   problem; it is a corpus-completeness problem. Covering all four layers does
   not make “does not exist” provable.

### 1.5 Alternatives considered and why they were rejected

| Alternative | Why rejected |
|---|---|
| Use NLI as the main verifier for level 2 | Weak at arithmetic, aggregation, filters, absence, direction, units; no deterministic receipt |
| Let the system auto-resolve ambiguity with hidden defaults | Produces formal-looking assumptions; violates auditability; can create false `ENTAILED` |
| Treat all prose as formalizable | Ignores expressiveness; causal, normative, and evaluative claims have no formal theory in the corpus |
| Treat absence as entailment | Confuses “not in the snapshot” with “does not exist”; open-world absence is not provable |
| Use only an LLM for verification | Probabilistic, non-deterministic, no exact receipt, hard to audit |
| Use only formal verification | Cannot handle prose extraction, open-world absence, or claims outside the schema |
| Use only human review | Too slow and costly for every claim; does not scale to benchmark-sized runs |
| Make the formal layer the default | Changes default behavior before the spec layer and validation exist; violates the current constraint |

### 1.6 Why this path

The path is deliberately staged:

- **First**, make ambiguity a typed state and close the IR explicitly. This is
  the smallest change that removes hidden assumptions. (Phase 1, done.)
- **Second**, close the credibility gap: the formal path must gate its citations
  before it presents quotes as verified. (Phase 1.6, next.)
- **Third**, measure against the market on the same claims: HHEM, MiniCheck,
  LettuceDetect, and the formal verifier. Do not claim superiority without a
  category breakdown. (Phase 2.5.)
- **Fourth**, add a versioned spec registry so definitions are reusable and
  auditable. (Phase 2, partial.)
- **Fifth**, add prose extraction as a separate, measured component. Do not
  conflate extraction errors with verification errors. (Phase 3.)
- **Sixth**, add closed-corpus absence with coverage receipts. Do not claim
  open-world absence. (Phase 4.)
- **Seventh**, route only the residual to NLI/human and productionize the
  bridge. Keep formal as the deterministic gate for closed claims. (Phases 5
  and 5.5.)

This preserves the EPIC-FORMAL-001 safety property — no false `ENTAILED` from an
unclosed or ambiguous claim — while extending coverage in a way that remains
auditable.

### 1.7 Market context and competitive assessment

This section records the external research and the honest positioning. The short
version: the **combination** is differentiated; the system is not broadly
superior to the market, and the certainty is conditional on the structured
premises and the specification.

#### 1.7.1 What is genuinely differentiated

1. **Deterministic verdicts, not probabilities.** HHEM returns a calibrated
   0–1 factual-consistency score; MiniCheck returns a support probability; Luna
   returns a hallucination score; LettuceDetect returns span-level flags. We
   return `ENTAILED`, `CONTRADICTION`, `UNKNOWN`, `INCOMPLETE`,
   `NEEDS_SPECIFICATION`, with a witness/counterexample and a spec receipt.
2. **Calculated claims are first-class.** Difference, sum, max/min, count/filter,
   candidate-set completeness, and top-coded bounds are verified directly.
   MiniCheck is sentence-level and recommends splitting multi-sentence claims;
   LettuceDetect localizes spans but is not a calculator.
3. **Ambiguity is explicit.** `most = majority (>50%)` is visible in the answer
   and in the receipt. `NEEDS_SPECIFICATION` asks for the definition instead of
   guessing.
4. **Closed-world absence is handled honestly.** We distinguish “not in this
   snapshot” from “does not exist.” Many RAG tools blur “not in the retrieved
   context” with “not found.”
5. **Quote-to-fact mapping is stronger than a quote gate.** The gate proves a
   quote exists; we map it to a row/field and prove the claim from that field.
6. **The structured path is extremely cheap.** ~0.9 ms per question, no model
   call. HHEM, Luna, MiniCheck, and LettuceDetect require model inference.
7. **The adversarial suite is real.** 108 negative/mutation checks, 0 false
   `ENTAILED`, including wrong values, wrong winners, wrong direction, dropped
   filters, overclaims, and top-coded exact values.

#### 1.7.2 Competitive landscape

| Category | Examples | What they do well | Where we differ |
|---|---|---|---|
| Calibrated factual consistency | Vectara HHEM | 0–1 score, multilingual, platform integration | We give logical verdicts and receipts; they give probability |
| Fast RAG guardrails | Galileo Luna | DeBERTa-large, very low cost/latency vs GPT-3.5 | We verify arithmetic/aggregation; they score grounding |
| Sentence-level fact-checking | MiniCheck / Bespoke-MiniCheck | Strong on LLM-AggreFact, cheap, Ollama/Guardrails | We handle calculations and candidate sets; they do prose support |
| Span-level detection | LettuceDetect | Exact spans, multilingual, code/tool, MIT | We give claim-level proof; they give localization |
| Hallucination detection | Patronus Lynx | Open hallucination detection | Similar probabilistic category |
| Cloud guardrails | Bedrock, Azure, Vertex | Groundedness checks inside cloud stacks | We are deterministic and schema-aware; they are platform features |
| Neurosymbolic research | Logic-LM, LINC, SymBa | LLM → symbolic solver, strong logical reasoning | We are product-shaped, closed-schema, with receipts; they are research prototypes |
| Formal methods | Z3, Dafny, Lean, Coq, Imandra | Proofs for code/models | They do not verify natural-language claims |

The closest **research** neighbors are Logic-LM, LINC, and SymBa. The closest
**product** neighbors are HHEM, Luna, MiniCheck, LettuceDetect, and the cloud
guardrails. None of them, as far as we can tell, combine deterministic
arithmetic/aggregation verification, explicit specification receipts,
closed-world absence, and quote evidence in the way we do. That is a real niche.

#### 1.7.3 Where we lack compared with the market

| Gap | Why it matters |
|---|---|
| **Generality** | We are OOH-specific: 48 rows, one schema, hand-written parser patterns. The 0% `NOT_FORMALIZABLE` rate is a property of the benchmark, not a general capability. |
| **Prose claim extraction** | We verify typed claims; we do not parse arbitrary model answers. Competitors ingest raw answer text. This is the biggest product gap. |
| **Production readiness** | We have a CLI, a `spawnSync` bridge, and a 100-question benchmark. No API, SDK, batch, streaming, observability, multi-tenancy, retries, or LangChain/LlamaIndex/Guardrails integrations. |
| **Citation gate in the formal path** | `ask --formal` prints quotes from the structured rows but does **not** run the existing mechanical gate on those quotes. This is a credibility gap. |
| **Independent evaluation** | The 100/100 agreement is partly circular: the canonical answer is derived from the same table used as premises. No head-to-head against HHEM, MiniCheck, LettuceDetect, or Luna on the same claims. |
| **Claim language coverage** | No causal, normative, temporal, counterfactual, conditional, “except,” “top 5,” “between,” trends, correlations, or multi-hop synthesis. |
| **Specification UX** | `stability = 1×projected growth + 0.0001×employment change + 0.0001×annual openings` is explicit but not meaningful. It is an illustrative default with arbitrary weights. |
| **Span-level localization** | We give claim-level verdicts; LettuceDetect gives exact character spans, which is better for editing/repair UX. |
| **Multilingual and code/tool coverage** | HHEM and LettuceDetect support multiple languages; LettuceDetect v2 covers code, tool output, and agentic workflows. We are English-only and table-only. |
| **Calibrated uncertainty** | Our `UNKNOWN` is logical, not probabilistic. For ambiguous prose, a calibrated score may be more useful than a hard `UNKNOWN`. |
| **Security and governance** | No prompt-injection handling, PII policy, data governance, audit log beyond the spec hash, or threat model. |

#### 1.7.4 Implications for the plan

The critique changes the priority order:

1. **Close the citation-gate gap first.** The formal path must either run the
   existing gate on every displayed quote or label the quotes as ungated
   structured-source quotes. A verification harness cannot show unverified
   quotes as if they were verified.
2. **Run an independent head-to-head benchmark** against HHEM, MiniCheck, and
   LettuceDetect on the same claims: lookup, arithmetic, aggregation, filter,
   absence, top-coded. Report where each fails.
3. **Build prose claim extraction** and measure precision/recall/hole detection.
   Without it, we are a verifier for a benchmark, not a general product.
4. **Add closed-corpus absence with coverage receipts.** Keep the open-world
   refusal.
5. **Improve the spec UX.** Named metrics, user weights, “illustrative default”
   warnings, and counterexample rows for `CONTRADICTION`.
6. **Productionize the bridge.** Config file, batch mode, API, observability,
   integrations.
7. **Add a second schema/domain.** If it only works on OOH, it is a demo; if it
   works on a second structured corpus, it is a platform.

The positioning is not “better than MiniCheck/HHEM.” It is **a deterministic
verifier for closed structured claims that NLI cannot do**, used alongside
probabilistic detectors rather than instead of them.

#### 1.7.5 Sources

- Vectara HHEM / factual consistency score: <https://docs.vectara.com/docs/hallucination-and-evaluation/hallucination-evaluation>
- MiniCheck (EMNLP 2024): <https://github.com/Liyan06/MiniCheck>
- LettuceDetect: <https://github.com/KRLabsOrg/LettuceDetect>
- Luna (COLING 2025): <https://aclanthology.org/2025.coling-industry.34/>
- Logic-LM (EMNLP 2023 Findings): <https://arxiv.org/abs/2305.12295>
- LINC (EMNLP 2023 Outstanding): <https://arxiv.org/abs/2310.15164>
- SymBa (symbolic backward chaining): <https://arxiv.org/abs/2402.12806>
- Patronus Lynx and cloud guardrails (Bedrock/Azure/Vertex) are adjacent
  commercial categories; their exact current capabilities should be re-checked
  before any public comparison.

Research snapshot: **2026-11-04**. Re-check model versions and product
capabilities before a public comparison; this is a positioning map, not a
frozen leaderboard.

---

## 2. Problem statement

### 2.1 The four layers

| Layer | Question | Current owner |
|---|---|---|
| 1. Citation authenticity | Is the quote really in the document? | Existing mechanical gate |
| 2. Fact mapping / claim extraction | Which row/field does the quote represent? What atomic claim does the prose express? | Deterministic mapping for structured; missing for prose |
| 3. Claim entailment | Does the premise entail the claim? | Z3 for structured; NLI for prose (weak) |
| 4. Answer relevance / completeness | Does the answer answer this question, with all parts? | Partial structural check; missing for intent |

### 2.2 The three independent gaps

These are often conflated. They are different axes:

1. **Expressiveness** — can the claim be written in a formal language at all?
2. **Coverage** — is the corpus complete enough to support an absence claim?
3. **Specification** — are the quantifiers, metrics, scopes, units, and
   preferences defined?

Covering all four layers does not automatically solve expressiveness or
coverage. It solves verification *given* a closed claim and a declared corpus.

### 2.3 What “ambiguity” means here

We distinguish four kinds:

| Kind | Example | Deterministic response |
|---|---|---|
| Ambiguity | “bank” (river vs finance) | `NEEDS_SPECIFICATION(sense)` |
| Underspecification | “most” without a threshold | `NEEDS_SPECIFICATION(quantifier_policy)` |
| Vagueness | “stable”, “fair” | `NEEDS_SPECIFICATION(metric_or_theory)` |
| Open-world absence | “not mentioned anywhere” | `NEEDS_SPECIFICATION(corpus_scope)` |

The flag is deterministic because the IR has an **unresolved slot**. The
resolution is a separate specification step.

### 2.4 Worked examples

#### “Most occupations with a bachelor’s degree pay more than $60,000.”

- Ambiguity: “most” has no threshold.
- Resolution: `most = >50%` (or `plurality`, or a user threshold).
- Closed claim:
  `count(paid ∧ education=bachelor's ∧ pay>60000) > 0.5 × count(paid ∧ education=bachelor's)`.
- Verdict: `ENTAILED` or `CONTRADICTION` under the recorded policy.
- This is a **fact under a definition**. The definition is not discovered; it is
  stipulated and recorded.

#### “This is the best career for someone who wants stability.”

- Ambiguity: “stability” has no metric; “best” has no utility function.
- Resolution: a metric (e.g. projected growth, employment change, openings) and
  weights supplied by the requester or a registered default.
- Closed claim: `argmax(stability_score, all) = X`.
- Verdict: `ENTAILED_UNDER_ASSUMPTIONS` with the metric and weights in the
  receipt.
- This is a **ranking under a preference**, not an objective fact about the
  world. The answer must say so.

#### “Electricians earn more than carpenters because of unionization.”

- Ambiguity: the comparison is formalizable; the causal claim is not in the
  snapshot.
- Resolution: a causal model plus external data, or an explicit refusal.
- Verdict: the comparison can be `ENTAILED`; the causal claim is
  `NEEDS_SPECIFICATION(causal_model)` or `NOT_FORMALIZABLE`.
- This is a **model-relative** claim, not a table lookup.

#### “The policy is fair.”

- Ambiguity: normative theory.
- Resolution: a stipulated theory of fairness, or human judgment.
- Verdict: `NEEDS_SPECIFICATION(normative_theory)`; formal verification can
  check implications of the stipulated theory, not “fairness” itself.

#### “No source anywhere states New York City pay.”

- Ambiguity: corpus scope and completeness.
- Resolution: declare the corpus `C`, index it exhaustively, and search.
- Verdict: `NOT_FOUND_IN_CORPUS(C)` with a coverage receipt.
- Never: “does not exist.” Open-world absence is not provable without a
  complete world model.

---

## 3. Design position

### 3.1 Detection is deterministic; resolution is a specification step

The compiler must never guess. If a required parameter is missing, it returns
`NEEDS_SPECIFICATION` with:

- the unresolved symbol,
- the kind of parameter needed,
- the allowed resolution modes,
- the default (if any), and whether the default was used.

Resolution comes from one of:

- a user-provided definition,
- a registered policy in the spec registry,
- a retrieved context document,
- an explicit “I don’t know; ask the user” state.

### 3.2 No unclosed term is ever verified

The formal layer accepts only a **closed IR**: every quantifier, metric, scope,
unit, direction, and model slot is filled. An unclosed term is a compile error,
not an `ENTAILED`.

This is the single most important safety rule. It prevents the system from
turning an assumption into a formal-looking fact.

### 3.3 Verdicts are conditional and carry receipts

Every accepting verdict must carry a **specification receipt**:

- the definitions used,
- their source (user, registry, default, retrieved context),
- a hash/version of the spec,
- the claim IR,
- the premises used,
- the Z3 result.

The receipt makes the assumption auditable. `ENTAILED_UNDER_ASSUMPTIONS` is a
first-class verdict, not a footnote.

### 3.4 NLI is a fallback, not a net for arithmetic

- Formal is the authority for closed structured claims.
- NLI is for prose claims that cannot be closed but are still supported by
  prose evidence.
- NLI must never override a formal `CONTRADICTION` on a closed claim.
- NLI must never be used to certify a calculated claim.

### 3.5 Closed-world and open-world language

- `ABSENT_CONFIRMED` means “not present in the declared snapshot/schema.”
- `NOT_FOUND_IN_CORPUS` means “not found in corpus C after an exhaustive,
  recorded search.”
- Neither means “does not exist in the world.”
- Open-world absence remains out of scope and must be labeled as such.

---

## 4. Target architecture

### 4.1 Layer 1 — citation authenticity

Keep the existing mechanical gate:

- quote exists in the claimed document (exact or tolerant),
- title matches,
- date matches where claimed,
- multi-leg citations all verify.

No change to default gate behavior in this epic. The formal layer consumes
verified citations; it does not replace this check.

### 4.2 Layer 2 — fact mapping and claim extraction

Two paths:

- **Structured path:** quote → row/field, as in EPIC-FORMAL-001. Deterministic.
- **Prose path:** prose → atomic claims with explicit holes. Probabilistic
  extractor (rules, LLM, or hybrid), but the output is a typed partial IR, not
  free text.

The extractor must emit:

- atomic claims,
- entity/quantity/date/unit normalization,
- explicit unresolved slots,
- provenance spans,
- a confidence per claim.

The formal layer treats extractor output as untrusted input. It only verifies
closed claims.

### 4.3 Specification layer (new)

A `Spec` object supplies definitions for unresolved slots:

```
Spec:
  quantifiers:   most -> majority(>50%) | plurality | threshold(n)
  metrics:       stability -> weighted(growth, jobs, openings)
  utilities:     best -> weights + ranking rule
  scope:         corpus -> declared corpus id + coverage receipt
  units:         pay -> annual | hourly
  direction:     difference -> symmetric | signed
  models:        causal -> model id; normative -> theory id
  defaults:      registry version + whether a default was used
```

The spec registry is versioned. A verdict records the spec id and hash.

### 4.4 Layer 3 — claim entailment

- **Closed structured claim** → Z3, as in EPIC-FORMAL-001.
- **Closed prose claim that maps to structured premises** → Z3.
- **Prose claim that cannot be closed but has prose evidence** → NLI, with a
  separate verdict and confidence.
- **No formal theory** → `NOT_FORMALIZABLE`.

### 4.5 Layer 4 — answer relevance and completeness

Extend the existing structural check:

- all required parts present,
- no extra irrelevant parts,
- correct candidate set and filter,
- answer addresses the question’s field/entity/scope,
- assumptions are disclosed,
- the answer’s prose does not assert more than the verified claims.

For free prose, use NLI/human for relevance, but keep the formal verdict on the
typed claims.

### 4.6 Router and fallback

```
question
  → parse / retrieve
  → claim extraction (partial IR)
  → specification (close holes)
  → formal verification
       ENTAILED / ENTAILED_UNDER_ASSUMPTIONS / CONTRADICTION
       UNKNOWN / INCOMPLETE / NEEDS_SPECIFICATION / NOT_FORMALIZABLE
  → NLI only for the residual prose-supported claims
  → human only for normative/causal/contested claims
```

The router is deterministic given the verdict. It does not silently escalate an
`ENTAILED` to NLI or vice versa.

### 4.7 Data model additions

Add to `bench/formal/formal/model.py` (or a successor package):

- `Spec`: definitions, source, version, hash.
- `Unresolved`: symbol, kind, allowed modes, default, used_default.
- `Assumption`: spec entry + provenance.
- `CoverageReceipt`: corpus id, files searched, index version, query, hits,
  exclusions, timestamp/hash.
- `ClaimGraph`: atomic claims with dependencies (for multi-hop).
- `Verdict`: add `NEEDS_SPECIFICATION`, `ENTAILED_UNDER_ASSUMPTIONS`,
  `NOT_FOUND_IN_CORPUS`.
- `AnswerIR`: add `assumptions`, `spec_id`, `coverage_receipts`.

### 4.8 Verdict vocabulary

| Verdict | Meaning |
|---|---|
| `ENTAILED` | Closed claim follows from premises with no extra assumptions |
| `ENTAILED_UNDER_ASSUMPTIONS` | Follows under the recorded spec |
| `CONTRADICTION` | Closed claim is inconsistent with premises |
| `UNKNOWN` | Premises insufficient even after closure |
| `INCOMPLETE` | Missing part, overclaim, or structurally irrelevant claim |
| `NEEDS_SPECIFICATION` | Unresolved slot; no verification attempted |
| `NOT_FORMALIZABLE` | No formal theory for the claim |
| `NOT_FOUND_IN_CORPUS` | Exhaustive search of declared corpus C found nothing |

`ABSENT_CONFIRMED` remains for schema-level absence in the structured snapshot.

### 4.9 Specification registry

Initial registry contents:

- **Quantifiers:** `most` = majority (>50%) default; plurality; user threshold.
- **Metrics:** `stability` = configurable weighted combination of projected
  growth, employment change, and annual openings; weights required or defaulted
  with disclosure.
- **Utilities:** `best` = argmax under a named metric and weights.
- **Scope:** declared corpus id; snapshot id; page set.
- **Units:** annual vs hourly pay; percent vs percentage points; jobs vs
  openings.
- **Direction:** symmetric vs signed difference; “more than” direction.
- **Models:** causal model id; normative theory id; explicitly “none.”
- **Defaults:** versioned; every default use is recorded.

---

## 5. Work breakdown

### Phase 0 — Scope freeze and vocabulary

Deliverables:

- Freeze the verdict vocabulary and the `Spec`/`Unresolved` schema.
- Freeze the initial spec registry entries and their defaults.
- Define the “closed term” rule and the `NEEDS_SPECIFICATION` payload.
- Write the ambiguity taxonomy and the acceptance tests.
- Confirm no default reader/judge changes; feature flag off by default.

Exit criteria:

- Reviewed schema and vocabulary.
- No open questions about what counts as closed.
- Test fixtures for the worked examples exist.

### Phase 1 — Spec IR and verdicts

Deliverables:

- `Spec`, `Unresolved`, `Assumption`, `CoverageReceipt` in the IR.
- `NEEDS_SPECIFICATION` and `ENTAILED_UNDER_ASSUMPTIONS` verdicts.
- Compiler rejects unclosed terms with a typed payload.
- Receipt serialization and hashing.

Exit criteria:

- An unclosed “most” claim returns `NEEDS_SPECIFICATION`, not `ENTAILED`.
- A closed “most = >50%” claim verifies with a receipt.
- A default use is visible in the receipt.

### Phase 1.5 — Presentation and `ask` bridge (complete)

Deliverables:

- Human-readable assumption rendering (`most = majority (>50%)`, metric formulas,
  direction, unit, utility).
- The assumption is stated inside the answer sentence, not only in a receipt.
- `ask --formal-cmd` bridge with JSON stdin/stdout; default `ask` unchanged.
- Evidence quotes, assumptions, verdict, and spec id in the human output.
- `--no-defaults` forwarded; unresolved claims print `NEEDS_SPECIFICATION`.

Exit criteria:

- The output shows the answer, the assumption, the evidence quotes, and the
  verdict.
- The formal path makes no model call.
- The default `ask` path is unchanged when the flag is absent.

### Phase 1.6 — Citation gate integration for the formal path

Status: **complete**. `ask --formal --corpus <dir>` now gates every displayed
quote with the existing mechanical verifier; quotes without a corpus are labeled
`gate: ungated`; fabricated quotes are rejected. Tests cover verified, rejected,
and ungated paths.

Deliverables:

- Every citation displayed by `ask --formal` either passes the existing
  mechanical gate or is explicitly labeled “ungated structured-source quote.”
- The bridge verifies quote existence against the corpus pages, not only the
  structured JSON.
- Fabricated-quote tests: a fake quote must be rejected; a real quote must be
  accepted; JSON carries the gate status.
- The formal path’s evidence block distinguishes gate-verified page quotes from
  structured-row quotes.

Exit criteria:

- No unverified quote is shown as if it were gate-verified.
- A fabricated quote cannot reach the human output.
- Default `ask` gate behavior is unchanged.

### Phase 2 — Deterministic spec registry

Deliverables:

- Registry for quantifiers, metrics, utilities, scope, units, direction.
- Deterministic resolution for registered definitions.
- “No default” mode that always asks for specification.
- Tests for “most”, “stability”, “best”, direction, units, top-coded values.

Exit criteria:

- Same input + same spec → identical verdict and receipt.
- Different spec → different verdict where expected, with the difference
  visible.
- No hidden default: every default is recorded.

### Phase 2.5 — Independent competitive benchmark

Status: **partial**. `formal/competitive.py` loads a frozen claim set and
detector score files, runs the formal verifier and the detectors on the same
claims, and reports binary/exact accuracy, false accepts, false rejects,
coverage, and per-category results. `competitive/` contains a public OOH fixture
and an NLI-style score file. Real HHEM/MiniCheck/LettuceDetect runs are pending;
the harness does not call a model.

Deliverables:

- A claim-level benchmark shared by the formal verifier, HHEM, MiniCheck, and
  LettuceDetect.
- Claim categories: lookup, arithmetic, aggregation, filter, absence, top-coded,
  and a prose-only control.
- Report precision/recall, false accepts, `UNKNOWN`/`NEEDS_SPECIFICATION` rates,
  latency, and cost.
- A written “where each fails” analysis, not a single leaderboard number.

Exit criteria:

- The comparison is reproducible and uses the same claims and labels.
- We do not claim general superiority; we report the structured-claim subset
  where the formal path wins and the prose/open-world subset where it does not.
- Any public claim names the corpus, schema, and evaluation set.

### Phase 3 — Prose claim extraction interface

Status: **partial**. `formal/extract.py` now provides the reader-first baseline:
`RuleBasedExtractor` turns a reader answer into typed claims for lookup,
difference, sum, compare, extremum, count, quantified and rank, with spans;
`verify_reader_answer` closes the loop through the formal verifier. Unsupported
question types are explicit.

Deliverables:

- `ClaimExtractor` interface: prose → partial IR + spans + confidence. (baseline)
- Rule-based baseline for the OOH prose templates. (baseline: lookup, difference,
  sum, compare, extremum, count, quantified, rank)
- Optional LLM extractor behind a flag; cached fixtures for tests.
- Evaluation set of prose answers with atomic-claim annotations.
- Hole detection: every unresolved quantifier/metric/scope is flagged.
- Comparison and extremum extraction, multi-claim answers, and negation/hedging
  handling.

Exit criteria:

- Extractor never emits a closed claim when a required slot is missing.
- Measured precision/recall on the annotated sample.
- Formal layer accepts only closed extractor output.
- The reader-first path (`reader → extractor → verifier`) is the product path;
  `ask --formal` remains a demo/debug path.

### Phase 4 — Closed-corpus absence

Status: **partial**. `formal/coverage.py` provides a declared corpus index,
exhaustive phrase search, a `CoverageReceipt`, and `NOT_FOUND_IN_CORPUS`.
`check_answer` consumes a matching receipt and returns `NEEDS_SPECIFICATION`
without one. Seeded-mention tests confirm a known mention is not reported
absent. The API-level “never say does not exist” language guard is still
pending.

Deliverables:

- Declared corpus id and exhaustive search procedure.
- `CoverageReceipt` with files searched, index version, query, hits, exclusions.
- `NOT_FOUND_IN_CORPUS` verdict.
- Seeded-mention tests: a known mention must not be reported absent.
- Language guard: never “does not exist.”

Exit criteria:

- 100% of absence verdicts carry a coverage receipt.
- 0 false “not found” on seeded mentions.
- Open-world absence is rejected at the API boundary.

### Phase 5 — Router, NLI fallback, integration

Status: **partial**. `formal/router.py` maps verdicts to deterministic actions:
show, reject, ask_specification, fallback_nli, escalate_human, abstain. The
`ask --formal` output includes the route. `formal/nli.py` provides a
command-based `CommandNLI` fallback (JSON stdin/stdout) and a `StubNLI` for
tests; `formal.cli --nli-cmd` executes it for `NOT_FORMALIZABLE` claims. Real
detector wiring into `ask --formal` is still pending.

Deliverables:

- Deterministic router: formal → NLI → human.
- NLI only for `NOT_FORMALIZABLE` or prose-residual claims.
- Feature flag; default behavior unchanged.
- Integration tests with the existing gate and reader.
- Rollback path.

Exit criteria:

- Formal `CONTRADICTION` cannot be overridden by NLI.
- NLI never certifies a calculated claim.
- Default run is byte-identical when the flag is off.

### Phase 5.5 — Productionization

Status: **partial**. `retrieval-kit config --formal-cmd <cmd>` seals the formal
verifier command in the workspace; `ask --formal` uses it without a long flag.
The command still spawns a process per question. Batch/API/observability are
pending.

Deliverables:

- Formal verifier configured in the workspace/config, not a long
  `--formal-cmd` string.
- Batch mode and an API/SDK boundary; no per-question process spawn in the hot
  path.
- Observability: verdict counts, `NEEDS_SPECIFICATION` reasons, gate failures,
  latency, spec ids.
- Integration with the existing gate, absence, and reader paths.
- Security/governance checklist: prompt injection, PII, data residency, audit
  retention, and a threat model.

Exit criteria:

- A user can run the formal path without knowing the Python package path.
- Batch and single-question paths produce the same receipts.
- No default behavior change when the feature is off.

### Phase 6 — Evaluation and report

Deliverables:

- Regression against EPIC-FORMAL-001 (100 + dev).
- Ambiguity/spec suite results.
- Prose extraction results.
- Closed-corpus absence results.
- Runtime and determinism report.
- Recommendation: primary formal subset vs fallback-only complement.

Exit criteria:

- All acceptance criteria in §6 met.
- Report written; no private labels published.
- No commit/integration without explicit approval.

---

## 6. Expectations and acceptance criteria

### Functional

- 100% of supported structured questions compile to closed IR or a typed
  `NEEDS_SPECIFICATION`; no silent guess.
- Every `ENTAILED` or `ENTAILED_UNDER_ASSUMPTIONS` verdict carries a receipt
  with the claim, premises, spec id/hash, and verdict.
- Every `NEEDS_SPECIFICATION` names the unresolved symbol and the allowed
  resolution modes.
- Every `NOT_FOUND_IN_CORPUS` carries a coverage receipt.
- `NOT_FORMALIZABLE` is explicit and never treated as a negative answer.
- Every quote displayed by the formal path is either gate-verified against the
  corpus page or explicitly labeled “ungated structured-source quote.”

### Safety

- 0 false `ENTAILED` on the EPIC-FORMAL-001 adversarial set (17 cases, 91
  mutations).
- 0 false `ENTAILED` on the new ambiguity/spec suite.
- No open-world absence claim can be emitted.
- No NLI override of a formal `CONTRADICTION` on a closed claim.
- No hidden default: a default that changes a verdict is recorded.
- A fabricated quote cannot reach the formal human output.
- The formal path does not present ungated quotes as verified.

### Determinism

- Same question + same corpus + same spec → identical verdict, receipt, and
  canonical answer.
- The deterministic test suite makes no live model calls.
- Prose extractor tests use fixtures or a stub; live extraction is a separate,
  measured run.

### Performance

- Structured verification remains in the low-millisecond range per question.
- Spec resolution and receipt serialization add bounded overhead.
- Prose extraction has its own budget and is not on the deterministic hot path.

### Integration

- Feature flag off by default.
- No change to the default reader or default judge.
- Existing gate behavior unchanged.
- The formal path reuses the existing gate rather than inventing a parallel
  citation check.
- `PLAN.md` untouched; no 300-question run in this epic.
- No private labels or per-question private outputs published.

### Quality targets (provisional; calibrate in Phase 0)

- Ambiguity suite: 100% typed flags, 0 false `ENTAILED`.
- Prose extraction: ≥95% precision on closed claims, ≥90% recall on atomic
  claims, 100% hole detection on the annotated sample.
- Closed-corpus absence: 100% coverage receipts, 0 false “not found” on seeded
  mentions.
- Human audit: ≥90% agreement that `ENTAILED_UNDER_ASSUMPTIONS` receipts are
  faithful to the stated definitions.
- Citation gate: 100% of displayed quotes are gate-verified or labeled ungated;
  0 fabricated quotes reach the human output.
- Competitive benchmark: a reproducible head-to-head on the same claims, with a
  written “where each fails” analysis; no general-superiority claim.

---

## 7. Validation plan

### 7.1 Unit and golden tests

- IR construction and serialization.
- `Spec`/`Unresolved`/`Assumption` round-trip.
- Verdict transitions for every pair of claim/spec states.
- Golden tests for “most”, “stability”, “best”, direction, units, top-coded
  values, N/A rows.
- Receipt hash stability.

### 7.2 Ambiguity and specification tests

- “Most” without a policy → `NEEDS_SPECIFICATION`.
- “Most = >50%” → `ENTAILED`/`CONTRADICTION` with receipt.
- “Stability” without a metric → `NEEDS_SPECIFICATION`.
- “Stability = weighted(...)” → ranking with receipt.
- “Best” without a utility → `NEEDS_SPECIFICATION`.
- “Best under utility U” → `ENTAILED_UNDER_ASSUMPTIONS`.
- “Difference” without direction → policy required; signed vs symmetric
  produce different verdicts.
- “Pay” without annual/hourly → policy required.
- Causal claim → `NEEDS_SPECIFICATION(causal_model)` or
  `NOT_FORMALIZABLE`.
- Normative claim → `NEEDS_SPECIFICATION(normative_theory)`.
- Open-world absence → rejected; only `NOT_FOUND_IN_CORPUS(C)`.

### 7.3 Negative and adversarial tests

- Wrong value, wrong winner, wrong operand, wrong direction.
- Dropped filter, incomplete candidate set, extra irrelevant part.
- Overclaim of an absent part.
- Exact value for a top-coded lower bound.
- Unclosed claim masquerading as closed.
- Default spec used without disclosure.
- NLI attempt to override a formal contradiction.
- Open-world absence attempt.

Success: 0 false `ENTAILED`; every failure has the expected typed verdict.

### 7.4 Prose extraction evaluation

- Annotated sample of prose answers: atomic claims, spans, holes.
- Metrics: claim precision/recall, hole recall, span alignment, confidence
  calibration.
- Error analysis: decomposition errors, entity/unit normalization errors,
  missed holes, false closure.
- The formal verifier is evaluated separately on the extractor’s closed output;
  do not conflate extraction errors with verification errors.

### 7.5 Closed-corpus absence validation

- Declare corpus C and build an exhaustive index.
- Seed known mentions and known non-mentions.
- Measure false “not found” on seeded mentions; must be 0.
- Verify coverage receipts include files searched, index version, query,
  exclusions, and hash.
- Confirm the API cannot emit “does not exist.”

### 7.6 Regression against EPIC-FORMAL-001

- Re-run the 100-question and 14-item dev sets.
- Preserve: 100/100 compile, 0 false `ENTAILED`, 1 deliberate `UNKNOWN`,
  deterministic rerun.
- Confirm no default behavior change when the feature flag is off.
- Confirm `PLAN.md` untouched and no 300-question run.

### 7.7 Human audit

- Sample `ENTAILED_UNDER_ASSUMPTIONS` receipts.
- Check that the stated definitions are the ones actually used.
- Check that the answer does not assert more than the receipt.
- Check that evaluative/normative answers are labeled as preference-based.
- Inter-annotator agreement on a small sample.

### 7.8 Determinism and performance

- Repeat the full deterministic suite twice; compare verdicts and receipts.
- Measure per-question latency for structured verification.
- Measure spec resolution and receipt overhead.
- Ensure no live model/API calls in the deterministic suite.

### 7.9 Integration and rollback

- Feature flag off → existing behavior unchanged.
- Feature flag on → formal path only for closed structured claims.
- NLI/human fallback only for the residual.
- Rollback is a flag flip; no data migration.

### 7.10 Citation gate integration validation

- Feed a real quote and a fabricated quote through `ask --formal`.
- Assert the real quote is accepted and the fabricated quote is rejected or
  labeled ungated.
- Assert the JSON carries the gate status per citation.
- Assert the default `ask` gate output is unchanged when `--formal` is absent.

### 7.11 Competitive benchmark validation

- Freeze a claim set and labels before running any detector.
- Run the formal verifier, HHEM, MiniCheck, and LettuceDetect on the same claims.
- Report per-category results: lookup, arithmetic, aggregation, filter, absence,
  top-coded, prose control.
- Record latency and cost.
- Publish a “where each fails” analysis; do not publish a single leaderboard
  number without the category breakdown.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Spec explosion / policy sprawl | Versioned registry; small initial vocabulary; require a named spec for every default |
| Hidden assumptions | Receipts; default disclosure; no unclosed term verified |
| Extractor errors | Separate evaluation; confidence; never trust unclosed output; formal layer rejects |
| Open-world overclaim | `NOT_FOUND_IN_CORPUS` only; coverage receipt; language guard |
| Evaluative claims treated as facts | `ENTAILED_UNDER_ASSUMPTIONS` + “preference-based” label |
| NLI overriding formal | Router rule: formal `CONTRADICTION` is final for closed claims |
| Default drift | Flag off by default; regression tests; no reader/judge changes |
| Cost/complexity | Phased delivery; structured path remains cheap; prose extraction off the hot path |
| Circular agreement | Keep the adversarial suite as the independent evidence; do not rely on canonical agreement alone |
| Ungated quotes in the formal path | Phase 1.6 gate integration; label ungated quotes; fabricated-quote tests |
| Overclaiming against competitors | Phase 2.5 head-to-head; category breakdown; no general-superiority claim |
| Benchmark-specific overfitting | Add a second schema/domain; report `NOT_FORMALIZABLE` honestly |
| Spec UX too academic | Named metrics, user weights, illustrative-default warnings, counterexamples |
| Production gap | Phase 5.5 config/batch/API/observability; do not present the CLI as a platform |

---

## 9. Non-goals

- Replacing the existing citation gate.
- General open-world fact-checking.
- Proving “does not exist.”
- Claiming general superiority over HHEM, MiniCheck, LettuceDetect, Luna, or
  any probabilistic detector; the comparison is category-specific.
- General NLI replacement.
- Automatic resolution of normative or causal claims without a stipulated model.
- Changing the default reader or default judge.
- Running the 300-question clean set (separate `PLAN.md`).
- Committing or integrating without explicit approval.

---

## 10. Open questions

1. What is the initial quantifier policy set? Is `most = >50%` the only default,
   or do we require an explicit policy for every use?
2. Should “stability” have a default metric, or always require user weights?
3. How do we represent multi-hop claims and their dependencies?
4. What is the minimum coverage receipt for “not found in corpus”?
5. How do we version and migrate the spec registry?
6. What is the human-audit sample size and inter-annotator threshold?
7. Do we allow an LLM extractor in the default path, or only behind a flag?
8. How do we handle conflicting specs from different users?
9. What is the API for “ask the user for a definition” in a batch benchmark?
10. How do we report `ENTAILED_UNDER_ASSUMPTIONS` without inflating the
    headline accuracy?
11. How do we gate structured-row quotes in the formal path without duplicating
    the Node gate logic in Python?
12. Which detector versions and prompts do we freeze for the competitive
    benchmark (HHEM 2.3, MiniCheck-Flan-T5 vs Bespoke-MiniCheck-7B,
    LettuceDetect v2)?
13. What is the claim set and label-freeze procedure for the head-to-head
    benchmark?
14. How do we present category-specific results without creating a misleading
    single leaderboard number?

---

## 11. Decision gates

### Gate A — schema and vocabulary

Pass when the `Spec`/`Unresolved` schema, verdict vocabulary, and closed-term
rule are reviewed and frozen.

### Gate A.5 — citation gate integration

Pass when every quote displayed by the formal path is either gate-verified
against the corpus page or explicitly labeled ungated; a fabricated quote is
rejected; default `ask` gate behavior is unchanged.

### Gate B — deterministic spec layer

Pass when “most”, “stability”, “best”, direction, units, and top-coded cases
have golden tests; same input + same spec is deterministic; every default is
disclosed.

### Gate B.5 — independent competitive benchmark

Pass when the formal verifier, HHEM, MiniCheck, and LettuceDetect are evaluated
on the same claim set, with reproducible results, latency/cost, and a written
“where each fails” analysis. No general-superiority claim is allowed.

### Gate C — prose extraction

Pass when the extractor never closes a claim with a missing slot; precision and
recall meet the provisional targets; hole detection is complete on the
annotated sample.

### Gate D — closed-corpus absence

Pass when 100% of absence verdicts carry coverage receipts and there are 0 false
“not found” on seeded mentions.

### Gate E — regression and integration

Pass when EPIC-FORMAL-001 results are preserved, the feature flag is off by
default, the default path is unchanged, and the formal path reuses the existing
citation gate.

### Gate F — final recommendation

Choose one:

- **High-coverage formal subset** for structured corpora, with NLI fallback for
  the residual; or
- **Fallback-only complement** to NLI, if prose extraction or spec coverage is
  not strong enough.

The decision must be based on the validation results, the competitive benchmark,
and the gate integration — not on the 100-question development set alone.

---

## 12. References

- `bench/formal/REPORT.md` — EPIC-FORMAL-001 spike report.
- `bench/formal/README.md` — usage, IR, verdict semantics.
- `bench/formal/formal/model.py` — current IR.
- `bench/formal/formal/spec.py` — specification registry and `close_qir`.
- `bench/formal/formal/spec_examples.py` — direct IR examples for the spec layer.
- `bench/formal/formal/extract.py` — reader-first claim extraction baseline.
- `bench/formal/formal/coverage.py` — closed-corpus index and coverage receipt.
- `bench/formal/formal/competitive.py` — formal-vs-detector benchmark harness.
- `bench/formal/competitive/` — frozen claim fixture and detector score format.
- `bench/formal/formal/router.py` — verdict → product action router.
- `bench/formal/formal/nli.py` — command-based NLI fallback adapter.
- `bench/formal/formal/z3check.py` — current Z3 checks and `verify_question`.
- `kit/lib/cli/ask.mjs` — `ask --formal` bridge, gate integration, route output.
- `kit/lib/cli/config.mjs` — workspace `formalCmd` sealing.
- `bench/formal/formal/negative.py` — known-row adversarial cases.
- `bench/formal/formal/evaluate.py` — inventory, agreement, mutations.
- `bench/formal/tests/test_spec.py` — 21 specification-layer tests.
- `bench/formal/tests/test_extract.py` — 18 reader-first extraction tests.
- `bench/formal/tests/test_coverage.py` — 5 closed-corpus absence tests.
- `bench/formal/tests/test_competitive.py` — 4 competitive harness tests.
- `bench/formal/tests/test_router.py` — 6 router tests.
- `bench/formal/tests/test_nli.py` — 6 NLI fallback tests.
- `PLAN.md` — separate 300-question clean-set plan; read-only, not part of this
  epic.

Market and research sources:

- Vectara HHEM / factual consistency score:
  <https://docs.vectara.com/docs/hallucination-and-evaluation/hallucination-evaluation>
- MiniCheck (EMNLP 2024): <https://github.com/Liyan06/MiniCheck>
- LettuceDetect: <https://github.com/KRLabsOrg/LettuceDetect>
- Luna (COLING 2025): <https://aclanthology.org/2025.coling-industry.34/>
- Logic-LM (EMNLP 2023 Findings): <https://arxiv.org/abs/2305.12295>
- LINC (EMNLP 2023 Outstanding): <https://arxiv.org/abs/2310.15164>
- SymBa (symbolic backward chaining): <https://arxiv.org/abs/2402.12806>
- Patronus Lynx and cloud guardrails (Bedrock/Azure/Vertex) are adjacent
  commercial categories; re-check their current capabilities before a public
  comparison.
