"""Competitive benchmark harness: formal verifier vs external detectors.

The harness is model-agnostic. It consumes a frozen claim set and detector
outputs (JSONL). It does not call a model; HHEM/MiniCheck/LettuceDetect runs are
separate and can be imported as score files.

Claim set fields: id, category, question, answer, gold
  gold: supported | contradicted | absent | needs_specification
Detector fields: id, score (0..1) or label
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .extract import verify_reader_answer
from .rows import build_dataset
from .z3check import Premises

HERE = Path(__file__).resolve().parents[1]
DEFAULT_CLAIMS = HERE / "competitive" / "claims.jsonl"


@dataclass(frozen=True)
class ClaimItem:
    id: str
    category: str
    question: str
    answer: str
    gold: str


@dataclass(frozen=True)
class DetectorRecord:
    id: str
    score: float | None = None
    label: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def load_jsonl(path: Path | str) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def load_claims(path: Path | str = DEFAULT_CLAIMS) -> list[ClaimItem]:
    return [ClaimItem(**row) for row in load_jsonl(path)]


def load_detector(path: Path | str) -> dict[str, DetectorRecord]:
    out: dict[str, DetectorRecord] = {}
    for row in load_jsonl(path):
        rec = DetectorRecord(
            id=str(row["id"]),
            score=float(row["score"]) if row.get("score") is not None else None,
            label=str(row["label"]) if row.get("label") is not None else None,
            raw=row,
        )
        out[rec.id] = rec
    return out


def map_verdict(verdict: str) -> str:
    if verdict in ("ENTAILED", "ENTAILED_UNDER_ASSUMPTIONS"):
        return "supported"
    if verdict == "CONTRADICTION":
        return "contradicted"
    if verdict in ("ABSENT_CONFIRMED", "NOT_FOUND_IN_CORPUS"):
        return "absent"
    if verdict in ("NEEDS_SPECIFICATION", "NOT_FORMALIZABLE"):
        return "needs_specification"
    if verdict == "INCOMPLETE":
        return "incomplete"
    return "unknown"


def formal_predictions(
    claims: list[ClaimItem], dataset, premises: Premises
) -> tuple[dict[str, str], dict[str, str]]:
    """Return (mapped label, raw verdict) for each claim."""
    mapped: dict[str, str] = {}
    raw: dict[str, str] = {}
    for item in claims:
        _, verification = verify_reader_answer(
            item.question, item.answer, dataset, premises
        )
        raw[item.id] = verification.verdict
        mapped[item.id] = map_verdict(verification.verdict)
    return mapped, raw


def detector_predictions(
    records: dict[str, DetectorRecord], threshold: float = 0.5
) -> dict[str, str]:
    out: dict[str, str] = {}
    for cid, rec in records.items():
        if rec.label:
            label = rec.label.lower()
            if label in ("supported", "entailed", "yes", "true", "1"):
                out[cid] = "supported"
            elif label in ("contradicted", "not_supported", "no", "false", "0"):
                out[cid] = "contradicted"
            elif label in ("absent", "not_found", "not found"):
                out[cid] = "absent"
            else:
                out[cid] = "unknown"
        elif rec.score is not None:
            out[cid] = "supported" if rec.score >= threshold else "contradicted"
        else:
            out[cid] = "unknown"
    return out


def evaluate(
    claims: list[ClaimItem],
    predictions: dict[str, str],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    by_category: dict[str, dict[str, int]] = defaultdict(
        lambda: {"n": 0, "correct": 0, "false_accept": 0, "false_reject": 0, "abstain": 0}
    )
    false_accepts: list[str] = []
    false_rejects: list[str] = []
    abstentions: list[str] = []
    exact = 0
    for item in claims:
        pred = predictions.get(item.id, "unknown")
        gold_supported = item.gold == "supported"
        pred_supported = pred == "supported"
        fa = pred_supported and not gold_supported
        fr = (not pred_supported) and gold_supported
        abstain = pred in ("unknown", "needs_specification", "incomplete")
        if pred == item.gold:
            exact += 1
        if fa:
            false_accepts.append(item.id)
        if fr:
            false_rejects.append(item.id)
        if abstain:
            abstentions.append(item.id)
        cat = by_category[item.category]
        cat["n"] += 1
        cat["correct"] += 1 if not fa and not fr else 0
        cat["false_accept"] += 1 if fa else 0
        cat["false_reject"] += 1 if fr else 0
        cat["abstain"] += 1 if abstain else 0
        rows.append(
            {
                "id": item.id,
                "category": item.category,
                "gold": item.gold,
                "predicted": pred,
                "false_accept": fa,
                "false_reject": fr,
                "abstain": abstain,
            }
        )
    n = len(claims)
    return {
        "n": n,
        "binary_accuracy": round((n - len(false_accepts) - len(false_rejects)) / n, 4) if n else 0,
        "exact_accuracy": round(exact / n, 4) if n else 0,
        "false_accepts": false_accepts,
        "false_rejects": false_rejects,
        "false_accept_count": len(false_accepts),
        "false_reject_count": len(false_rejects),
        "abstentions": abstentions,
        "coverage": round(1 - len(abstentions) / n, 4) if n else 0,
        "by_category": {k: dict(v) for k, v in sorted(by_category.items())},
        "rows": rows,
    }


def run(
    claims_path: Path | str = DEFAULT_CLAIMS,
    detector_paths: list[Path | str] | None = None,
    threshold: float = 0.5,
) -> dict[str, Any]:
    dataset = build_dataset()
    premises = Premises(dataset)
    claims = load_claims(claims_path)
    formal, raw = formal_predictions(claims, dataset, premises)
    systems: dict[str, Any] = {
        "formal": {
            **evaluate(claims, formal),
            "raw_verdicts": raw,
        }
    }
    for path in detector_paths or []:
        path = Path(path)
        systems[path.stem] = evaluate(claims, detector_predictions(load_detector(path), threshold))
    return {
        "claims": str(claims_path),
        "threshold": threshold,
        "systems": systems,
    }


def format_report(result: dict[str, Any]) -> str:
    lines = [
        f"claims: {result['claims']}  (threshold {result['threshold']})",
        "",
        f"{'system':<14} {'binary':>8} {'exact':>8} {'false+':>8} {'false-':>8} {'cover':>8}",
    ]
    for name, m in result["systems"].items():
        lines.append(
            f"{name:<14} {m['binary_accuracy']:>8.2f} {m['exact_accuracy']:>8.2f} "
            f"{m['false_accept_count']:>8} {m['false_reject_count']:>8} {m['coverage']:>8.2f}"
        )
    lines.append("")
    lines.append("by category:")
    for name, m in result["systems"].items():
        lines.append(f"  {name}")
        for cat, c in m["by_category"].items():
            lines.append(
                f"    {cat:<12} n={c['n']:<3} correct={c['correct']:<3} "
                f"false+={c['false_accept']:<2} false-={c['false_reject']:<2} abstain={c['abstain']}"
            )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Formal verifier vs external detectors")
    parser.add_argument("--claims", type=Path, default=DEFAULT_CLAIMS)
    parser.add_argument("--detector", type=Path, action="append", default=[])
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    result = run(args.claims, args.detector, args.threshold)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(format_report(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
