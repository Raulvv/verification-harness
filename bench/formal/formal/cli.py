"""Tiny CLI for the specification layer.

This is a demo of the Phase 0/1 path, not a general prose parser.  It recognizes
the worked-example templates and routes them through close_qir + verify_question.

    .venv/bin/python -m formal.cli "This is the best career for someone who wants stability."
    .venv/bin/python -m formal.cli --json "..."
    echo '{"question":"...","no_defaults":false}' | .venv/bin/python -m formal.cli --stdin-json
"""

from __future__ import annotations

import argparse
import json
import re
import sys

from .model import Assumption, Metric, QIR, SpecEntry
from .nli import CommandNLI, route_with_fallback
from .router import route_verification
from .rows import build_dataset
from .spec import SpecRegistry
from .spec_examples import (
    best_stability,
    causal_question,
    difference_direction,
    most_bachelors_pay_over_60k,
    normative_question,
    open_world_absence,
    pay_unit,
)
from .z3check import Premises, verify_question

FIELD_HUMAN = {
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


def _fmt_num(value: float | int) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return f"{value:g}" if isinstance(value, float) else str(value)


def _as_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if hasattr(value, "__dataclass_fields__"):
        return {k: getattr(value, k) for k in value.__dataclass_fields__}
    return {}


def humanize_spec_value(key: str, value) -> str:
    """Turn a raw spec value into the sentence a human can read."""
    kind = key.split(":", 1)[0] if ":" in key else ""

    if kind == "quantifier":
        data = _as_dict(value)
        name = str(data.get("name", ""))
        num = data.get("threshold_num")
        den = data.get("threshold_den")
        if name == "majority" and num == 1 and den == 2:
            return "majority (>50%)"
        if num is not None and den not in (None, 0):
            pct = 100.0 * float(num) / float(den)
            return f"at least {pct:g}%"
        if name == "plurality":
            return "plurality (the largest share)"
        return name or "a quantifier policy"

    if kind == "metric":
        data = _as_dict(value)
        weights = data.get("weights") or ()
        parts = []
        for field, weight in weights:
            parts.append(f"{_fmt_num(float(weight))}×{FIELD_HUMAN.get(field, field)}")
        return " + ".join(parts) if parts else str(data.get("name", "metric"))

    if kind == "utility":
        data = _as_dict(value)
        name = str(data.get("name", ""))
        metric = data.get("metric")
        direction = "highest" if name == "max" else "lowest"
        return f"{direction} {metric} score" if metric else f"{direction} score"

    if kind == "unit":
        return {"annual": "annual pay", "hourly": "hourly pay"}.get(str(value), str(value))

    if kind == "direction":
        return {
            "symmetric": "absolute (symmetric) difference",
            "signed": "signed difference (first − second)",
        }.get(str(value), str(value))

    if kind in ("scope", "corpus"):
        return f"declared corpus {value}"

    if kind == "model":
        return f"causal model {value}"

    if kind == "theory":
        return f"normative theory {value}"

    return f"{key} = {value}"


def humanize_assumption(assumption: Assumption) -> str:
    label = assumption.key.split(":", 1)[1] if ":" in assumption.key else assumption.key
    return f"{label} = {humanize_spec_value(assumption.key, assumption.value)}"


def assumption_line(assumption: Assumption) -> str:
    return f"{humanize_assumption(assumption)} [{assumption.source}]"


def _find_assumption(verification, prefix: str) -> Assumption | None:
    for assumption in verification.assumptions:
        if assumption.key.startswith(prefix):
            return assumption
    return None


def _humanize_allowed(hole) -> str:
    labels = {
        "majority": "majority (>50%)",
        "threshold": "a specific threshold",
        "plurality": "plurality (the largest share)",
        "symmetric": "absolute (symmetric) difference",
        "signed": "signed difference (first − second)",
        "annual": "annual pay",
        "hourly": "hourly pay",
        "corpus_id": "a declared corpus id",
        "causal_model": "a causal model",
        "normative_theory": "a normative theory",
    }
    return ", ".join(labels.get(x, x) for x in hole.allowed)


def route_question(question: str) -> QIR:
    """Deterministic demo router for the Phase 0/1 worked examples."""
    q = question.lower()
    if "most" in q and "bachelor" in q and ("60,000" in q or "60000" in q):
        return most_bachelors_pay_over_60k()
    if "best" in q and "stability" in q:
        return best_stability()
    if "difference" in q and "chefs" in q and "accountants" in q:
        return difference_direction()
    if "pay" in q and "electricians" in q and "difference" not in q:
        return pay_unit()
    if "because" in q and "unionization" in q:
        return causal_question()
    if "fair" in q:
        return normative_question()
    if "no source" in q and "new york" in q:
        return open_world_absence()
    return QIR(
        qid="cli",
        question=question,
        kind="not_formalizable",
        formalizable=False,
        reason="CLI demo only recognizes the specification-layer worked examples",
    )


def _quantified_answer(answer, verification) -> str:
    note = answer.parts[0].note or ""
    m = re.search(r"matching=(\d+) total=(\d+)", note)
    if not m:
        return verification.reason
    matching, total = int(m.group(1)), int(m.group(2))
    pct = (100.0 * matching / total) if total else 0.0
    if verification.verdict in ("ENTAILED", "ENTAILED_UNDER_ASSUMPTIONS"):
        verdict_word = "Yes"
    elif verification.verdict == "CONTRADICTION":
        verdict_word = "No"
    else:
        verdict_word = "Undetermined"
    qass = _find_assumption(verification, "quantifier:")
    qualifier = ""
    if qass is not None:
        qualifier = (
            f", under the {'default ' if qass.source == 'default' else ''}"
            f"definition `{humanize_assumption(qass)}`"
        )
    return (
        f"{verdict_word} — {matching} of {total} matching occupations "
        f"({pct:.1f}%) satisfy the condition{qualifier}."
    )


def human_answer(qir: QIR, answer, verification) -> str:
    if verification.verdict == "NEEDS_SPECIFICATION":
        if not verification.unresolved:
            return "I need a specification first."
        hole = verification.unresolved[0]
        allowed = _humanize_allowed(hole)
        return f"I need a definition for '{hole.symbol}': {allowed}?"
    if verification.verdict == "NOT_FORMALIZABLE":
        return "Not formalizable under the current formal theory."
    if qir.kind == "quantified":
        return _quantified_answer(answer, verification)
    if qir.kind == "rank" and answer.parts:
        claim = answer.parts[0].claim
        winner = claim.rhs.value if claim else "?"
        metric_ass = _find_assumption(verification, "metric:")
        utility_ass = _find_assumption(verification, "utility:")
        score = answer.parts[1].claim.rhs.value if len(answer.parts) > 1 else "?"
        definitions = []
        sources = []
        if metric_ass is not None:
            definitions.append(f"`{humanize_assumption(metric_ass)}`")
            sources.append(metric_ass.source)
        if utility_ass is not None:
            definitions.append(f"`{humanize_assumption(utility_ass)}`")
            sources.append(utility_ass.source)
        if definitions:
            kind = "default " if sources and all(s == "default" for s in sources) else ""
            return (
                f"Using the {kind}definitions {', '.join(definitions)}, the "
                f"top-ranked occupation is {winner} (score {score})."
            )
        return f"The top-ranked occupation is {winner} (score {score})."
    if qir.kind == "difference" and answer.parts:
        claim = answer.parts[0].claim
        dass = _find_assumption(verification, "direction:")
        qualifier = f" (using {humanize_assumption(dass)})" if dass is not None else ""
        return f"The difference is {claim.rhs.value}{qualifier}."
    if qir.kind == "lookup" and answer.parts:
        claim = answer.parts[0].claim
        if claim and claim.lhs.kind == "field":
            uass = _find_assumption(verification, "unit:")
            qualifier = f" (using {humanize_assumption(uass)})" if uass is not None else ""
            return f"{claim.lhs.entity} {claim.lhs.field} is {claim.rhs.value}{qualifier}."
    if qir.kind == "absence":
        if qir.corpus_id:
            return "Not found in the declared corpus (coverage receipt required)."
        return "Not stated in the snapshot."
    return verification.reason


def _assumptions_json(verification) -> list[dict]:
    out = []
    for a in verification.assumptions:
        item = a.to_dict()
        item["human"] = humanize_assumption(a)
        out.append(item)
    return out


def _citations_json(answer) -> list[dict]:
    out: list[dict] = []
    for part in answer.parts:
        for citation in part.citations:
            item = citation.to_dict()
            if item not in out:
                out.append(item)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Specification-layer demo CLI")
    parser.add_argument("question", nargs="?", help="natural-language question")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--stdin-json",
        action="store_true",
        help="read {question,no_defaults} from stdin and emit JSON",
    )
    parser.add_argument("--no-defaults", action="store_true", help="require explicit specs")
    parser.add_argument(
        "--max-citations",
        type=int,
        default=8,
        help="max evidence quotes to print in human output",
    )
    parser.add_argument(
        "--nli-cmd",
        help="optional command for the fallback_nli route (JSON stdin/stdout)",
    )
    args = parser.parse_args(argv)

    if args.stdin_json:
        payload = json.loads(sys.stdin.read() or "{}")
        args.question = payload.get("question", args.question)
        args.no_defaults = bool(payload.get("no_defaults", args.no_defaults))
    if not args.question:
        parser.error("no question (pass one, or use --stdin-json)")

    dataset = build_dataset()
    premises = Premises(dataset)
    registry = SpecRegistry()
    qir = route_question(args.question)
    resolution, answer, verification = verify_question(
        qir,
        dataset,
        premises=premises,
        registry=registry,
        allow_defaults=not args.no_defaults,
    )
    answer_text = human_answer(resolution.qir, answer, verification)
    assumptions = _assumptions_json(verification)
    citations = _citations_json(answer)
    route = route_verification(verification)
    nli_result = None
    if route.action == "fallback_nli" and args.nli_cmd:
        evidence = "\n".join(str(c.get("quote", "")) for c in citations)
        decision = route_with_fallback(
            verification,
            args.question,
            answer_text,
            evidence,
            CommandNLI(args.nli_cmd),
        )
        route = decision.route
        nli_result = decision.nli

    if args.json or args.stdin_json:
        print(
            json.dumps(
                {
                    "question": args.question,
                    "answer": answer_text,
                    "verdict": verification.verdict,
                    "route": route.to_dict(),
                    "nli": nli_result.to_dict() if nli_result else None,
                    "assumptions": assumptions,
                    "citations": citations,
                    "spec_version": resolution.qir.spec.version if resolution.qir.spec else None,
                    "spec_id": verification.spec_id,
                    "unresolved": [u.to_dict() for u in verification.unresolved],
                    "qir": resolution.qir.to_dict(),
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    print(f"QUESTION: {args.question}")
    print(f"ANSWER: {answer_text}")
    print(f"VERDICT: {verification.verdict}")
    print(f"ROUTE: {route.action} — {route.reason}")
    if nli_result:
        print(
            f"NLI: {nli_result.verdict}"
            + (f" (score {nli_result.score})" if nli_result.score is not None else "")
            + (f" · {nli_result.model}" if nli_result.model else "")
        )
    print("ASSUMPTIONS:")
    if not assumptions:
        print("  (none)")
    for item in assumptions:
        print(f"  - {item['human']} [{item['source']}]")
    print("EVIDENCE:")
    if not citations:
        print("  (no structured citations)")
    for i, citation in enumerate(citations[: args.max_citations], 1):
        print(f"  [{i}] {citation['title']} · {citation['slug']} · {citation['field']}")
        for line in str(citation.get("quote", "")).split("\n"):
            print(f"      {line}")
    if len(citations) > args.max_citations:
        print(f"  ... and {len(citations) - args.max_citations} more")
    if resolution.qir.spec:
        print(f"SPEC: {resolution.qir.spec.version}")
    if verification.spec_id:
        print(f"SPEC_ID: {verification.spec_id}")
    if verification.unresolved:
        print("UNRESOLVED:")
        for hole in verification.unresolved:
            print(f"  - {hole.kind}:{hole.symbol} allowed={hole.allowed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
