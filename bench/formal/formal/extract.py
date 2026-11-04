"""Reader-first claim extraction.

The reader produces prose; this module turns the parts we can type into claims
and hands them to the formal verifier. It is deliberately a narrow, rule-based
baseline: the interface is the point, not general prose understanding.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .model import AnswerIR, AnswerPart, Claim, QIR, Term, Verification
from .parse import find_entities, parse_question
from .rows import Dataset
from .z3check import Premises, check_answer

_NUMBER_RE = re.compile(r"(-?\d{1,3}(?:,\d{3})+|-?\d+)")
_YEAR_RE = {"2010", "2012", "2022", "2023", "2033"}


@dataclass(frozen=True)
class ExtractedClaim:
    text: str
    start: int
    end: int
    confidence: float = 1.0


@dataclass(frozen=True)
class ExtractionResult:
    qir: QIR
    answer: AnswerIR | None
    claims: tuple[ExtractedClaim, ...] = ()
    notes: tuple[str, ...] = ()


def _num(text: str) -> int | float:
    value = text.replace(",", "").replace("$", "").strip()
    return float(value) if "." in value else int(value)


def _first_number(text: str, *, skip_years: bool = True) -> tuple[int | float, int, int] | None:
    for m in _NUMBER_RE.finditer(text):
        raw = m.group(1)
        if skip_years and raw in _YEAR_RE:
            continue
        return _num(raw), m.start(1), m.end(1)
    return None


class RuleBasedExtractor:
    """A deterministic baseline for the OOH prose templates."""

    def __init__(self, dataset: Dataset):
        self.dataset = dataset

    def extract(self, question: str, answer: str) -> ExtractionResult:
        qir = parse_question("reader", question, self.dataset)
        text = str(answer or "")
        abstention = bool(re.search(r"\bNOT FOUND\b", text[:120], re.I))
        if qir.kind == "not_formalizable":
            return ExtractionResult(qir, None, (), ("not_formalizable",))
        if qir.kind == "absence":
            if abstention:
                return ExtractionResult(
                    qir,
                    AnswerIR(parts=(AnswerPart(part_id="q", status="not_stated"),)),
                    (),
                    ("abstention",),
                )
            return ExtractionResult(qir, None, (), ("absence_overclaim",))
        if abstention:
            return ExtractionResult(qir, None, (), ("abstention",))
        if qir.kind == "lookup":
            return self._lookup(qir, text)
        if qir.kind == "difference":
            return self._difference(qir, text)
        if qir.kind == "sum":
            return self._sum(qir, text)
        if qir.kind == "compare":
            return self._compare(qir, text)
        if qir.kind == "extremum":
            return self._extremum(qir, text)
        if qir.kind == "count":
            return self._count(qir, text)
        return ExtractionResult(qir, None, (), ("unsupported_question",))

    # ------------------------------------------------------------------
    def _lookup(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.entity and qir.field
        found = self._lookup_value(qir.field, text)
        if found is None:
            return ExtractionResult(qir, None, (), ("no_value",))
        value, start, end, raw = found
        claim = Claim(
            Term(kind="field", entity=qir.entity, field=qir.field),
            "=",
            Term(kind="const", value=value),
            label="reader_lookup",
        )
        return ExtractionResult(
            qir,
            AnswerIR(parts=(AnswerPart(part_id="q", status="stated", claim=claim),)),
            (ExtractedClaim(text=raw, start=start, end=end),),
        )

    def _lookup_value(self, field: str, text: str):
        if field == "annual":
            m = re.search(r"\$([\d,]+)", text)
            if not m:
                return None
            return _num(m.group(1)), m.start(1), m.end(1), m.group(1)
        if field == "hourly":
            m = re.search(r"\$([\d.]+)\s*(?:per hour|/hour|hourly)", text, re.I)
            if not m:
                return None
            return _num(m.group(1)), m.start(1), m.end(1), m.group(1)
        if field == "outlook_pct":
            m = re.search(r"(-?\d+(?:\.\d+)?)\s*%", text)
            if not m:
                return None
            return _num(m.group(1)), m.start(1), m.end(1), m.group(1)
        if field in ("jobs", "change", "annual_openings"):
            found = _first_number(text)
            if found is None:
                return None
            value, start, end = found
            return value, start, end, text[start:end]
        if field == "education":
            values = {r.education for r in self.dataset.rows}
            for value in sorted(values, key=len, reverse=True):
                m = re.search(re.escape(value), text, re.I)
                if m:
                    return value, m.start(), m.end(), m.group(0)
            return None
        return None

    # ------------------------------------------------------------------
    def _difference(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.field and len(qir.entities) == 2
        m = re.search(r"difference (?:is|of|was)\s*\$?([\d,]+)", text, re.I)
        if not m:
            found = _first_number(text)
            if found is None:
                return ExtractionResult(qir, None, (), ("no_value",))
            value, start, end = found
            raw = text[start:end]
        else:
            value = _num(m.group(1))
            start, end, raw = m.start(1), m.end(1), m.group(1)
        a, b = qir.entities
        signed = qir.direction == "signed"
        claim = Claim(
            Term(
                kind="diff" if signed else "absdiff",
                terms=(
                    Term(kind="field", entity=a, field=qir.field),
                    Term(kind="field", entity=b, field=qir.field),
                ),
            ),
            "=",
            Term(kind="const", value=value),
            label="reader_difference",
        )
        return ExtractionResult(
            qir,
            AnswerIR(parts=(AnswerPart(part_id="q", status="stated", claim=claim),)),
            (ExtractedClaim(text=raw, start=start, end=end),),
        )

    # ------------------------------------------------------------------
    def _compare(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.field and len(qir.entities) == 2
        found = find_entities(text, self.dataset)
        winner = found[0] if found else None
        if winner not in qir.entities:
            return ExtractionResult(qir, None, (), ("no_winner",))
        loser = qir.entities[0] if winner == qir.entities[1] else qir.entities[1]
        m = re.search(r"difference (?:is|of|was)\s*\$?([\d,]+)", text, re.I)
        if not m:
            return ExtractionResult(qir, None, (), ("no_difference_value",))
        value = _num(m.group(1))
        winner_claim = Claim(
            Term(kind="field", entity=winner, field=qir.field),
            ">",
            Term(kind="field", entity=loser, field=qir.field),
            label="reader_comparison_winner",
        )
        diff_claim = Claim(
            Term(
                kind="diff",
                terms=(
                    Term(kind="field", entity=winner, field=qir.field),
                    Term(kind="field", entity=loser, field=qir.field),
                ),
            ),
            "=",
            Term(kind="const", value=value),
            label="reader_comparison_difference",
        )
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(part_id="q", status="stated", claim=winner_claim),
                    AnswerPart(part_id="q.diff", status="stated", claim=diff_claim),
                )
            ),
            (
                ExtractedClaim(text=winner, start=text.find(winner), end=text.find(winner) + len(winner)),
                ExtractedClaim(text=m.group(1), start=m.start(1), end=m.end(1)),
            ),
        )

    # ------------------------------------------------------------------
    def _extremum(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.field and qir.op in ("max", "min")
        found = find_entities(text, self.dataset)
        winner = found[0] if found else None
        if winner is None:
            return ExtractionResult(qir, None, (), ("no_winner",))
        value_found = self._lookup_value(qir.field, text)
        if value_found is None:
            return ExtractionResult(qir, None, (), ("no_value",))
        value, start, end, raw = value_found
        winner_claim = Claim(
            Term(
                kind="argmax" if qir.op == "max" else "argmin",
                field=qir.field,
                candidate_set=qir.candidate_set,
                filter=qir.filter,
            ),
            "=",
            Term(kind="const", value=winner),
            label="reader_extremum_winner",
        )
        value_claim = Claim(
            Term(kind="field", entity=winner, field=qir.field),
            "=",
            Term(kind="const", value=value),
            label="reader_extremum_value",
        )
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(part_id="q", status="stated", claim=winner_claim),
                    AnswerPart(part_id="q.value", status="stated", claim=value_claim),
                )
            ),
            (
                ExtractedClaim(text=winner, start=text.find(winner), end=text.find(winner) + len(winner)),
                ExtractedClaim(text=raw, start=start, end=end),
            ),
        )

    # ------------------------------------------------------------------
    def _count(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.candidate_set and qir.filter
        found = _first_number(text)
        if found is None:
            return ExtractionResult(qir, None, (), ("no_value",))
        value, start, end = found
        claim = Claim(
            Term(kind="count", candidate_set=qir.candidate_set, filter=qir.filter),
            "=",
            Term(kind="const", value=value),
            label="reader_count",
        )
        return ExtractionResult(
            qir,
            AnswerIR(parts=(AnswerPart(part_id="q", status="stated", claim=claim),)),
            (ExtractedClaim(text=text[start:end], start=start, end=end),),
        )

    # ------------------------------------------------------------------
    def _sum(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.field and qir.entities
        m = re.search(r"(?:combined|total)[^.]*?(?:was|is)\s*\$?([\d,]+)", text, re.I)
        if m:
            value = _num(m.group(1))
            start, end, raw = m.start(1), m.end(1), m.group(1)
        else:
            found = _first_number(text)
            if found is None:
                return ExtractionResult(qir, None, (), ("no_value",))
            value, start, end = found
            raw = text[start:end]
        claim = Claim(
            Term(
                kind="sum",
                terms=tuple(Term(kind="field", entity=e, field=qir.field) for e in qir.entities),
            ),
            "=",
            Term(kind="const", value=value),
            label="reader_sum",
        )
        return ExtractionResult(
            qir,
            AnswerIR(parts=(AnswerPart(part_id="q", status="stated", claim=claim),)),
            (ExtractedClaim(text=raw, start=start, end=end),),
        )


def verify_reader_answer(
    question: str,
    answer_text: str,
    dataset: Dataset,
    premises: Premises | None = None,
) -> tuple[ExtractionResult, Verification]:
    """Reader-first path: prose answer -> typed claims -> formal verdict."""
    premises = premises or Premises(dataset)
    extraction = RuleBasedExtractor(dataset).extract(question, answer_text)
    if extraction.qir.kind == "not_formalizable":
        return extraction, Verification(
            verdict="NOT_FORMALIZABLE",
            reason=extraction.qir.reason or "question has no deterministic compiler",
        )
    if extraction.answer is None:
        return extraction, Verification(
            verdict="INCOMPLETE",
            reason=", ".join(extraction.notes) or "no typed claim extracted",
        )
    verification = check_answer(extraction.qir, extraction.answer, premises)
    return extraction, verification
