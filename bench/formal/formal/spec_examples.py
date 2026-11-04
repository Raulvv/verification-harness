"""Representative QIR builders for the specification-layer tests.

These are direct IR examples, not a general prose parser.  Phase 3 will add a
claim extractor that produces the same shapes from prose.
"""

from __future__ import annotations

from .model import CandidateSet, Filter, QIR, Scope, Unresolved


def most_bachelors_pay_over_60k() -> QIR:
    return QIR(
        qid="spec-most",
        question="Most occupations with a bachelor's degree pay more than $60,000.",
        kind="quantified",
        field="annual",
        candidate_set=CandidateSet("paid"),
        filter=Filter("education", "=", "Bachelor's degree"),
        condition=Filter("annual", ">", 60000),
        unresolved=(
            Unresolved(
                symbol="most",
                kind="quantifier",
                allowed=("majority", "threshold"),
                default="majority",
                description="'most' needs a threshold policy",
            ),
        ),
    )


def best_stability() -> QIR:
    return QIR(
        qid="spec-best",
        question="This is the best career for someone who wants stability.",
        kind="rank",
        candidate_set=CandidateSet("all"),
        op=None,
        unresolved=(
            Unresolved(
                symbol="stability",
                kind="metric",
                allowed=("stability", "user_weights"),
                default="stability",
                description="'stability' needs a metric definition",
            ),
            Unresolved(
                symbol="best",
                kind="utility",
                allowed=("max", "min"),
                default="best",
                description="'best' needs a utility function",
            ),
        ),
    )


def difference_direction() -> QIR:
    return QIR(
        qid="spec-direction",
        question="What is the difference in median annual pay between Chefs and Head Cooks and Accountants and Auditors?",
        kind="difference",
        field="annual",
        entities=("Chefs and Head Cooks", "Accountants and Auditors"),
        unresolved=(
            Unresolved(
                symbol="difference",
                kind="direction",
                allowed=("symmetric", "signed"),
                default="symmetric",
                description="'difference' needs a direction policy",
            ),
        ),
    )


def pay_unit() -> QIR:
    return QIR(
        qid="spec-unit",
        question="What is the pay for Electricians?",
        kind="lookup",
        entity="Electricians",
        field=None,
        unresolved=(
            Unresolved(
                symbol="pay",
                kind="unit",
                allowed=("annual", "hourly"),
                default="annual",
                description="'pay' needs an annual/hourly policy",
            ),
        ),
    )


def causal_question() -> QIR:
    return QIR(
        qid="spec-causal",
        question="Electricians earn more than carpenters because of unionization.",
        kind="not_formalizable",
        reason="causal claim has no formal theory in the snapshot",
        formalizable=False,
        unresolved=(
            Unresolved(
                symbol="unionization",
                kind="model",
                allowed=("causal_model",),
                default=None,
                description="a causal claim needs an explicit causal model",
            ),
        ),
    )


def normative_question() -> QIR:
    return QIR(
        qid="spec-normative",
        question="The policy is fair.",
        kind="not_formalizable",
        reason="normative claim has no formal theory in the snapshot",
        formalizable=False,
        unresolved=(
            Unresolved(
                symbol="fairness",
                kind="theory",
                allowed=("normative_theory",),
                default=None,
                description="a normative claim needs an explicit theory",
            ),
        ),
    )


def open_world_absence() -> QIR:
    return QIR(
        qid="spec-open-absence",
        question="No source anywhere states New York City pay for Machinists and Tool and Die Makers.",
        kind="absence",
        field="annual",
        entity="Machinists and Tool and Die Makers",
        scope=Scope(kind="place", value="New York City"),
        unresolved=(
            Unresolved(
                symbol="corpus",
                kind="scope",
                allowed=("corpus_id",),
                default=None,
                description="absence needs a declared corpus and coverage receipt",
            ),
        ),
    )
