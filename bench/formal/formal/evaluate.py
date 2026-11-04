"""Evaluation harness for the formal spike.

Usage (from bench/formal):

    .venv/bin/python -m formal.evaluate
    .venv/bin/python -m formal.evaluate --private /path/to/ooh-test-private-v2.jsonl
    .venv/bin/python -m formal.evaluate --json

Outputs (gitignored): out/inventory.json, out/evaluation.json
The private labels are read only for aggregate scoring; they are never written
to the output files or the report.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import time
from collections import Counter
from dataclasses import replace
from pathlib import Path
from typing import Any

from .compile import candidate_rows, derive_answer
from .model import AnswerIR, AnswerPart, Claim, QIR, Term
from .negative import known_row_cases
from .parse import parse_question
from .rows import Dataset, build_dataset, field_value
from .z3check import Premises, check_answer

ROOT = Path(__file__).resolve().parents[3]
TEST_QUESTIONS = ROOT / "bench" / "ooh-test-questions.jsonl"
DEV_QUESTIONS = ROOT / "bench" / "ooh-dev-aggregation.jsonl"
DEFAULT_PRIVATE = Path(
    "/Users/raulvegadelvalle/Documents/linea-cero-metro/bench/results/ooh-test-private-v2.jsonl"
)
OUT_DIR = Path(__file__).resolve().parents[1] / "out"

VALUE_KINDS = {"lookup", "compare", "difference", "sum", "extremum", "count"}


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _num(value: Any) -> Any:
    if isinstance(value, str):
        m = re.search(r"-?\d+(?:\.\d+)?", value)
        if m:
            return float(m.group()) if "." in m.group() else int(m.group())
    return value


def canonical_summary(qir: QIR, answer: AnswerIR) -> dict[str, Any]:
    if qir.kind in ("lookup", "difference", "sum", "count"):
        return {"value": answer.parts[0].claim.rhs.value if answer.parts[0].claim else None}
    if qir.kind == "compare":
        return {
            "winner": answer.parts[0].claim.lhs.entity,
            "difference": answer.parts[1].claim.rhs.value,
        }
    if qir.kind == "extremum":
        return {
            "winner": answer.parts[0].claim.rhs.value,
            "value": answer.parts[1].claim.rhs.value,
        }
    if qir.kind == "absence":
        return {"status": answer.parts[0].status}
    if qir.kind == "partial":
        return {
            "parts": [
                {
                    "status": p.status,
                    "value": p.claim.rhs.value if p.claim else None,
                }
                for p in answer.parts
            ]
        }
    return {}


def gold_matches(qir: QIR, gold: Any, summary: dict[str, Any]) -> bool:
    if qir.kind == "absence":
        return gold == "NOT FOUND"
    if qir.kind == "partial":
        if not isinstance(gold, dict):
            return False
        gp = gold.get("parts", [])
        sp = summary.get("parts", [])
        if len(gp) != len(sp):
            return False
        for g, s in zip(gp, sp):
            if g.get("status") == "not stated":
                if s.get("status") != "not_stated":
                    return False
            else:
                if s.get("status") != "stated" or _num(g.get("value")) != _num(s.get("value")):
                    return False
        return True
    if isinstance(gold, (int, float)):
        return summary.get("value") == gold
    if isinstance(gold, dict):
        if "winner" in gold and summary.get("winner") != gold["winner"]:
            return False
        for key in ("difference", "difference_pp", "pay", "value", "growth_pct"):
            if key in gold:
                skey = "value" if key in ("pay", "value", "growth_pct") else "difference"
                if _num(summary.get(skey)) != _num(gold[key]):
                    return False
        return True
    return False


def inventory_record(
    qir: QIR, answer: AnswerIR, verification, dataset_name: str
) -> dict[str, Any]:
    return {
        "dataset": dataset_name,
        "id": qir.qid,
        "question": qir.question,
        "kind": qir.kind,
        "formalizable": qir.formalizable,
        "formalizable_value": qir.kind in VALUE_KINDS and qir.formalizable,
        "field": qir.field,
        "entity": qir.entity,
        "entities": list(qir.entities),
        "op": qir.op,
        "candidate_set": qir.candidate_set.to_dict() if qir.candidate_set else None,
        "filter": qir.filter.to_dict() if qir.filter else None,
        "scope": qir.scope.to_dict() if qir.scope else None,
        "parts": [p.to_dict() for p in qir.parts],
        "notes": list(qir.notes),
        "reason": qir.reason,
        "verdict": verification.verdict,
        "verification_reason": verification.reason,
        "canonical": canonical_summary(qir, answer),
        "citations": [c.to_dict() for c in (answer.parts[0].citations if answer.parts else ())],
    }


def evaluate_dataset(
    dataset: Dataset,
    premises: Premises,
    questions: list[dict[str, Any]],
    dataset_name: str,
    private: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    runtimes: list[float] = []
    verdicts: Counter[str] = Counter()
    kinds: Counter[str] = Counter()
    agreement = 0
    scored = 0
    false_entailed: list[str] = []

    for item in questions:
        qid = item["id"]
        t0 = time.perf_counter()
        qir = parse_question(qid, item["question"], dataset)
        answer = derive_answer(qir, dataset)
        verification = check_answer(qir, answer, premises)
        elapsed = (time.perf_counter() - t0) * 1000
        runtimes.append(elapsed)
        verdicts[verification.verdict] += 1
        kinds[qir.kind] += 1
        summary = canonical_summary(qir, answer)
        rec = inventory_record(qir, answer, verification, dataset_name)
        rec["runtime_ms"] = round(elapsed, 3)
        gold = None
        if private and qid in private:
            gold = private[qid].get("gold")
        elif "gold" in item:
            gold = item.get("gold")
        if gold is not None:
            scored += 1
            ok = gold_matches(qir, gold, summary)
            if ok:
                agreement += 1
            elif verification.verdict == "ENTAILED":
                false_entailed.append(qid)
        records.append(rec)

    metrics = {
        "dataset": dataset_name,
        "n": len(questions),
        "kinds": dict(sorted(kinds.items())),
        "formalizable_value": sum(
            1 for r in records if r["formalizable_value"]
        ),
        "absence": sum(1 for r in records if r["kind"] == "absence"),
        "partial": sum(1 for r in records if r["kind"] == "partial"),
        "not_formalizable": sum(1 for r in records if r["kind"] == "not_formalizable"),
        "verdicts": dict(sorted(verdicts.items())),
        "strict_acceptance": verdicts.get("ENTAILED", 0) + verdicts.get("ABSENT_CONFIRMED", 0),
        "unknown_rate": round(verdicts.get("UNKNOWN", 0) / max(1, len(questions)), 4),
        "not_formalizable_rate": round(
            verdicts.get("NOT_FORMALIZABLE", 0) / max(1, len(questions)), 4
        ),
        "runtime_total_ms": round(sum(runtimes), 3),
        "runtime_mean_ms": round(statistics.mean(runtimes), 3) if runtimes else 0,
        "runtime_p95_ms": round(
            sorted(runtimes)[max(0, int(len(runtimes) * 0.95) - 1)], 3
        )
        if runtimes
        else 0,
    }
    if scored:
        metrics["scored"] = scored
        metrics["answer_agreement"] = agreement
        metrics["answer_agreement_rate"] = round(agreement / max(1, scored), 4)
        metrics["false_entailed"] = false_entailed
    return metrics, records


# ----------------------------------------------------------------------
# Mutation tests: every formalized value answer gets wrong variants.
# ----------------------------------------------------------------------
def _const(value: int | str) -> Term:
    return Term(kind="const", value=value)


def _field(entity: str, field: str) -> Term:
    return Term(kind="field", entity=entity, field=field)


def mutations_for(
    qir: QIR, answer: AnswerIR, dataset: Dataset
) -> list[tuple[str, AnswerIR]]:
    out: list[tuple[str, AnswerIR]] = []
    if qir.kind not in VALUE_KINDS or not answer.parts:
        return out

    def with_part(index: int, part: AnswerPart) -> AnswerIR:
        parts = list(answer.parts)
        parts[index] = part
        return AnswerIR(qid=answer.qid, parts=tuple(parts))

    # Numeric off-by-one on each stated numeric claim.
    for i, part in enumerate(answer.parts):
        claim = part.claim
        if claim is None or claim.rhs.kind != "const":
            continue
        value = claim.rhs.value
        if isinstance(value, (int, float)):
            for delta in (-1, 1):
                out.append(
                    (
                        f"part{i}_value{delta:+d}",
                        with_part(i, replace(part, claim=replace(claim, rhs=_const(int(value) + delta)))),
                    )
                )

    # Extremum: wrong winner + that winner's value.
    if qir.kind == "extremum" and len(answer.parts) >= 2:
        rows = candidate_rows(qir, dataset)
        canonical_winner = answer.parts[0].claim.rhs.value
        alternatives = [r for r in rows if r.title != canonical_winner]
        if alternatives:
            ordered = sorted(
                alternatives,
                key=lambda r: (field_value(r, qir.field), r.title),  # type: ignore[arg-type]
            )
            other = ordered[-1] if qir.op == "max" else ordered[0]
            winner_claim = Claim(
                Term(
                    kind="argmax" if qir.op == "max" else "argmin",
                    field=qir.field,
                    candidate_set=qir.candidate_set,
                    filter=qir.filter,
                ),
                "=",
                _const(other.title),
                label="mutated_winner",
            )
            value_claim = Claim(
                _field(other.title, qir.field),
                "=",
                _const(field_value(other, qir.field)),
                label="mutated_winner_value",
            )
            out.append(
                (
                    "wrong_winner",
                    AnswerIR(
                        qid=answer.qid,
                        parts=(
                            replace(answer.parts[0], claim=winner_claim),
                            replace(answer.parts[1], claim=value_claim),
                        ),
                    ),
                )
            )
        # Dropped filter: structurally wrong claim, must not be ENTAILED.
        if qir.filter is not None:
            dropped = replace(
                answer.parts[0],
                claim=replace(
                    answer.parts[0].claim,
                    lhs=replace(answer.parts[0].claim.lhs, filter=None),
                ),
            )
            out.append(("dropped_filter", with_part(0, dropped)))

    # Compare: swap the winner claim.
    if qir.kind == "compare" and len(answer.parts) >= 2:
        winner_claim = answer.parts[0].claim
        swapped = replace(
            winner_claim,
            lhs=winner_claim.rhs,
            rhs=winner_claim.lhs,
            op=">" if winner_claim.op == ">" else "<",
            label="mutated_swap",
        )
        out.append(("swapped_winner", with_part(0, replace(answer.parts[0], claim=swapped))))

    return out


def run_mutations(
    dataset: Dataset, premises: Premises, questions: list[dict[str, Any]]
) -> dict[str, Any]:
    total = 0
    verdicts: Counter[str] = Counter()
    false_entailed: list[dict[str, str]] = []
    per_kind: Counter[str] = Counter()
    for item in questions:
        qir = parse_question(item["id"], item["question"], dataset)
        answer = derive_answer(qir, dataset)
        for label, mutated in mutations_for(qir, answer, dataset):
            total += 1
            per_kind[qir.kind] += 1
            v = check_answer(qir, mutated, premises)
            verdicts[v.verdict] += 1
            if v.verdict == "ENTAILED":
                false_entailed.append({"id": item["id"], "mutation": label})
    return {
        "mutations": total,
        "per_kind": dict(sorted(per_kind.items())),
        "verdicts": dict(sorted(verdicts.items())),
        "false_entailed": false_entailed,
        "false_entailed_count": len(false_entailed),
    }


def run_known_rows(dataset: Dataset, premises: Premises) -> dict[str, Any]:
    cases = known_row_cases(dataset)
    results = []
    false_entailed = 0
    for case in cases:
        v = check_answer(case.qir, case.answer, premises)
        passed = (
            v.verdict != "ENTAILED"
            if case.expected == "NOT_ENTAILED"
            else v.verdict == case.expected
        )
        if not passed and v.verdict == "ENTAILED":
            false_entailed += 1
        results.append(
            {
                "id": case.qid,
                "label": case.label,
                "expected": case.expected,
                "verdict": v.verdict,
                "passed": passed,
                "note": case.note,
                "reason": v.reason,
            }
        )
    return {
        "cases": len(cases),
        "passed": sum(1 for r in results if r["passed"]),
        "false_entailed": false_entailed,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private", type=Path, default=DEFAULT_PRIVATE)
    parser.add_argument("--no-private", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    t0 = time.perf_counter()
    dataset = build_dataset()
    premises = Premises(dataset)
    build_ms = (time.perf_counter() - t0) * 1000

    test_questions = load_jsonl(TEST_QUESTIONS)
    dev_questions = load_jsonl(DEV_QUESTIONS)
    private = None
    if not args.no_private and args.private.exists():
        private = {r["id"]: r for r in load_jsonl(args.private)}

    test_metrics, test_records = evaluate_dataset(
        dataset, premises, test_questions, "test-100", private
    )
    dev_metrics, dev_records = evaluate_dataset(
        dataset, premises, dev_questions, "dev-14", private
    )
    mutations = run_mutations(dataset, premises, test_questions)
    known = run_known_rows(dataset, premises)

    # Determinism: repeat the full 100 and compare verdicts + canonical values.
    repeat_verdicts = []
    for item in test_questions:
        qir = parse_question(item["id"], item["question"], dataset)
        answer = derive_answer(qir, dataset)
        v = check_answer(qir, answer, premises)
        repeat_verdicts.append((item["id"], v.verdict, json.dumps(canonical_summary(qir, answer), sort_keys=True)))
    first_verdicts = [
        (r["id"], r["verdict"], json.dumps(r["canonical"], sort_keys=True))
        for r in test_records
    ]
    deterministic = first_verdicts == repeat_verdicts

    result = {
        "generated_by": "bench/formal/formal/evaluate.py",
        "model_calls": 0,
        "premises": {
            "rows": len(dataset.rows),
            "paid": len(dataset.paid),
            "table_agreement": dataset.table_agreement,
            "build_ms": round(build_ms, 3),
        },
        "test_100": test_metrics,
        "dev_14": dev_metrics,
        "mutations": mutations,
        "known_rows": known,
        "determinism": {"identical_rerun": deterministic},
        "total_runtime_ms": round((time.perf_counter() - t0) * 1000, 3),
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "inventory.json").write_text(
        json.dumps(
            {
                "test_100": test_records,
                "dev_14": dev_records,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    (args.out / "evaluation.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"premises: {len(dataset.rows)} rows / {len(dataset.paid)} paid; table agrees={dataset.table_agreement['agrees']}")
        print(f"test-100: kinds={test_metrics['kinds']}")
        print(
            f"test-100: formalizable_value={test_metrics['formalizable_value']} "
            f"absence={test_metrics['absence']} partial={test_metrics['partial']} "
            f"not_formalizable={test_metrics['not_formalizable']}"
        )
        print(f"test-100 verdicts={test_metrics['verdicts']}")
        print(
            f"test-100 agreement={test_metrics.get('answer_agreement')}/{test_metrics.get('scored')} "
            f"false_entailed={test_metrics.get('false_entailed')}"
        )
        print(f"dev-14 verdicts={dev_metrics['verdicts']} agreement={dev_metrics.get('answer_agreement')}/{dev_metrics.get('scored')}")
        print(
            f"mutations={mutations['mutations']} verdicts={mutations['verdicts']} "
            f"false_entailed={mutations['false_entailed_count']}"
        )
        print(f"known_rows={known['passed']}/{known['cases']} false_entailed={known['false_entailed']}")
        print(f"deterministic={deterministic} total_runtime_ms={result['total_runtime_ms']}")
        print(f"wrote {args.out / 'inventory.json'}")
        print(f"wrote {args.out / 'evaluation.json'}")


if __name__ == "__main__":
    main()
