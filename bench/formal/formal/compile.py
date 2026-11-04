"""Deterministic compilers: QIR -> canonical AnswerIR.

The canonical answer is what the structured snapshot entails under the IR's
reading.  It is derived in Python (finite table, no search), then handed to the
Z3 checker.  Derivation and checking are deliberately separate: a derivation
bug cannot make the checker say ENTAILED.
"""

from __future__ import annotations

from dataclasses import replace

from .model import (
    AnswerIR,
    AnswerPart,
    CandidateSet,
    Citation,
    Claim,
    Filter,
    Metric,
    QIR,
    Term,
)
from .rows import Dataset, Row, field_quote, field_value


def compare_num(a: int | float, op: str, b: int | float) -> bool:
    return {
        ">": a > b,
        ">=": a >= b,
        "<": a < b,
        "<=": a <= b,
        "=": a == b,
        "!=": a != b,
    }[op]


def filter_matches(row: Row, f: Filter) -> bool:
    if f.all_of:
        return all(filter_matches(row, sub) for sub in f.all_of)
    value = field_value(row, f.field)
    if value is None:
        return False
    if f.op in ("=", "!=") and isinstance(f.value, str):
        ok = str(value) == str(f.value)
        return ok if f.op == "=" else not ok
    return compare_num(value, f.op, f.value)  # type: ignore[arg-type]


def filter_fields(f: Filter) -> set[str]:
    if f.all_of:
        out: set[str] = set()
        for sub in f.all_of:
            out |= filter_fields(sub)
        return out
    return {f.field}


def base_candidate_rows(
    qir: QIR, dataset: Dataset, extra_fields: tuple[str, ...] = ()
) -> list[Row]:
    """Candidate rows before applying the question's filter."""
    cs = qir.candidate_set or CandidateSet("all")
    if cs.kind == "all":
        rows = list(dataset.rows)
    elif cs.kind == "paid":
        rows = list(dataset.paid)
    elif cs.kind == "select":
        rows = [dataset.by_title[t] for t in cs.select if t in dataset.by_title]
    else:
        raise ValueError(f"unknown candidate set {cs.kind!r}")
    fields = set(extra_fields)
    if qir.field:
        fields.add(qir.field)
    if qir.filter is not None:
        fields |= filter_fields(qir.filter)
    if qir.condition is not None:
        fields |= filter_fields(qir.condition)
    # A pay query over "all" still only ranges over rows that report a median
    # annual pay: N/A is not a zero.
    if "annual" in fields:
        rows = [r for r in rows if r.has_annual]
    return rows


def candidate_rows(qir: QIR, dataset: Dataset) -> list[Row]:
    rows = base_candidate_rows(qir, dataset)
    if qir.filter is not None:
        rows = [r for r in rows if filter_matches(r, qir.filter)]
    return rows


def _field_term(entity: str, field: str) -> Term:
    return Term(kind="field", entity=entity, field=field)


def _const(value: int | float | str) -> Term:
    return Term(kind="const", value=value)


def _citation(dataset: Dataset, entity: str, field: str) -> Citation | None:
    return dataset.citation(entity, field)


def _citations(dataset: Dataset, entity: str, fields: tuple[str, ...]) -> tuple[Citation, ...]:
    out: list[Citation] = []
    for field in fields:
        c = _citation(dataset, entity, field)
        if c is not None and c not in out:
            out.append(c)
    return tuple(out)


def derive_answer(qir: QIR, dataset: Dataset) -> AnswerIR:
    if qir.unresolved:
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="unknown",
                    note="needs specification: "
                    + ", ".join(f"{u.kind}:{u.symbol}" for u in qir.unresolved),
                ),
            ),
        )

    if qir.kind == "not_formalizable":
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="unknown",
                    note=qir.reason or "not formalizable",
                ),
            ),
        )

    if qir.kind == "partial":
        parts: list[AnswerPart] = []
        for i, part in enumerate(qir.parts):
            sub = derive_answer(part, dataset)
            for p in sub.parts:
                parts.append(replace(p, part_id=f"{qir.qid}.{i}"))
        return AnswerIR(qid=qir.qid, parts=tuple(parts))

    if qir.kind == "absence":
        citation = dataset.closest_quote(qir.entity or "", qir.field or "", qir.scope.kind if qir.scope else None)
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="not_stated",
                    citations=(citation,) if citation else (),
                    note=qir.reason or "not in snapshot",
                ),
            ),
        )

    if qir.kind == "lookup":
        assert qir.entity and qir.field
        value = field_value(dataset.by_title[qir.entity], qir.field)
        if value is None:
            return AnswerIR(
                qid=qir.qid,
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="not_stated",
                        note=f"{qir.field} is N/A for {qir.entity}",
                    ),
                ),
            )
        claim = Claim(_field_term(qir.entity, qir.field), "=", _const(value), label="lookup")
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claim,
                    citations=_citations(dataset, qir.entity, (qir.field,)),
                ),
            ),
        )

    if qir.kind == "compare":
        assert qir.field and len(qir.entities) == 2
        a, b = qir.entities
        va = field_value(dataset.by_title[a], qir.field)
        vb = field_value(dataset.by_title[b], qir.field)
        if va is None or vb is None or va == vb:
            return AnswerIR(
                qid=qir.qid,
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="unknown",
                        note="comparison is undefined (missing value or tie)",
                    ),
                ),
            )
        winner, loser = (a, b) if va > vb else (b, a)
        vw = field_value(dataset.by_title[winner], qir.field)
        vl = field_value(dataset.by_title[loser], qir.field)
        assert vw is not None and vl is not None
        diff = vw - vl
        claims = (
            Claim(
                _field_term(winner, qir.field),
                ">",
                _field_term(loser, qir.field),
                label="comparison_winner",
            ),
            Claim(
                Term(kind="diff", terms=(_field_term(winner, qir.field), _field_term(loser, qir.field))),
                "=",
                _const(diff),
                label="comparison_difference",
            ),
        )
        citations = _citations(dataset, winner, (qir.field,)) + _citations(dataset, loser, (qir.field,))
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claims[0],
                    citations=citations,
                    note=f"difference={diff}",
                ),
                AnswerPart(part_id="q.diff", status="stated", claim=claims[1], citations=citations),
            ),
        )

    if qir.kind == "difference":
        assert qir.field and len(qir.entities) == 2
        a, b = qir.entities
        va = field_value(dataset.by_title[a], qir.field)
        vb = field_value(dataset.by_title[b], qir.field)
        if va is None or vb is None:
            return AnswerIR(
                qid=qir.qid,
                parts=(AnswerPart(part_id="q", status="unknown", note="missing operand"),),
            )
        # The benchmark's default difference is symmetric: it reports the
        # absolute gap, regardless of operand order (e.g. test-088/test-092).
        # A spec can select the signed reading; that is a different claim.
        signed = qir.direction == "signed"
        d = (va - vb) if signed else abs(va - vb)
        claim = Claim(
            Term(
                kind="diff" if signed else "absdiff",
                terms=(_field_term(a, qir.field), _field_term(b, qir.field)),
            ),
            "=",
            _const(d),
            label="difference_signed" if signed else "difference",
        )
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claim,
                    citations=_citations(dataset, a, (qir.field,)) + _citations(dataset, b, (qir.field,)),
                    note="more_than_direction" if "more_than_direction" in qir.notes else None,
                ),
            ),
        )

    if qir.kind == "sum":
        assert qir.field and len(qir.entities) >= 2
        terms = tuple(_field_term(e, qir.field) for e in qir.entities)
        values = [field_value(dataset.by_title[e], qir.field) for e in qir.entities]
        if any(v is None for v in values):
            return AnswerIR(
                qid=qir.qid,
                parts=(AnswerPart(part_id="q", status="unknown", note="missing summand"),),
            )
        total = sum(values)  # type: ignore[arg-type]
        claim = Claim(Term(kind="sum", terms=terms), "=", _const(total), label="sum")
        cites: list[Citation] = []
        for e in qir.entities:
            fields = ("jobs", "change") if qir.field == "jobs2033" else (qir.field,)
            cites.extend(_citations(dataset, e, fields))
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claim,
                    citations=tuple(cites),
                ),
            ),
        )

    if qir.kind == "extremum":
        assert qir.field and qir.op in ("max", "min")
        rows = candidate_rows(qir, dataset)
        if not rows:
            return AnswerIR(
                qid=qir.qid,
                parts=(AnswerPart(part_id="q", status="not_stated", note="empty candidate set"),),
            )
        # Stable tie-break by title so verdicts are deterministic.
        ordered = sorted(rows, key=lambda r: (field_value(r, qir.field), r.title))  # type: ignore[arg-type]
        winner = ordered[-1] if qir.op == "max" else ordered[0]
        value = field_value(winner, qir.field)
        assert value is not None
        cs = qir.candidate_set or CandidateSet("all")
        claims = (
            Claim(
                Term(
                    kind="argmax" if qir.op == "max" else "argmin",
                    field=qir.field,
                    candidate_set=cs,
                    filter=qir.filter,
                ),
                "=",
                _const(winner.title),
                label="extremum_winner",
            ),
            Claim(_field_term(winner.title, qir.field), "=", _const(value), label="extremum_value"),
        )
        cites: list[Citation] = list(_citations(dataset, winner.title, (qir.field,)))
        # Runner-up is evidence for maximality; filter evidence is needed when
        # the candidate set is filtered.
        if len(ordered) > 1:
            runner = ordered[-2] if qir.op == "max" else ordered[1]
            cites.extend(_citations(dataset, runner.title, (qir.field,)))
        if qir.filter is not None:
            cites.extend(_citations(dataset, winner.title, (qir.filter.field,)))
        note = "value_is_lower_bound" if winner.annual_censored and qir.field == "annual" else None
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(part_id="q", status="stated", claim=claims[0], citations=tuple(cites)),
                AnswerPart(
                    part_id="q.value",
                    status="stated",
                    claim=claims[1],
                    citations=tuple(cites),
                    note=note,
                ),
            ),
        )

    if qir.kind == "count":
        assert qir.candidate_set and qir.filter
        rows = candidate_rows(qir, dataset)
        n = len(rows)
        claim = Claim(
            Term(kind="count", candidate_set=qir.candidate_set, filter=qir.filter),
            "=",
            _const(n),
            label="count",
        )
        cites: list[Citation] = []
        for row in rows:
            c = _citation(dataset, row.title, qir.filter.field)
            if c is not None and c not in cites:
                cites.append(c)
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claim,
                    citations=tuple(cites),
                ),
            ),
        )

    if qir.kind == "quantified":
        if qir.unresolved or qir.threshold_num is None or qir.threshold_den is None:
            return AnswerIR(
                qid=qir.qid,
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="unknown",
                        note="needs specification: quantifier policy",
                    ),
                ),
            )
        base = base_candidate_rows(qir, dataset)
        if qir.filter is not None:
            base = [r for r in base if filter_matches(r, qir.filter)]
        matching = [r for r in base if qir.condition is None or filter_matches(r, qir.condition)]
        total = len(base)
        delta = qir.threshold_den * len(matching) - qir.threshold_num * total
        claim = Claim(
            Term(
                kind="quantified",
                candidate_set=qir.candidate_set or CandidateSet("all"),
                filter=qir.filter,
                condition=qir.condition,
                threshold_num=qir.threshold_num,
                threshold_den=qir.threshold_den,
            ),
            ">",
            _const(0),
            label="quantified",
        )
        cites: list[Citation] = []
        for row in matching:
            fields: set[str] = set()
            if qir.filter is not None:
                fields |= filter_fields(qir.filter)
            if qir.condition is not None:
                fields |= filter_fields(qir.condition)
            for field in sorted(fields):
                c = _citation(dataset, row.title, field)
                if c is not None and c not in cites:
                    cites.append(c)
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claim,
                    citations=tuple(cites),
                    note=f"matching={len(matching)} total={total}",
                ),
            ),
        )

    if qir.kind == "rank":
        if qir.unresolved or qir.metric is None or qir.op not in ("max", "min"):
            return AnswerIR(
                qid=qir.qid,
                parts=(
                    AnswerPart(
                        part_id="q",
                        status="unknown",
                        note="needs specification: metric/utility",
                    ),
                ),
            )
        fields = tuple(field for field, _ in qir.metric.weights)
        base = base_candidate_rows(qir, dataset, extra_fields=fields)
        if not base:
            return AnswerIR(
                qid=qir.qid,
                parts=(AnswerPart(part_id="q", status="not_stated", note="empty candidate set"),),
            )
        scored = [(metric_score(row, qir.metric), row) for row in base]
        ordered = sorted(scored, key=lambda pair: (pair[0], pair[1].title))
        score, winner = ordered[-1] if qir.op == "max" else ordered[0]
        cs = qir.candidate_set or CandidateSet("all")
        claims = (
            Claim(
                Term(
                    kind="metric_argmax" if qir.op == "max" else "metric_argmin",
                    metric=qir.metric,
                    candidate_set=cs,
                ),
                "=",
                _const(winner.title),
                label="rank_winner",
            ),
            Claim(
                Term(kind="metric", entity=winner.title, metric=qir.metric),
                "=",
                _const(score),
                label="rank_score",
            ),
        )
        cites: list[Citation] = []
        for field in fields:
            c = _citation(dataset, winner.title, field)
            if c is not None and c not in cites:
                cites.append(c)
        return AnswerIR(
            qid=qir.qid,
            parts=(
                AnswerPart(
                    part_id="q",
                    status="stated",
                    claim=claims[0],
                    citations=tuple(cites),
                    note=f"metric={qir.metric.name} score={score}",
                ),
                AnswerPart(
                    part_id="q.score",
                    status="stated",
                    claim=claims[1],
                    citations=tuple(cites),
                    note=f"metric={qir.metric.name}",
                ),
            ),
        )

    raise ValueError(f"cannot derive answer for kind {qir.kind!r}")


def metric_score(row: Row, metric: Metric) -> float:
    total = 0.0
    for field, weight in metric.weights:
        value = field_value(row, field)
        if value is None:
            continue
        total += float(weight) * float(value)
    return total
