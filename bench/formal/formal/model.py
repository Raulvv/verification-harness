"""Typed IR for questions, answers, citations, absence and partial answers.

The IR is deliberately small and JSON-serialisable.  A question is compiled to
one ``QIR``; an answer is a tuple of ``AnswerPart`` values, each carrying either
a ``Claim`` or an explicit ``not_stated`` status.  Claims are equations /
inequalities over ``Term`` expressions.  Nothing here knows about Z3.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any

# Verdict vocabulary.  ENTAILED, ENTAILED_UNDER_ASSUMPTIONS and
# ABSENT_CONFIRMED are accepting; ABSENT_CONFIRMED is a closed-world schema
# claim, never open-world absence.  NEEDS_SPECIFICATION is a deterministic
# "I cannot close this claim yet" signal, not a guess.
VERDICTS = (
    "ENTAILED",
    "ENTAILED_UNDER_ASSUMPTIONS",
    "ABSENT_CONFIRMED",
    "NOT_FOUND_IN_CORPUS",
    "CONTRADICTION",
    "UNKNOWN",
    "INCOMPLETE",
    "NEEDS_SPECIFICATION",
    "NOT_FORMALIZABLE",
    "NO_CLAIM",
)

# Numeric fields available in the structured snapshot.
NUMERIC_FIELDS = (
    "annual",
    "hourly",
    "outlook_pct",
    "jobs",
    "change",
    "jobs2033",
    "annual_openings",
)
STRING_FIELDS = ("education", "work_experience", "training")
FIELDS = NUMERIC_FIELDS + STRING_FIELDS

FIELD_LABELS = {
    "annual": "median annual pay",
    "hourly": "median hourly pay",
    "outlook_pct": "projected growth",
    "jobs": "employment",
    "change": "employment change",
    "jobs2033": "projected 2033 employment",
    "annual_openings": "annual openings",
    "education": "entry-level education",
    "work_experience": "work experience",
    "training": "on-the-job training",
}


def _clean(obj: Any) -> Any:
    """Recursively convert dataclasses/tuples to plain JSON values."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: _clean(v) for k, v in asdict(obj).items()}
    if isinstance(obj, tuple):
        return [_clean(v) for v in obj]
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    return obj


@dataclass(frozen=True)
class Unresolved:
    """A typed hole the compiler refuses to guess.

    ``kind`` is one of quantifier, metric, utility, scope, unit, direction,
    model, theory, corpus.  ``allowed`` names the resolution modes the caller
    may supply; ``default`` is the registry default, if any.
    """

    symbol: str
    kind: str
    allowed: tuple[str, ...] = ()
    default: str | None = None
    description: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class SpecEntry:
    key: str
    value: Any
    source: str  # user | registry | default | retrieved
    version: str = "spec-v1"
    rationale: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Assumption:
    key: str
    value: Any
    source: str
    rationale: str | None = None
    version: str = "spec-v1"

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Spec:
    """The explicit definitions used to close a claim."""

    entries: tuple[SpecEntry, ...] = ()
    version: str = "spec-v1"

    def get(self, key: str) -> SpecEntry | None:
        for entry in self.entries:
            if entry.key == key:
                return entry
        return None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)

    def digest(self) -> str:
        payload = json.dumps(_clean(self.entries), sort_keys=True, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class CoverageReceipt:
    """Evidence that an absence claim searched a declared corpus."""

    corpus_id: str
    files_searched: int
    index_version: str
    query: str
    hits: int
    exclusions: tuple[str, ...] = ()
    digest: str = ""

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Metric:
    """A named weighted score over structured fields."""

    name: str
    weights: tuple[tuple[str, float], ...]
    description: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Scope:
    """A qualifier the question adds to a field.

    ``kind`` is one of place, company, year, period, specific_year.  The OOH
    snapshot is national and 2023--33 only, so every non-empty scope is outside
    the snapshot schema.
    """

    kind: str
    value: str
    supported: bool = False

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Filter:
    field: str
    op: str  # > >= < <= = != | all
    value: int | str
    all_of: tuple["Filter", ...] = ()

    @classmethod
    def all(cls, *filters: "Filter") -> "Filter":
        return cls(field="", op="all", value="", all_of=tuple(filters))

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class CandidateSet:
    kind: str  # all | paid | select
    select: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class QIR:
    """Question IR.

    kind:
      lookup      -- one entity, one field
      compare     -- two entities, which has the higher/lower field, plus diff
      difference  -- signed first - second
      sum         -- sum of a field over named entities
      extremum    -- argmax/argmin over a candidate set, optional filter
      count       -- count of candidates satisfying a filter
      absence     -- a field/scope the snapshot does not contain
      partial     -- ordered parts, each lookup or absence
      not_formalizable
    """

    qid: str
    question: str
    kind: str
    field: str | None = None
    entity: str | None = None
    entities: tuple[str, ...] = ()
    op: str | None = None  # higher | lower | max | min
    candidate_set: CandidateSet | None = None
    filter: Filter | None = None          # population filter
    condition: Filter | None = None       # condition being quantified over
    scope: Scope | None = None
    parts: tuple["QIR", ...] = ()
    reason: str | None = None
    formalizable: bool = True
    notes: tuple[str, ...] = ()
    # Specification layer.  ``unresolved`` is empty only for a closed QIR.
    unresolved: tuple[Unresolved, ...] = ()
    spec: Spec | None = None
    quantifier: str | None = None
    threshold_num: int | None = None
    threshold_den: int | None = None
    metric: Metric | None = None
    direction: str | None = None  # symmetric | signed
    corpus_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)

    def walk(self):
        yield self
        for part in self.parts:
            yield from part.walk()


@dataclass(frozen=True)
class Citation:
    title: str
    slug: str
    field: str
    quote: str
    source: str = "ooh-data.json"

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Term:
    """A typed expression.

    kind:
      const       -- value
      field       -- entity.field
      diff        -- terms[0] - terms[1] (signed)
      absdiff     -- |terms[0] - terms[1]| (benchmark difference)
      sum         -- sum(terms)
      count       -- count of candidate_set satisfying filter
      argmax/argmin -- entity selected from candidate_set satisfying filter
    """

    kind: str
    value: int | float | str | None = None
    entity: str | None = None
    field: str | None = None
    terms: tuple["Term", ...] = ()
    candidate_set: CandidateSet | None = None
    filter: Filter | None = None
    condition: Filter | None = None
    metric: Metric | None = None
    threshold_num: int | None = None
    threshold_den: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)

    def __str__(self) -> str:
        if self.kind == "const":
            return str(self.value)
        if self.kind == "field":
            return f"{self.entity}.{self.field}"
        if self.kind == "diff":
            return f"({self.terms[0]} - {self.terms[1]})"
        if self.kind == "absdiff":
            return f"|{self.terms[0]} - {self.terms[1]}|"
        if self.kind == "sum":
            return "(" + " + ".join(str(t) for t in self.terms) + ")"
        if self.kind == "count":
            return f"count[{self.candidate_set.kind if self.candidate_set else '?'};{self.filter}]"
        if self.kind == "quantified":
            return (
                f"quantified[{self.candidate_set.kind if self.candidate_set else '?'};"
                f"{self.filter};{self.condition};{self.threshold_num}/{self.threshold_den}]"
            )
        if self.kind == "metric":
            return f"metric[{self.metric.name if self.metric else '?'}]({self.entity})"
        if self.kind in ("argmax", "argmin"):
            return f"{self.kind}[{self.field};{self.candidate_set.kind if self.candidate_set else '?'}]"
        if self.kind in ("metric_argmax", "metric_argmin"):
            return (
                f"{self.kind}[{self.metric.name if self.metric else '?'};"
                f"{self.candidate_set.kind if self.candidate_set else '?'}]"
            )
        return self.kind


@dataclass(frozen=True)
class Claim:
    lhs: Term
    op: str  # = != > < >= <=
    rhs: Term
    label: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)

    def __str__(self) -> str:
        return f"{self.lhs} {self.op} {self.rhs}" + (f"  [{self.label}]" if self.label else "")


@dataclass(frozen=True)
class AnswerPart:
    part_id: str
    status: str  # stated | not_stated | unknown
    claim: Claim | None = None
    citations: tuple[Citation, ...] = ()
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class AnswerIR:
    parts: tuple[AnswerPart, ...]
    qid: str | None = None
    raw: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class ClaimCheck:
    claim: Claim | None
    verdict: str
    reason: str
    counterexample: dict[str, Any] | None = None
    part_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)


@dataclass(frozen=True)
class Verification:
    verdict: str
    checks: tuple[ClaimCheck, ...] = ()
    reason: str = ""
    counterexample: dict[str, Any] | None = None
    runtime_ms: float = 0.0
    unresolved: tuple[Unresolved, ...] = ()
    assumptions: tuple[Assumption, ...] = ()
    spec_id: str | None = None
    coverage_receipts: tuple[CoverageReceipt, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return _clean(self)
