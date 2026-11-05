"""Validate the H2 hard set (no model calls)."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.compile import derive_answer
from formal.parse import parse_question
from formal.rows import build_dataset

HERE = Path(__file__).resolve().parent
INPUT = HERE / "private" / "hard-h2-100.jsonl"
MANIFEST = HERE / "private" / "hard-h2-100-manifest.json"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def main() -> None:
    dataset = build_dataset()
    rows = [json.loads(line) for line in INPUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    errors = []
    seen = set()
    for row in rows:
        qir = parse_question(row["id"], row["question"], dataset)
        if qir.kind not in ("difference", "compare", "extremum"):
            errors.append((row["id"], f"kind {qir.kind}"))
            continue
        if norm(row["question"]) in seen:
            errors.append((row["id"], "duplicate"))
        seen.add(norm(row["question"]))
        answer = derive_answer(qir, dataset)
        gold = row["gold"]
        if qir.kind in ("difference",):
            actual = answer.parts[0].claim.rhs.value
            if actual != gold:
                errors.append((row["id"], f"gold {gold} != {actual}"))
        elif qir.kind == "compare":
            actual = answer.parts[1].claim.rhs.value
            if actual != gold.get("difference"):
                errors.append((row["id"], f"difference {gold.get('difference')} != {actual}"))
        elif qir.kind == "extremum":
            winner = answer.parts[0].claim.rhs.value
            value = answer.parts[1].claim.rhs.value if len(answer.parts) > 1 else None
            if winner != gold.get("winner") or value != gold.get("value"):
                errors.append((row["id"], f"extremum {gold} != {winner}/{value}"))
        for item in row.get("evidence", []):
            path = CORPUS / f"{item['slug']}.md"
            if not path.exists() or item["quote"] not in path.read_text(encoding="utf-8"):
                errors.append((row["id"], f"bad quote {item['slug']}"))
    digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    print(f"rows: {len(rows)}")
    print(f"sha256: {digest}")
    print(f"errors: {len(errors)}")
    for rid, reason in errors[:20]:
        print(f"  {rid}: {reason}")
    if errors:
        raise SystemExit(1)
    human_approved = all(
        str(row.get("validation", "")) == "human-approved" for row in rows
    )
    MANIFEST.write_text(
        json.dumps(
            {
                "path": str(INPUT),
                "sha256": digest,
                "count": len(rows),
                "conditions": dict(
                    (condition, sum(1 for row in rows if row["condition"] == condition))
                    for condition in {row["condition"] for row in rows}
                ),
                "categories": dict(
                    (kind, sum(1 for row in rows if parse_question(row["id"], row["question"], dataset).kind == kind))
                    for kind in {parse_question(row["id"], row["question"], dataset).kind for row in rows}
                ),
                "validation": (
                    "human-approved"
                    if human_approved
                    else "mechanically validated; human review required"
                ),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {MANIFEST}")


if __name__ == "__main__":
    main()
