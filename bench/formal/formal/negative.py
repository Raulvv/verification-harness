"""Adversarial cases for the six known-problem rows.

These are *claims*, not gold labels.  Each case says what the formal checker
must do: accept the canonical claim, contradict a known-wrong claim, or refuse
to certify an exact value that the snapshot only bounds.  The current-harness
answers are transcribed from the cached held-out output; no model is called.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from .compile import derive_answer
from .model import AnswerIR, AnswerPart, Claim, QIR, Term
from .parse import parse_question
from .rows import Dataset


@dataclass(frozen=True)
class Case:
    qid: str
    label: str
    qir: QIR
    answer: AnswerIR
    expected: str  # verdict, or NOT_ENTAILED
    note: str


def _field(entity: str, field: str) -> Term:
    return Term(kind="field", entity=entity, field=field)


def _const(value: int | str) -> Term:
    return Term(kind="const", value=value)


def _claim(lhs: Term, op: str, rhs: Term, label: str | None = None) -> Claim:
    return Claim(lhs=lhs, op=op, rhs=rhs, label=label)


def _replace_part(answer: AnswerIR, index: int, part: AnswerPart) -> AnswerIR:
    parts = list(answer.parts)
    parts[index] = part
    return AnswerIR(qid=answer.qid, parts=tuple(parts), raw=answer.raw)


def _question(dataset: Dataset, qid: str, text: str) -> QIR:
    return parse_question(qid, text, dataset)


def known_row_cases(dataset: Dataset) -> list[Case]:
    out: list[Case] = []

    # ------------------------------------------------------------------
    # test-041: "how many more does A have than B" -- the benchmark's
    # difference is symmetric; the directional reading is a separate claim.
    # ------------------------------------------------------------------
    q = _question(
        dataset,
        "test-041",
        "How many more annual openings does Graphic Designers have than Waiters and Waitresses?",
    )
    a = derive_answer(q, dataset)
    out.append(
        Case(
            "test-041",
            "canonical absolute gap",
            q,
            a,
            "ENTAILED",
            "symmetric difference matches the benchmark operator",
        )
    )
    directional = replace(
        a,
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(
                        kind="diff",
                        terms=(
                            _field("Graphic Designers", "annual_openings"),
                            _field("Waiters and Waitresses", "annual_openings"),
                        ),
                    ),
                    "=",
                    _const(450100),
                    label="directional_reading",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-041",
            "directional reading A - B = gap",
            q,
            directional,
            "CONTRADICTION",
            "Graphic Designers have fewer annual openings than Waiters; the signed gap is negative",
        )
    )
    wrong_operand = replace(
        a,
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(
                        kind="absdiff",
                        terms=(
                            _field("Graphic Designers", "annual_openings"),
                            _field("Waiters and Waitresses", "annual_openings"),
                        ),
                    ),
                    "=",
                    _const(21100),
                    label="one_operand",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-041",
            "single operand instead of gap",
            q,
            wrong_operand,
            "CONTRADICTION",
            "21,100 is Graphic Designers' own openings, not the gap",
        )
    )

    # ------------------------------------------------------------------
    # test-088: difference in median pay; signed vs absolute.
    # ------------------------------------------------------------------
    q = _question(
        dataset,
        "test-088",
        "What is the difference in median annual pay between Chefs and Head Cooks and Accountants and Auditors?",
    )
    a = derive_answer(q, dataset)
    out.append(Case("test-088", "canonical absolute gap", q, a, "ENTAILED", "20,960"))
    signed = replace(
        a,
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(
                        kind="diff",
                        terms=(
                            _field("Chefs and Head Cooks", "annual"),
                            _field("Accountants and Auditors", "annual"),
                        ),
                    ),
                    "=",
                    _const(20960),
                    label="signed_reading",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-088",
            "signed Chefs - Accountants",
            q,
            signed,
            "CONTRADICTION",
            "Chefs earn less; the signed gap is -20,960",
        )
    )

    # ------------------------------------------------------------------
    # test-091: 2033-specific openings is outside the snapshot schema.
    # ------------------------------------------------------------------
    q = _question(
        dataset,
        "test-091",
        "How many openings for Airline and Commercial Pilots are projected for 2033 specifically?",
    )
    a = derive_answer(q, dataset)
    out.append(Case("test-091", "canonical schema absence", q, a, "ABSENT_CONFIRMED", "not stated"))
    overclaim = AnswerIR(
        qid="test-091",
        parts=(
            AnswerPart(
                part_id="q",
                status="stated",
                claim=_claim(
                    _field("Airline and Commercial Pilots", "annual_openings"),
                    "=",
                    _const(18500),
                    label="annual_average_as_2033",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-091",
            "annual average presented as 2033-specific",
            q,
            overclaim,
            "INCOMPLETE",
            "18,500 is the annual average over the decade, not a 2033-specific count",
        )
    )

    # ------------------------------------------------------------------
    # test-093: partial -- education stated, 2033 openings not stated.
    # ------------------------------------------------------------------
    q = _question(
        dataset,
        "test-093",
        "What is the typical entry-level education for Interior Designers, and how many openings for Interior Designers are projected for 2033 specifically?",
    )
    a = derive_answer(q, dataset)
    out.append(Case("test-093", "canonical partial", q, a, "ENTAILED", "education stated + openings absent"))
    overclaim = _replace_part(
        a,
        1,
        AnswerPart(
            part_id=a.parts[1].part_id,
            status="stated",
            claim=_claim(
                _field("Interior Designers", "annual_openings"),
                "=",
                _const(8800),
                label="annual_average_as_2033",
            ),
        ),
    )
    out.append(
        Case(
            "test-093",
            "partial overclaim of 2033 openings",
            q,
            overclaim,
            "INCOMPLETE",
            "the stated part is fine; the absent part is asserted",
        )
    )
    wrong_education = _replace_part(
        a,
        0,
        replace(
            a.parts[0],
            claim=_claim(
                _field("Interior Designers", "education"),
                "=",
                _const("Master's degree"),
                label="wrong_education",
            ),
        ),
    )
    out.append(
        Case(
            "test-093",
            "wrong education value",
            q,
            wrong_education,
            "CONTRADICTION",
            "Interior Designers require a bachelor's degree",
        )
    )

    # ------------------------------------------------------------------
    # test-095: top-coded maximum pay.  Winner entailed; exact value only a
    # lower bound, so the exact-value claim must stay UNKNOWN.
    # ------------------------------------------------------------------
    q = _question(
        dataset,
        "test-095",
        "Among all 46 occupations in this snapshot that report a median annual pay, which has the highest median annual pay, and what is that pay?",
    )
    a = derive_answer(q, dataset)
    out.append(
        Case(
            "test-095",
            "canonical top-coded maximum",
            q,
            a,
            "UNKNOWN",
            "winner is entailed; the exact pay is a lower bound",
        )
    )
    wrong_winner = AnswerIR(
        qid="test-095",
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(kind="argmax", field="annual", candidate_set=q.candidate_set, filter=q.filter),
                    "=",
                    _const("Software Developers, Quality Assurance Analysts, and Testers"),
                    label="wrong_winner",
                ),
            ),
            replace(
                a.parts[1],
                claim=_claim(
                    _field("Software Developers, Quality Assurance Analysts, and Testers", "annual"),
                    "=",
                    _const(130160),
                    label="wrong_winner_value",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-095",
            "wrong winner below the top-coded maximum",
            q,
            wrong_winner,
            "CONTRADICTION",
            "Physicians and Surgeons are above every non-top-coded row",
        )
    )
    exact_above = _replace_part(
        a,
        1,
        replace(
            a.parts[1],
            claim=_claim(
                _field("Physicians and Surgeons", "annual"),
                "=",
                _const(239201),
                label="exact_above_lower_bound",
            ),
        ),
    )
    out.append(
        Case(
            "test-095",
            "exact value above the lower bound",
            q,
            exact_above,
            "UNKNOWN",
            "the snapshot permits any value at or above 239,200",
        )
    )

    # ------------------------------------------------------------------
    # test-100: filtered maximum.  Growth > 4% excludes Physicians at 4%.
    # ------------------------------------------------------------------
    q = _question(
        dataset,
        "test-100",
        "Among occupations projected to grow faster than 4% from 2023 to 2033, which has the highest median annual pay, and what is that pay?",
    )
    a = derive_answer(q, dataset)
    out.append(Case("test-100", "canonical filtered maximum", q, a, "ENTAILED", "Airline and Commercial Pilots"))
    harness_wrong = AnswerIR(
        qid="test-100",
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(kind="argmax", field="annual", candidate_set=q.candidate_set, filter=q.filter),
                    "=",
                    _const("Accountants and Auditors"),
                    label="harness_wrong_winner",
                ),
            ),
            replace(
                a.parts[1],
                claim=_claim(
                    _field("Accountants and Auditors", "annual"),
                    "=",
                    _const(79880),
                    label="harness_wrong_value",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-100",
            "current harness answer (3 examples, incomplete set)",
            q,
            harness_wrong,
            "CONTRADICTION",
            "Airline and Commercial Pilots grow 5% and earn more than 79,880",
        )
    )
    boundary = AnswerIR(
        qid="test-100",
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(kind="argmax", field="annual", candidate_set=q.candidate_set, filter=q.filter),
                    "=",
                    _const("Physicians and Surgeons"),
                    label="boundary_winner",
                ),
            ),
            replace(
                a.parts[1],
                claim=_claim(
                    _field("Physicians and Surgeons", "annual"),
                    "=",
                    _const(239200),
                    label="boundary_value",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-100",
            "boundary: growth exactly 4% is excluded",
            q,
            boundary,
            "CONTRADICTION",
            "Physicians grow exactly 4%, not faster than 4%",
        )
    )
    dropped_filter = AnswerIR(
        qid="test-100",
        parts=(
            replace(
                a.parts[0],
                claim=_claim(
                    Term(kind="argmax", field="annual", candidate_set=q.candidate_set, filter=None),
                    "=",
                    _const("Physicians and Surgeons"),
                    label="dropped_filter",
                ),
            ),
            replace(
                a.parts[1],
                claim=_claim(
                    _field("Physicians and Surgeons", "annual"),
                    "=",
                    _const(239200),
                    label="dropped_filter_value",
                ),
            ),
        ),
    )
    out.append(
        Case(
            "test-100",
            "dropped filter (true unfiltered claim, wrong question)",
            q,
            dropped_filter,
            "INCOMPLETE",
            "the claim is true but does not answer the filtered question",
        )
    )

    return out
