"""Z3 entailment checks over structured OOH premises.

Three-valued claim check:

    P & C   unsat  -> CONTRADICTION
    P & ~C  unsat  -> ENTAILED
    otherwise      -> UNKNOWN

Premises are the 48 structured rows, including the two N/A pay rows and the
top-coded Physicians pay (a lower bound, not an equality).  Page quotes are
evidence attached to the answer IR; they are not premises.
"""

from __future__ import annotations

import re
import time
from dataclasses import replace

import z3

from .compile import candidate_rows, filter_fields, filter_matches, metric_score
from .coverage import absence_from_receipt
from .model import (
    AnswerIR,
    AnswerPart,
    Assumption,
    CandidateSet,
    Claim,
    ClaimCheck,
    CoverageReceipt,
    Filter,
    Metric,
    QIR,
    Term,
    Verification,
)
from .rows import Dataset, Row, field_value, schema_has
from .spec import SpecRegistry, close_qir


def _safe(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", text)


def _z3_num(value: int | float) -> z3.ArithRef:
    if isinstance(value, float) and not value.is_integer():
        return z3.RealVal(value)
    return z3.IntVal(int(value))


def _z3_const(value: int | float | str) -> z3.ExprRef:
    # String-valued fields are encoded as stable integer codes (see
    # Premises.string_code); a bare string constant is therefore a code.
    if isinstance(value, str):
        raise ValueError("string constants require a Premises string-code context")
    return _z3_num(value)


class Premises:
    def __init__(self, dataset: Dataset):
        self.dataset = dataset
        self.solver = z3.Solver()
        self.pay: dict[str, z3.ArithRef] = {}
        self.hourly: dict[str, z3.ArithRef] = {}
        self.growth: dict[str, z3.ArithRef] = {}
        self.jobs: dict[str, z3.ArithRef] = {}
        self.change: dict[str, z3.ArithRef] = {}
        self.jobs2033: dict[str, z3.ArithRef] = {}
        self.openings: dict[str, z3.ArithRef] = {}
        self.has_pay: dict[str, z3.BoolRef] = {}
        # String fields are finite equality domains; encode them as stable
        # integer codes so Z3 never enters the string solver.
        self.education: dict[str, z3.ArithRef] = {}
        self.work_experience: dict[str, z3.ArithRef] = {}
        self.training: dict[str, z3.ArithRef] = {}
        self.string_codes: dict[str, int] = {}
        self.string_values: dict[int, str] = {}
        self._assertions: list[z3.BoolRef] = []
        self._build()

    def string_code(self, value: str) -> int:
        if value not in self.string_codes:
            code = len(self.string_codes) + 1
            self.string_codes[value] = code
            self.string_values[code] = value
        return self.string_codes[value]

    def _add(self, *constraints: z3.BoolRef) -> None:
        for c in constraints:
            self._assertions.append(c)

    def _build(self) -> None:
        for row in self.dataset.rows:
            s = _safe(row.slug)
            pay = z3.Int(f"pay__{s}")
            hourly = z3.Real(f"hourly__{s}")
            growth = z3.Int(f"growth__{s}")
            jobs = z3.Int(f"jobs__{s}")
            change = z3.Int(f"change__{s}")
            jobs2033 = z3.Int(f"jobs2033__{s}")
            openings = z3.Int(f"openings__{s}")
            has_pay = z3.Bool(f"has_pay__{s}")
            education = z3.Int(f"education__{s}")
            wexp = z3.Int(f"work_experience__{s}")
            training = z3.Int(f"training__{s}")

            self.pay[row.title] = pay
            self.hourly[row.title] = hourly
            self.growth[row.title] = growth
            self.jobs[row.title] = jobs
            self.change[row.title] = change
            self.jobs2033[row.title] = jobs2033
            self.openings[row.title] = openings
            self.has_pay[row.title] = has_pay
            self.education[row.title] = education
            self.work_experience[row.title] = wexp
            self.training[row.title] = training

            if row.annual is None:
                self._add(has_pay == False)  # noqa: E712 - Z3 BoolRef
            else:
                self._add(has_pay == True)  # noqa: E712
                if row.annual_censored:
                    # "equal to or greater than $239,200" is a lower bound.
                    self._add(pay >= row.annual)
                else:
                    self._add(pay == row.annual)
            if row.hourly is not None:
                self._add(hourly == z3.RealVal(row.hourly))
            self._add(growth == row.outlook_pct)
            self._add(jobs == row.jobs)
            self._add(change == row.change)
            self._add(jobs2033 == jobs + change)
            self._add(openings == row.annual_openings)
            self._add(education == self.string_code(row.education))
            self._add(wexp == self.string_code(row.work_experience))
            self._add(training == self.string_code(row.training))

        self.solver.add(*self._assertions)

    # ------------------------------------------------------------------
    # Expressions
    # ------------------------------------------------------------------
    def field_expr(self, entity: str, field: str) -> z3.ExprRef:
        if field == "annual":
            return self.pay[entity]
        if field == "hourly":
            return self.hourly[entity]
        if field == "outlook_pct":
            return self.growth[entity]
        if field == "jobs":
            return self.jobs[entity]
        if field == "change":
            return self.change[entity]
        if field == "jobs2033":
            return self.jobs2033[entity]
        if field == "annual_openings":
            return self.openings[entity]
        if field == "education":
            return self.education[entity]
        if field == "work_experience":
            return self.work_experience[entity]
        if field == "training":
            return self.training[entity]
        raise KeyError(f"unknown field {field!r}")

    def defined(self, entity: str, field: str) -> z3.BoolRef:
        if field == "annual":
            return self.has_pay[entity]
        return z3.BoolVal(True)

    def filter_atom(self, row: Row, f: Filter) -> z3.BoolRef:
        if f.all_of:
            return z3.And(*[self.filter_atom(row, sub) for sub in f.all_of])
        expr = self.field_expr(row.title, f.field)
        defined = self.defined(row.title, f.field)
        if isinstance(f.value, str):
            code = z3.IntVal(self.string_code(f.value))
            core = expr == code
            if f.op == "!=":
                core = expr != code
            return z3.And(defined, core)
        rhs = _z3_num(f.value)
        op = {
            ">": expr > rhs,
            ">=": expr >= rhs,
            "<": expr < rhs,
            "<=": expr <= rhs,
            "=": expr == rhs,
            "!=": expr != rhs,
        }[f.op]
        return z3.And(defined, op)

    def _candidates(self, field: str | None, cs: CandidateSet | None) -> list[Row]:
        cs = cs or CandidateSet("all")
        if cs.kind == "all":
            rows = list(self.dataset.rows)
        elif cs.kind == "paid":
            rows = list(self.dataset.paid)
        elif cs.kind == "select":
            rows = [self.dataset.by_title[t] for t in cs.select if t in self.dataset.by_title]
        else:
            raise ValueError(f"unknown candidate set {cs.kind!r}")
        if field == "annual":
            rows = [r for r in rows if r.has_annual]
        return rows

    def metric_expr(self, entity: str, metric: Metric) -> z3.ExprRef:
        parts: list[z3.ExprRef] = []
        for field, weight in metric.weights:
            expr = self.field_expr(entity, field)
            if expr.sort() == z3.IntSort():
                expr = z3.ToReal(expr)
            parts.append(z3.RealVal(weight) * expr)
        if not parts:
            return z3.RealVal(0)
        return z3.Sum(parts)

    def _term(self, term: Term, defined: list[z3.BoolRef]) -> z3.ExprRef:
        if term.kind == "const":
            assert term.value is not None
            if isinstance(term.value, str):
                return z3.IntVal(self.string_code(term.value))
            return _z3_const(term.value)
        if term.kind == "field":
            assert term.entity and term.field
            defined.append(self.defined(term.entity, term.field))
            return self.field_expr(term.entity, term.field)
        if term.kind == "diff":
            a = self._term(term.terms[0], defined)
            b = self._term(term.terms[1], defined)
            return a - b
        if term.kind == "absdiff":
            a = self._term(term.terms[0], defined)
            b = self._term(term.terms[1], defined)
            return z3.Abs(a - b)
        if term.kind == "sum":
            return z3.Sum([self._term(t, defined) for t in term.terms])
        if term.kind == "count":
            cs = term.candidate_set or CandidateSet("all")
            rows = self._candidates(term.field, cs)
            return z3.Sum(
                [
                    z3.If(self._eligible(row, term.field, term.filter), 1, 0)
                    for row in rows
                ]
            )
        if term.kind == "quantified":
            cs = term.candidate_set or CandidateSet("all")
            fields: set[str] = set()
            if term.filter is not None:
                fields |= filter_fields(term.filter)
            if term.condition is not None:
                fields |= filter_fields(term.condition)
            base_field = "annual" if "annual" in fields else term.field
            rows = self._candidates(base_field, cs)
            population = [
                self._eligible(row, term.field, term.filter) for row in rows
            ]
            condition = [
                self.filter_atom(row, term.condition) if term.condition else z3.BoolVal(True)
                for row in rows
            ]
            matching = z3.Sum(
                [z3.If(z3.And(pop, cond), 1, 0) for pop, cond in zip(population, condition)]
            )
            total = z3.Sum([z3.If(pop, 1, 0) for pop in population])
            assert term.threshold_num is not None and term.threshold_den is not None
            return term.threshold_den * matching - term.threshold_num * total
        if term.kind == "metric":
            assert term.entity and term.metric
            return self.metric_expr(term.entity, term.metric)
        raise ValueError(f"cannot compile term kind {term.kind!r}")

    def _eligible(
        self, row: Row, field: str | None, f: Filter | None
    ) -> z3.BoolRef:
        conds: list[z3.BoolRef] = []
        if field is not None:
            conds.append(self.defined(row.title, field))
        if f is not None:
            conds.append(self.filter_atom(row, f))
        if not conds:
            return z3.BoolVal(True)
        return z3.And(*conds)

    def _eligible_metric(self, row: Row, metric: Metric, f: Filter | None) -> z3.BoolRef:
        conds: list[z3.BoolRef] = [self.defined(row.title, field) for field, _ in metric.weights]
        if f is not None:
            conds.append(self.filter_atom(row, f))
        return z3.And(*conds) if conds else z3.BoolVal(True)

    def _argmax_claim(self, claim: Claim) -> z3.BoolRef:
        term = claim.lhs
        assert term.kind in ("argmax", "argmin", "metric_argmax", "metric_argmin")
        is_metric = term.kind.startswith("metric_")
        if is_metric:
            assert term.metric
            fields = {f for f, _ in term.metric.weights}
            rows = self._candidates("annual" if "annual" in fields else None, term.candidate_set)
        else:
            assert term.field
            rows = self._candidates(term.field, term.candidate_set)
        winner = str(claim.rhs.value)
        titles = {r.title for r in rows}
        if winner not in titles:
            return z3.BoolVal(False)
        wrow = self.dataset.by_title[winner]
        if is_metric:
            conds: list[z3.BoolRef] = [self._eligible_metric(wrow, term.metric, term.filter)]
            value = self.metric_expr(winner, term.metric)
        else:
            conds = [self._eligible(wrow, term.field, term.filter)]
            value = self.field_expr(winner, term.field)
        for row in rows:
            if row.title == winner:
                continue
            if is_metric:
                eligible = self._eligible_metric(row, term.metric, term.filter)
                other = self.metric_expr(row.title, term.metric)
            else:
                eligible = self._eligible(row, term.field, term.filter)
                other = self.field_expr(row.title, term.field)
            if term.kind in ("argmax", "metric_argmax"):
                conds.append(z3.Implies(eligible, value >= other))
            else:
                conds.append(z3.Implies(eligible, value <= other))
        return z3.And(*conds)

    def compile_claim(self, claim: Claim) -> z3.BoolRef:
        if claim.lhs.kind in ("argmax", "argmin", "metric_argmax", "metric_argmin"):
            return self._argmax_claim(claim)
        defined: list[z3.BoolRef] = []
        lhs = self._term(claim.lhs, defined)
        rhs = self._term(claim.rhs, defined)
        op = {
            "=": lhs == rhs,
            "!=": lhs != rhs,
            ">": lhs > rhs,
            ">=": lhs >= rhs,
            "<": lhs < rhs,
            "<=": lhs <= rhs,
        }[claim.op]
        if not defined:
            return op
        return z3.And(*defined, op)

    # ------------------------------------------------------------------
    # Checks
    # ------------------------------------------------------------------
    def check_claim(self, claim: Claim) -> ClaimCheck:
        start = time.perf_counter()
        try:
            c = self.compile_claim(claim)
        except Exception as exc:  # pragma: no cover - defensive
            return ClaimCheck(
                claim=claim,
                verdict="NOT_FORMALIZABLE",
                reason=f"claim compile failed: {exc}",
            )

        self.solver.push()
        self.solver.add(c)
        r_pos = self.solver.check()
        model_pos = self.solver.model() if r_pos == z3.sat else None
        self.solver.pop()

        self.solver.push()
        self.solver.add(z3.Not(c))
        r_neg = self.solver.check()
        model_neg = self.solver.model() if r_neg == z3.sat else None
        self.solver.pop()

        elapsed = (time.perf_counter() - start) * 1000
        if r_pos == z3.unsat:
            return ClaimCheck(
                claim=claim,
                verdict="CONTRADICTION",
                reason="premises are inconsistent with the claim",
                counterexample=self.explain(claim),
            )
        if r_neg == z3.unsat:
            return ClaimCheck(
                claim=claim,
                verdict="ENTAILED",
                reason="premises entail the claim",
            )
        return ClaimCheck(
            claim=claim,
            verdict="UNKNOWN",
            reason="premises neither entail nor contradict the claim",
            counterexample={
                "model": self.model_values(model_neg, claim),
                "expected": self.explain(claim),
                "runtime_ms": round(elapsed, 3),
            },
        )

    def model_values(self, model: z3.ModelRef | None, claim: Claim) -> dict[str, object]:
        if model is None:
            return {}
        out: dict[str, object] = {}
        for entity in self.relevant_entities(claim):
            for field in ("annual", "outlook_pct", "jobs", "change", "jobs2033", "annual_openings"):
                try:
                    expr = self.field_expr(entity, field)
                except KeyError:
                    continue
                val = model.eval(expr, model_completion=True)
                out[f"{entity}.{field}"] = _model_value(val)
            try:
                hp = model.eval(self.has_pay[entity], model_completion=True)
                out[f"{entity}.has_annual"] = z3.is_true(hp)
            except KeyError:
                pass
        return out

    def relevant_entities(self, claim: Claim) -> list[str]:
        found: list[str] = []

        def walk(term: Term) -> None:
            if term.kind == "field" and term.entity and term.entity not in found:
                found.append(term.entity)
            if term.kind == "metric" and term.entity and term.entity not in found:
                found.append(term.entity)
            if term.kind in ("argmax", "argmin", "metric_argmax", "metric_argmin"):
                cs = term.candidate_set or CandidateSet("all")
                if cs.kind == "select":
                    for t in cs.select:
                        if t not in found:
                            found.append(t)
                if isinstance(claim.rhs.value, str) and claim.rhs.value not in found:
                    found.append(claim.rhs.value)
            for sub in term.terms:
                walk(sub)

        walk(claim.lhs)
        walk(claim.rhs)
        return found[:8]

    def explain(self, claim: Claim) -> dict[str, object]:
        """Deterministic Python-side expected value, for readable failures."""
        try:
            actual = self.eval_term(claim.lhs)
        except Exception:
            actual = None
        claimed = claim.rhs.value
        return {
            "claim": str(claim),
            "claimed": claimed,
            "actual": actual,
            "actual_winner": actual
            if claim.lhs.kind in ("argmax", "argmin", "metric_argmax", "metric_argmin")
            else None,
        }

    def eval_term(self, term: Term) -> object:
        if term.kind == "const":
            return term.value
        if term.kind == "field":
            assert term.entity and term.field
            return field_value(self.dataset.by_title[term.entity], term.field)
        if term.kind == "diff":
            a = self.eval_term(term.terms[0])
            b = self.eval_term(term.terms[1])
            return a - b  # type: ignore[operator]
        if term.kind == "absdiff":
            a = self.eval_term(term.terms[0])
            b = self.eval_term(term.terms[1])
            return abs(a - b)  # type: ignore[operator]
        if term.kind == "sum":
            return sum(self.eval_term(t) for t in term.terms)  # type: ignore[arg-type]
        if term.kind == "count":
            cs = term.candidate_set or CandidateSet("all")
            rows = self._candidates(term.field, cs)
            return sum(1 for r in rows if term.filter is None or filter_matches(r, term.filter))
        if term.kind == "quantified":
            cs = term.candidate_set or CandidateSet("all")
            fields: set[str] = set()
            if term.filter is not None:
                fields |= filter_fields(term.filter)
            if term.condition is not None:
                fields |= filter_fields(term.condition)
            base_field = "annual" if "annual" in fields else term.field
            rows = self._candidates(base_field, cs)
            base = [r for r in rows if term.filter is None or filter_matches(r, term.filter)]
            matching = [
                r for r in base if term.condition is None or filter_matches(r, term.condition)
            ]
            assert term.threshold_num is not None and term.threshold_den is not None
            return term.threshold_den * len(matching) - term.threshold_num * len(base)
        if term.kind == "metric":
            assert term.entity and term.metric
            return metric_score(self.dataset.by_title[term.entity], term.metric)
        if term.kind in ("argmax", "argmin"):
            assert term.field
            cs = term.candidate_set or CandidateSet("all")
            rows = self._candidates(term.field, cs)
            if term.filter is not None:
                rows = [r for r in rows if filter_matches(r, term.filter)]
            if not rows:
                return None
            ordered = sorted(rows, key=lambda r: (field_value(r, term.field), r.title))  # type: ignore[arg-type]
            return (ordered[-1] if term.kind == "argmax" else ordered[0]).title
        if term.kind in ("metric_argmax", "metric_argmin"):
            assert term.metric
            cs = term.candidate_set or CandidateSet("all")
            fields = {f for f, _ in term.metric.weights}
            rows = self._candidates("annual" if "annual" in fields else None, cs)
            if term.filter is not None:
                rows = [r for r in rows if filter_matches(r, term.filter)]
            if not rows:
                return None
            ordered = sorted(rows, key=lambda r: (metric_score(r, term.metric), r.title))
            return (ordered[-1] if term.kind == "metric_argmax" else ordered[0]).title
        raise ValueError(f"cannot evaluate term kind {term.kind!r}")


def _model_value(val: z3.ExprRef) -> object:
    if z3.is_int_value(val):
        return val.as_long()
    if z3.is_rational_value(val):
        return float(val.numerator_as_long()) / float(val.denominator_as_long())
    if z3.is_string_value(val):
        return val.as_string()
    if z3.is_true(val):
        return True
    if z3.is_false(val):
        return False
    return str(val)


def _sub_qirs(qir: QIR) -> list[QIR]:
    if qir.kind == "partial":
        out: list[QIR] = []
        for part in qir.parts:
            out.extend(_sub_qirs(part))
        return out
    if qir.kind == "compare":
        return [qir, qir]
    if qir.kind in ("extremum", "rank"):
        return [qir, qir]
    return [qir]


def _term_is_field(term: Term, entity: str, field: str) -> bool:
    return term.kind == "field" and term.entity == entity and term.field == field


def _shape_ok(
    claim: Claim,
    sub: QIR,
    index: int,
    winner_hint: str | None = None,
) -> tuple[bool, str]:
    """Structural relevance: does the claim answer THIS question?

    A true claim about the wrong field, wrong candidate set, or unfiltered set
    is not an answer.  This check is what stops "drop the filter" from being
    certified as ENTAILED.
    """
    if sub.kind == "lookup":
        assert sub.entity and sub.field
        ok = (
            _term_is_field(claim.lhs, sub.entity, sub.field)
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "lookup claim must be entity.field = const")

    if sub.kind == "difference":
        assert sub.field and len(sub.entities) == 2
        a, b = sub.entities
        lhs = claim.lhs
        ok = (
            lhs.kind in ("absdiff", "diff")
            and len(lhs.terms) == 2
            and _term_is_field(lhs.terms[0], a, sub.field)
            and _term_is_field(lhs.terms[1], b, sub.field)
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "difference claim must be |a.field - b.field| = const")

    if sub.kind == "sum":
        assert sub.field and sub.entities
        lhs = claim.lhs
        ok = (
            lhs.kind == "sum"
            and len(lhs.terms) == len(sub.entities)
            and all(
                _term_is_field(t, e, sub.field)
                for t, e in zip(lhs.terms, sub.entities)
            )
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "sum claim must be sum(entity.field) = const")

    if sub.kind == "count":
        lhs = claim.lhs
        ok = (
            lhs.kind == "count"
            and lhs.candidate_set == sub.candidate_set
            and lhs.filter == sub.filter
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "count claim must use the question's candidate set and filter")

    if sub.kind == "quantified":
        lhs = claim.lhs
        ok = (
            lhs.kind == "quantified"
            and lhs.candidate_set == sub.candidate_set
            and lhs.filter == sub.filter
            and lhs.condition == sub.condition
            and lhs.threshold_num == sub.threshold_num
            and lhs.threshold_den == sub.threshold_den
            and claim.op in (">", "<=")
            and claim.rhs.kind == "const"
            and claim.rhs.value == 0
        )
        return (ok, "quantified claim must use the question's policy, candidates and filter")

    if sub.kind == "rank":
        assert sub.metric
        if index == 0:
            lhs = claim.lhs
            expected_kind = "metric_argmax" if sub.op == "max" else "metric_argmin"
            ok = (
                lhs.kind == expected_kind
                and lhs.metric == sub.metric
                and lhs.candidate_set == sub.candidate_set
                and claim.op == "="
                and claim.rhs.kind == "const"
            )
            return (ok, "rank claim must use the question's metric and candidate set")
        winner = winner_hint
        ok = (
            winner is not None
            and claim.lhs.kind == "metric"
            and claim.lhs.entity == winner
            and claim.lhs.metric == sub.metric
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "rank score claim must be winner.metric = const")

    if sub.kind == "compare":
        assert sub.field and len(sub.entities) == 2
        a, b = sub.entities
        if index == 0:
            ok = (
                claim.lhs.kind == "field"
                and claim.rhs.kind == "field"
                and claim.op in (">", "<")
                and {claim.lhs.entity, claim.rhs.entity} == {a, b}
                and claim.lhs.field == claim.rhs.field == sub.field
            )
            return (ok, "comparison claim must compare the two entities' field")
        lhs = claim.lhs
        ok = (
            lhs.kind in ("diff", "absdiff")
            and len(lhs.terms) == 2
            and {lhs.terms[0].entity, lhs.terms[1].entity} == {a, b}
            and all(t.field == sub.field for t in lhs.terms)
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "comparison difference must use the two entities' field")

    if sub.kind == "extremum":
        assert sub.field
        if index == 0:
            lhs = claim.lhs
            expected_kind = "argmax" if sub.op == "max" else "argmin"
            ok = (
                lhs.kind == expected_kind
                and lhs.field == sub.field
                and lhs.candidate_set == sub.candidate_set
                and lhs.filter == sub.filter
                and claim.op == "="
                and claim.rhs.kind == "const"
            )
            return (ok, "extremum claim must use the question's field, candidates and filter")
        winner = winner_hint
        ok = (
            winner is not None
            and _term_is_field(claim.lhs, winner, sub.field)
            and claim.op == "="
            and claim.rhs.kind == "const"
        )
        return (ok, "extremum value claim must be winner.field = const")

    return (True, "")


def verify_question(
    qir: QIR,
    dataset: Dataset,
    premises: Premises | None = None,
    registry: SpecRegistry | None = None,
    overrides: dict[str, object] | None = None,
    allow_defaults: bool = True,
):
    """Close, derive and check in one call.

    Use this when the caller has a QIR with unresolved slots.  The returned
    resolution carries the closed QIR and the assumptions; the verification is
    the formal verdict.
    """
    from .compile import derive_answer

    premises = premises or Premises(dataset)
    resolution = close_qir(
        qir,
        registry=registry,
        overrides=overrides,
        allow_defaults=allow_defaults,
    )
    answer = derive_answer(resolution.qir, dataset)
    verification = check_answer(resolution.qir, answer, premises)
    return resolution, answer, verification


def _aggregate(verdicts: list[str]) -> str:
    if not verdicts:
        return "INCOMPLETE"
    if "CONTRADICTION" in verdicts:
        return "CONTRADICTION"
    if "NOT_FORMALIZABLE" in verdicts:
        return "NOT_FORMALIZABLE"
    if "NEEDS_SPECIFICATION" in verdicts:
        return "NEEDS_SPECIFICATION"
    if "UNKNOWN" in verdicts:
        return "UNKNOWN"
    if "INCOMPLETE" in verdicts:
        return "INCOMPLETE"
    if all(v == "ABSENT_CONFIRMED" for v in verdicts):
        return "ABSENT_CONFIRMED"
    if all(v == "NOT_FOUND_IN_CORPUS" for v in verdicts):
        return "NOT_FOUND_IN_CORPUS"
    if all(v in ("ENTAILED", "ABSENT_CONFIRMED", "ENTAILED_UNDER_ASSUMPTIONS") for v in verdicts):
        if "ENTAILED_UNDER_ASSUMPTIONS" in verdicts:
            return "ENTAILED_UNDER_ASSUMPTIONS"
        return "ENTAILED"
    return "INCOMPLETE"


def check_answer(
    qir: QIR,
    answer: AnswerIR,
    premises: Premises,
    coverage_receipts: tuple[CoverageReceipt, ...] = (),
) -> Verification:
    """Check a CLOSED QIR.  Unclosed QIRs return NEEDS_SPECIFICATION.

    Use ``verify_question`` to close, derive and check in one call.  Corpus
    absence requires a matching coverage receipt; without one it stays
    NEEDS_SPECIFICATION.
    """
    start = time.perf_counter()
    assumptions: tuple[Assumption, ...] = ()
    spec_id: str | None = None

    if any(node.unresolved for node in qir.walk()):
        holes = tuple(h for node in qir.walk() for h in node.unresolved)
        return Verification(
            verdict="NEEDS_SPECIFICATION",
            reason="unclosed QIR: "
            + ", ".join(f"{u.kind}:{u.symbol}" for u in holes)
            + "; call close_qir or verify_question first",
            unresolved=holes,
            runtime_ms=(time.perf_counter() - start) * 1000,
        )

    if qir.spec is not None:
        assumptions = tuple(
            Assumption(
                key=e.key,
                value=e.value,
                source=e.source,
                rationale=e.rationale,
                version=e.version,
            )
            for e in qir.spec.entries
        )
        spec_id = qir.spec.digest()

    if qir.kind == "not_formalizable":
        return Verification(
            verdict="NOT_FORMALIZABLE",
            reason=qir.reason or "question has no deterministic compiler",
            assumptions=assumptions,
            spec_id=spec_id,
            runtime_ms=(time.perf_counter() - start) * 1000,
        )

    subs = _sub_qirs(qir)
    if len(answer.parts) != len(subs):
        return Verification(
            verdict="INCOMPLETE",
            reason=f"answer has {len(answer.parts)} part(s), question requires {len(subs)}",
            runtime_ms=(time.perf_counter() - start) * 1000,
        )

    checks: list[ClaimCheck] = []
    verdicts: list[str] = []
    winner_hint: str | None = None
    for i, sub in enumerate(subs):
        part = answer.parts[i]
        if sub.kind == "not_formalizable":
            verdicts.append("NOT_FORMALIZABLE")
            checks.append(
                ClaimCheck(
                    claim=None,
                    verdict="NOT_FORMALIZABLE",
                    reason=sub.reason or "question has no deterministic compiler",
                    part_id=part.part_id,
                )
            )
            continue
        if sub.kind == "absence":
            # A corpus-scoped absence is not schema absence.  It requires an
            # exhaustive search and a coverage receipt; until one is attached,
            # the honest verdict is NEEDS_SPECIFICATION, never ABSENT_CONFIRMED.
            if sub.corpus_id is not None:
                receipt = next(
                    (r for r in coverage_receipts if r.corpus_id == sub.corpus_id),
                    None,
                )
                if receipt is None:
                    verdicts.append("NEEDS_SPECIFICATION")
                    checks.append(
                        ClaimCheck(
                            claim=None,
                            verdict="NEEDS_SPECIFICATION",
                            reason="corpus absence requires a coverage receipt",
                            part_id=part.part_id,
                        )
                    )
                    continue
                verdict = absence_from_receipt(receipt)
                verdicts.append(verdict)
                checks.append(
                    ClaimCheck(
                        claim=None,
                        verdict=verdict,
                        reason=(
                            f"{receipt.corpus_id}: {receipt.hits} hit(s) in "
                            f"{receipt.files_searched} file(s)"
                        ),
                        part_id=part.part_id,
                    )
                )
                continue
            if part.status == "not_stated" and not schema_has(
                sub.field or "", sub.scope.kind if sub.scope else None
            ):
                verdicts.append("ABSENT_CONFIRMED")
                checks.append(
                    ClaimCheck(
                        claim=None,
                        verdict="ABSENT_CONFIRMED",
                        reason=f"schema absence: {sub.reason}",
                        part_id=part.part_id,
                    )
                )
            elif part.claim is not None:
                verdicts.append("INCOMPLETE")
                checks.append(
                    ClaimCheck(
                        claim=part.claim,
                        verdict="INCOMPLETE",
                        reason="answer asserts a value for a field outside the snapshot schema",
                        counterexample={"schema": "field/scope not in snapshot", "field": sub.field},
                        part_id=part.part_id,
                    )
                )
            else:
                verdicts.append("UNKNOWN")
                checks.append(
                    ClaimCheck(
                        claim=None,
                        verdict="UNKNOWN",
                        reason="answer does not state the absent part",
                        part_id=part.part_id,
                    )
                )
            continue

        if part.status == "not_stated":
            # A lookup on a field the row genuinely does not carry (the two
            # N/A pay rows) is a confirmed absence, not a missing answer.
            row = premises.dataset.by_title.get(sub.entity or "")
            if (
                sub.kind == "lookup"
                and sub.field == "annual"
                and row is not None
                and row.annual is None
            ):
                verdicts.append("ABSENT_CONFIRMED")
                checks.append(
                    ClaimCheck(
                        claim=None,
                        verdict="ABSENT_CONFIRMED",
                        reason="the row reports no median annual pay (N/A)",
                        part_id=part.part_id,
                    )
                )
            else:
                verdicts.append("INCOMPLETE")
                checks.append(
                    ClaimCheck(
                        claim=None,
                        verdict="INCOMPLETE",
                        reason="answer omits a required stated part",
                        part_id=part.part_id,
                    )
                )
            continue
        if part.status == "unknown":
            verdicts.append("UNKNOWN")
            checks.append(
                ClaimCheck(
                    claim=None,
                    verdict="UNKNOWN",
                    reason=part.note or "answer marks the part unknown",
                    part_id=part.part_id,
                )
            )
            continue
        if part.claim is None:
            verdicts.append("INCOMPLETE")
            checks.append(
                ClaimCheck(
                    claim=None,
                    verdict="INCOMPLETE",
                    reason="stated part carries no claim",
                    part_id=part.part_id,
                )
            )
            continue

        shape_ok, shape_reason = _shape_ok(part.claim, sub, i, winner_hint)
        if not shape_ok:
            checks.append(
                ClaimCheck(
                    claim=part.claim,
                    verdict="INCOMPLETE",
                    reason=f"claim does not answer the question: {shape_reason}",
                    part_id=part.part_id,
                )
            )
            verdicts.append("INCOMPLETE")
            continue

        check = premises.check_claim(part.claim)
        check = replace(check, part_id=part.part_id)
        checks.append(check)
        verdicts.append(check.verdict)
        if sub.kind in ("extremum", "rank") and i == 0 and part.claim.rhs.kind == "const":
            winner_hint = str(part.claim.rhs.value)

    verdict = _aggregate(verdicts)
    if verdict == "ENTAILED" and assumptions:
        verdict = "ENTAILED_UNDER_ASSUMPTIONS"
    reason = "; ".join(f"{c.part_id}:{c.verdict}" for c in checks)
    counterexample = next((c.counterexample for c in checks if c.counterexample), None)
    return Verification(
        verdict=verdict,
        checks=tuple(checks),
        reason=reason,
        counterexample=counterexample,
        runtime_ms=(time.perf_counter() - start) * 1000,
        assumptions=assumptions,
        spec_id=spec_id,
        coverage_receipts=coverage_receipts,
    )
