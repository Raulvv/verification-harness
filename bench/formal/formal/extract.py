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
from .rows import Dataset, field_value
from .spec import SpecRegistry, close_qir
from .z3check import Premises, check_answer

_NUMBER_RE = re.compile(r"(-?\d{1,3}(?:,\d{3})+|-?\d+)")
_YEAR_RE = {"2010", "2012", "2022", "2023", "2033"}
VALUE_KINDS = {"lookup", "compare", "difference", "sum", "extremum", "count"}
_DOC_REF_RE = re.compile(r"\b(?:Doc(?:ument)?\s*\.?\s*\d+|\[\d+\])\b", re.I)


def _clean_refs(text: str) -> str:
    return _DOC_REF_RE.sub(" ", text)


def _last_equals_number(text: str):
    """The result of an arithmetic expression, e.g. ``a − b = c`` -> c."""
    matches = list(re.finditer(r"=\s*\$?(-?[\d,]+)", text))
    if not matches:
        return None
    m = matches[-1]
    return _num(m.group(1)), m.start(1), m.end(1), m.group(1)


def _result_after_anchor(text: str, anchor: str):
    """The first ``= number`` after an anchor, e.g. ``difference ... = 8,700``."""
    a = re.search(anchor, text, re.I)
    if not a:
        return None
    m = re.search(r"=\s*\$?(-?[\d,]+)", text[a.end() :])
    if not m:
        return None
    start = a.end() + m.start(1)
    end = a.end() + m.end(1)
    return _num(m.group(1)), start, end, m.group(1)


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
    forced_verdict: str | None = None


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

    def extract(self, question: str, answer: str, qir: QIR | None = None) -> ExtractionResult:
        qir = qir or parse_question("reader", question, self.dataset)
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
        if qir.kind in VALUE_KINDS:
            false_absence = self._false_absence_subclaim(qir, text)
            if false_absence is not None:
                return false_absence
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
        if qir.kind == "quantified":
            return self._quantified(qir, text)
        if qir.kind == "rank":
            return self._rank(qir, text)
        return ExtractionResult(qir, None, (), ("unsupported_question",))

    # ------------------------------------------------------------------
    def _false_absence_subclaim(self, qir: QIR, text: str) -> ExtractionResult | None:
        """Catch a false “the table does not state …” sub-claim.

        A reader can give the right final answer while asserting a false
        absence in the same answer. That is not fully supported, even when the
        final claim is true.
        """
        # jobs2033 is derived from jobs + change, so “not stated directly” can be
        # true even when the derived value is valid.
        if qir.field == "jobs2033":
            return None
        if not re.search(
            r"\b(?:do not|does not|did not|not)\s+(?:state|provide|include|list|report|give)\b"
            r"|\bnot stated\b|\bcannot be determined\b",
            text,
            re.I,
        ):
            return None
        relevant: list[str] = []
        if qir.entity:
            relevant.append(qir.entity)
        relevant.extend(qir.entities)
        mentioned = [e for e in find_entities(text, self.dataset) if e in relevant]
        if mentioned:
            for entity in mentioned:
                if qir.field and field_value(self.dataset.by_title[entity], qir.field) is not None:
                    return ExtractionResult(
                        qir,
                        None,
                        (),
                        (
                            "false_absence_subclaim",
                            f"the table states {qir.field} for {entity}",
                        ),
                        forced_verdict="CONTRADICTION",
                    )
        return ExtractionResult(
            qir,
            None,
            (),
            ("false_absence_subclaim",),
            forced_verdict="CONTRADICTION",
        )

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
        citation = self.dataset.citation(qir.entity, qir.field)
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="stated",
                        claim=claim,
                        citations=(citation,) if citation else (),
                    ),
                )
            ),
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
            clean = _clean_refs(text)
            found = _first_number(clean)
            if found is None:
                return None
            value, start, end = found
            return value, start, end, clean[start:end]
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
        result = _result_after_anchor(text, r"difference")
        if result is None:
            result = _last_equals_number(text)
        if result is not None:
            value, start, end, raw = result
        else:
            m = re.search(r"difference (?:is|of|was)\s*\$?([\d,]+)", text, re.I)
            if not m:
                found = _first_number(_clean_refs(text))
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
        cites = tuple(
            c
            for c in (
                self.dataset.citation(a, qir.field),
                self.dataset.citation(b, qir.field),
            )
            if c
        )
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="stated",
                        claim=claim,
                        citations=cites,
                    ),
                )
            ),
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
        result = _result_after_anchor(text, r"difference")
        if result is None:
            result = _last_equals_number(text)
        if result is not None:
            value, start, end, raw = result
        else:
            m = re.search(r"difference (?:is|of|was)\s*\$?([\d,]+)", text, re.I)
            if not m:
                m = re.search(
                    r"(-?\d+(?:\.\d+)?)\s*percentage points?\s+more",
                    text,
                    re.I,
                )
            if not m:
                m = re.search(
                    r"(?:grow|grew|increase|higher)\s+by\s+(-?\d+(?:\.\d+)?)\s*percentage points?",
                    text,
                    re.I,
                )
            if not m:
                return ExtractionResult(qir, None, (), ("no_difference_value",))
            value = _num(m.group(1))
            start, end, raw = m.start(1), m.end(1), m.group(1)
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
        cites = tuple(
            c
            for c in (
                self.dataset.citation(winner, qir.field),
                self.dataset.citation(loser, qir.field),
            )
            if c
        )
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(part_id="q", status="stated", claim=winner_claim, citations=cites),
                    AnswerPart(part_id="q.diff", status="stated", claim=diff_claim, citations=cites),
                )
            ),
            (
                ExtractedClaim(text=winner, start=text.find(winner), end=text.find(winner) + len(winner)),
                ExtractedClaim(text=raw, start=start, end=end),
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
        lower_bound = bool(
            re.search(r"equal to or greater than|at least|>=", text, re.I)
        )
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
            ">=" if lower_bound else "=",
            Term(kind="const", value=value),
            label="reader_extremum_value",
        )
        citation = self.dataset.citation(winner, qir.field)
        cites = (citation,) if citation else ()
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(part_id="q", status="stated", claim=winner_claim, citations=cites),
                    AnswerPart(part_id="q.value", status="stated", claim=value_claim, citations=cites),
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
    def _quantified(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.threshold_num is not None and qir.threshold_den is not None
        negative = bool(re.search(r"\bno\b|\bfalse\b|does not hold|not the case", text, re.I))
        positive = bool(re.search(r"\byes\b|\btrue\b|\bholds\b", text, re.I))
        if not positive and not negative:
            return ExtractionResult(qir, None, (), ("no_boolean",))
        claim = Claim(
            Term(
                kind="quantified",
                candidate_set=qir.candidate_set,
                filter=qir.filter,
                condition=qir.condition,
                threshold_num=qir.threshold_num,
                threshold_den=qir.threshold_den,
            ),
            "<=" if negative else ">",
            Term(kind="const", value=0),
            label="reader_quantified",
        )
        return ExtractionResult(
            qir,
            AnswerIR(parts=(AnswerPart(part_id="q", status="stated", claim=claim),)),
            (ExtractedClaim(text=text.strip(), start=0, end=len(text.strip())),),
        )

    # ------------------------------------------------------------------
    def _rank(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.metric is not None
        found = find_entities(text, self.dataset)
        winner = found[0] if found else None
        if winner is None:
            return ExtractionResult(qir, None, (), ("no_winner",))
        score_match = re.search(r"score\s*([\d.]+)", text, re.I)
        if not score_match:
            return ExtractionResult(qir, None, (), ("no_score",))
        score = float(score_match.group(1))
        winner_claim = Claim(
            Term(
                kind="metric_argmax" if qir.op != "min" else "metric_argmin",
                metric=qir.metric,
                candidate_set=qir.candidate_set,
            ),
            "=",
            Term(kind="const", value=winner),
            label="reader_rank_winner",
        )
        score_claim = Claim(
            Term(kind="metric", entity=winner, metric=qir.metric),
            "=",
            Term(kind="const", value=score),
            label="reader_rank_score",
        )
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(part_id="q", status="stated", claim=winner_claim),
                    AnswerPart(part_id="q.score", status="stated", claim=score_claim),
                )
            ),
            (
                ExtractedClaim(text=winner, start=text.find(winner), end=text.find(winner) + len(winner)),
                ExtractedClaim(text=score_match.group(1), start=score_match.start(1), end=score_match.end(1)),
            ),
        )

    # ------------------------------------------------------------------
    def _sum(self, qir: QIR, text: str) -> ExtractionResult:
        assert qir.field and qir.entities
        result = _result_after_anchor(text, r"combined|total|added together|sum")
        if result is not None:
            value, start, end, raw = result
        else:
            m = re.search(
                r"(?:combined|total)[^.]*?(?:was|is)"
                r"(?:\s+(?:therefore|roughly|about|approximately|around))*"
                r"\s*\$?([\d,]+)",
                text,
                re.I,
            )
            if m:
                value = _num(m.group(1))
                start, end, raw = m.start(1), m.end(1), m.group(1)
            else:
                found = _first_number(_clean_refs(text))
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
        cites = []
        for entity in qir.entities:
            fields = ("jobs", "change") if qir.field == "jobs2033" else (qir.field,)
            for field in fields:
                citation = self.dataset.citation(entity, field)
                if citation is not None and citation not in cites:
                    cites.append(citation)
        return ExtractionResult(
            qir,
            AnswerIR(
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="stated",
                        claim=claim,
                        citations=tuple(cites),
                    ),
                )
            ),
            (ExtractedClaim(text=raw, start=start, end=end),),
        )


def verify_reader_answer(
    question: str,
    answer_text: str,
    dataset: Dataset,
    premises: Premises | None = None,
    qir: QIR | None = None,
    registry: SpecRegistry | None = None,
    overrides: dict[str, object] | None = None,
    allow_defaults: bool = True,
) -> tuple[ExtractionResult, Verification]:
    """Reader-first path: prose answer -> typed claims -> formal verdict."""
    premises = premises or Premises(dataset)
    qir = qir or parse_question("reader", question, dataset)
    resolution = close_qir(
        qir,
        registry=registry,
        overrides=overrides,
        allow_defaults=allow_defaults,
    )
    if resolution.unresolved:
        return (
            ExtractionResult(resolution.qir, None, (), ("needs_specification",)),
            Verification(
                verdict="NEEDS_SPECIFICATION",
                reason="unresolved specification: "
                + ", ".join(f"{u.kind}:{u.symbol}" for u in resolution.unresolved),
                unresolved=resolution.unresolved,
                assumptions=resolution.assumptions,
            ),
        )
    extraction = RuleBasedExtractor(dataset).extract(
        question, answer_text, qir=resolution.qir
    )
    if extraction.qir.kind == "not_formalizable":
        return extraction, Verification(
            verdict="NOT_FORMALIZABLE",
            reason=extraction.qir.reason or "question has no deterministic compiler",
        )
    if extraction.forced_verdict is not None:
        return extraction, Verification(
            verdict=extraction.forced_verdict,
            reason=", ".join(extraction.notes) or "forced verdict",
        )
    if extraction.answer is None:
        if "abstention" in extraction.notes and extraction.qir.kind in VALUE_KINDS:
            return extraction, Verification(
                verdict="CONTRADICTION",
                reason="the answer abstains on a question the table answers",
            )
        return extraction, Verification(
            verdict="INCOMPLETE",
            reason=", ".join(extraction.notes) or "no typed claim extracted",
        )
    verification = check_answer(
        extraction.qir,
        extraction.answer,
        premises,
        coverage_receipts=(),
    )
    return extraction, verification
