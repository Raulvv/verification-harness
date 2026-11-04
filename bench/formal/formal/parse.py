"""Deterministic question parser: English question -> typed QIR.

No model, no learned components.  The parser is a finite ordered set of
patterns over the 100-question OOH inventory.  Anything it cannot parse is an
explicit ``not_formalizable`` QIR, never a silent guess.
"""

from __future__ import annotations

import re

from .model import CandidateSet, Filter, QIR, Scope
from .rows import Dataset


def norm_question(text: str) -> str:
    s = str(text or "")
    s = s.replace("\u2013", "-").replace("\u2014", "-")
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"\s+", " ", s).strip()
    return s


def match_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


def find_entities(question: str, dataset: Dataset) -> tuple[str, ...]:
    """Find table occupation titles in question order, longest match first."""
    qk = " " + match_key(question) + " "
    spans: list[tuple[int, int, str]] = []
    for row in sorted(dataset.rows, key=lambda r: len(match_key(r.title)), reverse=True):
        tk = match_key(row.title)
        if not tk:
            continue
        needle = f" {tk} "
        hit = qk.find(needle)
        if hit < 0:
            continue
        # Span only the title itself, not the boundary spaces: adjacent
        # titles in a list must not be treated as overlapping.
        start = hit + 1
        end = start + len(tk)
        if any(start < e and s < end for s, e, _ in spans):
            continue
        spans.append((start, end, row.title))
    spans.sort()
    out: list[str] = []
    seen: set[str] = set()
    for _, _, title in spans:
        if title not in seen:
            seen.add(title)
            out.append(title)
    return tuple(out)


def field_from_phrase(phrase: str) -> str | None:
    p = str(phrase or "").lower()
    if "2033 employment" in p or "employment in 2033" in p or "projected 2033" in p:
        return "jobs2033"
    if "growth" in p:
        return "outlook_pct"
    if "annual pay" in p or "annual wage" in p or p.strip() in {"pay", "wage"}:
        return "annual"
    if "employment change" in p or "change" in p:
        return "change"
    if "annual openings" in p or "openings" in p:
        return "annual_openings"
    if "employment" in p or "jobs" in p:
        return "jobs"
    if "education" in p:
        return "education"
    return None


def _qir(qid: str, question: str, kind: str, **kwargs) -> QIR:
    return QIR(qid=qid, question=question, kind=kind, **kwargs)


def _not_formalizable(qid: str, question: str, reason: str) -> QIR:
    return QIR(
        qid=qid,
        question=question,
        kind="not_formalizable",
        formalizable=False,
        reason=reason,
    )


def _need_entities(
    qid: str, question: str, entities: tuple[str, ...], n: int, reason: str
) -> QIR | None:
    if len(entities) != n:
        return _not_formalizable(qid, question, f"{reason} (found {len(entities)} entities)")
    return None


def parse_question(qid: str, question: str, dataset: Dataset) -> QIR:
    q = norm_question(question)
    ql = q.lower()
    entities = find_entities(q, dataset)

    # ------------------------------------------------------------------
    # Partial: one stated part + one schema-absent part.
    # ------------------------------------------------------------------
    m = re.fullmatch(
        r"what is the median annual (?:pay|wage) for .+?, and what is their median annual (?:pay|wage) in (.+?)\?",
        ql,
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "partial pay question")
        if err:
            return err
        e = entities[0]
        place = m.group(1).strip().rstrip(".")
        return _qir(
            qid,
            question,
            "partial",
            parts=(
                _qir(qid, question, "lookup", field="annual", entity=e),
                _qir(
                    qid,
                    question,
                    "absence",
                    field="annual",
                    entity=e,
                    scope=Scope(kind="place", value=place),
                    reason="place_scope_not_in_snapshot",
                ),
            ),
        )

    m = re.fullmatch(
        r"what is the projected growth rate for .+? from 2023 to 2033, and how many .+? were employed in 2010\?",
        ql,
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "partial growth question")
        if err:
            return err
        e = entities[0]
        return _qir(
            qid,
            question,
            "partial",
            parts=(
                _qir(qid, question, "lookup", field="outlook_pct", entity=e),
                _qir(
                    qid,
                    question,
                    "absence",
                    field="jobs",
                    entity=e,
                    scope=Scope(kind="year", value="2010"),
                    reason="year_2010_not_in_snapshot",
                ),
            ),
        )

    m = re.fullmatch(
        r"what is the typical entry-level education for .+?, and how many openings for .+? are projected for 2033 specifically\?",
        ql,
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "partial education question")
        if err:
            return err
        e = entities[0]
        return _qir(
            qid,
            question,
            "partial",
            parts=(
                _qir(qid, question, "lookup", field="education", entity=e),
                _qir(
                    qid,
                    question,
                    "absence",
                    field="annual_openings",
                    entity=e,
                    scope=Scope(kind="specific_year", value="2033"),
                    reason="openings_2033_not_in_snapshot",
                ),
            ),
        )

    # ------------------------------------------------------------------
    # Absence: a field/scope the snapshot does not contain.
    # ------------------------------------------------------------------
    m = re.fullmatch(
        r"what is the median annual (?:pay|wage) for .+? (in|at) (.+?)\?", ql
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "scoped pay question")
        if err:
            return err
        e = entities[0]
        kind = "place" if m.group(1) == "in" else "company"
        value = m.group(2).strip().rstrip(".")
        return _qir(
            qid,
            question,
            "absence",
            field="annual",
            entity=e,
            scope=Scope(kind=kind, value=value),
            reason=f"{kind}_scope_not_in_snapshot",
        )

    m = re.fullmatch(r"how many .+? were employed in 2010\?", ql)
    if m:
        err = _need_entities(qid, question, entities, 1, "2010 employment question")
        if err:
            return err
        return _qir(
            qid,
            question,
            "absence",
            field="jobs",
            entity=entities[0],
            scope=Scope(kind="year", value="2010"),
            reason="year_2010_not_in_snapshot",
        )

    m = re.fullmatch(r"what was the projected growth rate for .+? for 2012-22\?", ql)
    if m:
        err = _need_entities(qid, question, entities, 1, "2012-22 growth question")
        if err:
            return err
        return _qir(
            qid,
            question,
            "absence",
            field="outlook_pct",
            entity=entities[0],
            scope=Scope(kind="period", value="2012-22"),
            reason="period_2012_22_not_in_snapshot",
        )

    m = re.fullmatch(
        r"how many openings for .+? are projected for 2033 specifically\?", ql
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "2033 openings question")
        if err:
            return err
        return _qir(
            qid,
            question,
            "absence",
            field="annual_openings",
            entity=entities[0],
            scope=Scope(kind="specific_year", value="2033"),
            reason="openings_2033_not_in_snapshot",
        )

    # ------------------------------------------------------------------
    # Compare: which has the higher field, A or B, and by how much.
    # ------------------------------------------------------------------
    m = re.fullmatch(
        r"which has the higher (.+?), .+?, and by (?:how much|how many percentage points)\?",
        ql,
    )
    if m:
        err = _need_entities(qid, question, entities, 2, "comparison question")
        if err:
            return err
        field = field_from_phrase(m.group(1))
        if field is None:
            return _not_formalizable(qid, question, f"unknown comparison field {m.group(1)!r}")
        return _qir(
            qid,
            question,
            "compare",
            field=field,
            entities=entities,
            op="higher",
        )

    # ------------------------------------------------------------------
    # Difference: signed first - second, plus "how many more A than B".
    # ------------------------------------------------------------------
    m = re.fullmatch(
        r"what is the difference in (.+?) between .+?(?: from 2023 to 2033)?\?", ql
    )
    if m:
        err = _need_entities(qid, question, entities, 2, "difference question")
        if err:
            return err
        field = field_from_phrase(m.group(1))
        if field is None:
            return _not_formalizable(qid, question, f"unknown difference field {m.group(1)!r}")
        return _qir(
            qid,
            question,
            "difference",
            field=field,
            entities=entities,
            direction="symmetric",
        )

    m = re.fullmatch(r"how many more (.+?) does .+? have than .+?\?", ql)
    if m:
        err = _need_entities(qid, question, entities, 2, "how-many-more question")
        if err:
            return err
        field = field_from_phrase(m.group(1))
        if field is None:
            return _not_formalizable(qid, question, f"unknown difference field {m.group(1)!r}")
        return _qir(
            qid,
            question,
            "difference",
            field=field,
            entities=entities,
            direction="symmetric",
            notes=("more_than_direction",),
        )

    # ------------------------------------------------------------------
    # Sum: combined 2023 employment / combined projected 2033 employment.
    # ------------------------------------------------------------------
    m = re.fullmatch(
        r"what is the combined 2023 employment of .+? and .+?\?", ql
    )
    if m:
        err = _need_entities(qid, question, entities, 2, "combined employment question")
        if err:
            return err
        return _qir(qid, question, "sum", field="jobs", entities=entities)

    m = re.fullmatch(
        r"what is the combined projected 2033 employment of .+? and .+?\?", ql
    )
    if m:
        err = _need_entities(qid, question, entities, 2, "combined 2033 employment question")
        if err:
            return err
        return _qir(qid, question, "sum", field="jobs2033", entities=entities)

    # ------------------------------------------------------------------
    # Count / filter (public dev set).
    # ------------------------------------------------------------------
    m = re.fullmatch(
        r"how many of the 48 occupations have a projected growth rate (greater than|below) (\d+)% from 2023 to 2033\?",
        ql,
    )
    if m:
        op = ">" if m.group(1) == "greater than" else "<"
        return _qir(
            qid,
            question,
            "count",
            field="outlook_pct",
            candidate_set=CandidateSet("all"),
            filter=Filter("outlook_pct", op, int(m.group(2))),
        )

    if re.fullmatch(
        r"how many of the 48 occupations have a projected decline \(growth below 0%\) from 2023 to 2033\?",
        ql,
    ):
        return _qir(
            qid,
            question,
            "count",
            field="outlook_pct",
            candidate_set=CandidateSet("all"),
            filter=Filter("outlook_pct", "<", 0),
        )

    m = re.fullmatch(
        r"how many occupations with a reported median annual pay have a median annual pay (above|below) \$([\d,]+)\?",
        ql,
    )
    if m:
        op = ">" if m.group(1) == "above" else "<"
        return _qir(
            qid,
            question,
            "count",
            field="annual",
            candidate_set=CandidateSet("paid"),
            filter=Filter("annual", op, int(m.group(2).replace(",", ""))),
        )

    if re.fullmatch(
        r"how many occupations with a reported median annual pay require a doctoral or professional degree for entry\?",
        ql,
    ):
        return _qir(
            qid,
            question,
            "count",
            field="education",
            candidate_set=CandidateSet("paid"),
            filter=Filter("education", "=", "Doctoral or professional degree"),
        )

    # ------------------------------------------------------------------
    # Extremum: select / all / paid / filtered.
    # ------------------------------------------------------------------
    m = re.search(
        r"which (?:occupation )?has the (highest|lowest) (.+?)(?: from 2023 to 2033)?(?:, and what is that (?:pay|rate|employment|number|value))?\?$",
        ql,
    )
    if m and ql.startswith("among "):
        mode = "max" if m.group(1) == "highest" else "min"
        field = field_from_phrase(m.group(2))
        if field is None:
            return _not_formalizable(qid, question, f"unknown extremum field {m.group(2)!r}")
        prefix = ql[: m.start()].strip().rstrip(",")
        candidate_set, filt, note = _extremum_scope(prefix, entities, field)
        if candidate_set is None:
            return _not_formalizable(qid, question, f"unknown candidate set in {prefix!r}")
        return _qir(
            qid,
            question,
            "extremum",
            field=field,
            op=mode,
            candidate_set=candidate_set,
            filter=filt,
            entities=entities if candidate_set.kind == "select" else (),
            notes=(note,) if note else (),
        )

    # ------------------------------------------------------------------
    # Lookup: one entity, one national field.
    # ------------------------------------------------------------------
    m = re.fullmatch(r"what is the median annual (?:pay|wage) for .+?\?", ql)
    if m:
        err = _need_entities(qid, question, entities, 1, "pay lookup")
        if err:
            return err
        return _qir(qid, question, "lookup", field="annual", entity=entities[0])

    m = re.fullmatch(
        r"what is the projected (?:growth rate|percent growth) for .+? from 2023 to 2033\?",
        ql,
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "growth lookup")
        if err:
            return err
        return _qir(qid, question, "lookup", field="outlook_pct", entity=entities[0])

    m = re.fullmatch(r"how many jobs did .+? hold in 2023\?", ql)
    if m:
        err = _need_entities(qid, question, entities, 1, "jobs lookup")
        if err:
            return err
        return _qir(qid, question, "lookup", field="jobs", entity=entities[0])

    m = re.fullmatch(
        r"what is the projected employment change for .+? from 2023 to 2033\?", ql
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "change lookup")
        if err:
            return err
        return _qir(qid, question, "lookup", field="change", entity=entities[0])

    m = re.fullmatch(
        r"about how many openings for .+? are projected each year, on average, over the decade\?",
        ql,
    )
    if m:
        err = _need_entities(qid, question, entities, 1, "openings lookup")
        if err:
            return err
        return _qir(qid, question, "lookup", field="annual_openings", entity=entities[0])

    return _not_formalizable(qid, question, "no deterministic pattern matched")


def _extremum_scope(
    prefix: str, entities: tuple[str, ...], field: str
) -> tuple[CandidateSet | None, Filter | None, str | None]:
    """Decode the 'among ...' prefix into candidate set + optional filter."""
    p = prefix

    # Filtered by growth threshold: "occupations projected to grow faster than 4%"
    m = re.search(r"grow(?:th)?\s+faster\s+than\s+(\d+(?:\.\d+)?)\s*%", p)
    if m:
        return (
            CandidateSet("paid") if field == "annual" else CandidateSet("all"),
            Filter("outlook_pct", ">", _num_or_float(m.group(1))),
            "growth_threshold",
        )

    m = re.search(r"projected growth of at least\s+(\d+(?:\.\d+)?)\s*%", p)
    if m:
        return (
            CandidateSet("paid"),
            Filter("outlook_pct", ">=", _num_or_float(m.group(1))),
            "growth_at_least",
        )

    m = re.search(r"projected growth above\s+(\d+(?:\.\d+)?)\s*%", p)
    if m:
        return (
            CandidateSet("paid"),
            Filter("outlook_pct", ">", _num_or_float(m.group(1))),
            "growth_above",
        )

    if "positive projected growth" in p:
        return (CandidateSet("paid"), Filter("outlook_pct", ">", 0), "growth_positive")

    m = re.search(r"education of a master'?s degree", p)
    if m:
        return (
            CandidateSet("paid"),
            Filter("education", "=", "Master's degree"),
            "education_master",
        )

    # Named list: "among A, B, and C"
    if entities and not re.search(r"all \d+ occupations|the \d+ occupations", p):
        return (CandidateSet("select", entities), None, None)

    # Paid sets.  Check this before the generic "all/the N occupations"
    # branch: "among all 46 occupations ... that report a median annual pay"
    # is a paid set, not the full 48.
    if "reported median annual pay" in p or re.search(r"\b46 occupations\b", p):
        return (CandidateSet("paid"), None, None)

    # Global sets.
    if re.search(r"all \d+ occupations", p) or re.search(r"the \d+ occupations", p):
        return (CandidateSet("all"), None, None)

    return (None, None, None)


def _num_or_float(text: str) -> int | float:
    value = float(text)
    return int(value) if value.is_integer() else value
