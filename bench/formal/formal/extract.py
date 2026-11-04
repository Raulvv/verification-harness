"""Reader-first claim extraction.

The reader produces prose; this module turns the parts we can type into claims
and hands them to the formal verifier. It is deliberately a narrow, rule-based
baseline: the interface is the point, not general prose understanding.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .model import AnswerIR, AnswerPart, Claim, QIR, Term, Verification
from .parse import parse_question
from .rows import Dataset
from .z3check import Premises, check_answer

_NUMBER_RE = re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d{4,})\b")
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
        if re.search(r"\bNOT FOUND\b", text[:120], re.I):
            return ExtractionResult(qir, None, (), ("abstention",))
        if qir.kind == "not_formalizable":
            return ExtractionResult(qir, None, (), ("not_formalizable",))
        if qir.kind == "lookup":
            return self._lookup(qir, text)
        if qir.kind == "difference":
            return self._difference(qir, text)
        if qir.kind == "sum":
            return self._sum(qir, text)
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
