"""Validate the generated fresh 300-question set.

    .venv/bin/python competitive/validate_fresh_300.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.compile import derive_answer  # noqa: E402
from formal.parse import parse_question  # noqa: E402
from formal.rows import build_dataset, field_value  # noqa: E402

HERE = Path(__file__).resolve().parent
INPUT = HERE / "private" / "fresh-300.jsonl"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"
EXISTING = ROOT / "bench" / "ooh-test-questions.jsonl"
PILOT = ROOT / "bench" / "ooh-pilot-v2.jsonl"
MANIFEST = HERE / "private" / "fresh-300-manifest.json"


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def load_existing() -> set[str]:
    out = set()
    for path in (EXISTING, PILOT):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                out.add(norm(str(json.loads(line).get("question", ""))))
    return out


def evidence_ok(items: list[dict]) -> tuple[bool, str]:
    for item in items:
        slug = str(item.get("slug", ""))
        quote = str(item.get("quote", ""))
        path = CORPUS / f"{slug}.md"
        if not path.exists():
            return False, f"missing source {slug}"
        if quote not in path.read_text(encoding="utf-8"):
            return False, f"quote not in {slug}: {quote[:60]!r}"
    return True, ""


def validate_gold(row: dict, qir, dataset) -> tuple[bool, str]:
    condition = row["condition"]
    gold = row.get("gold")
    if condition == "unanswerable":
        return (qir.kind == "absence", f"expected absence, got {qir.kind}")
    answer = derive_answer(qir, dataset)
    if condition == "partial":
        if qir.kind != "partial":
            return False, f"expected partial, got {qir.kind}"
        if not isinstance(gold, dict) or "parts" not in gold:
            return False, "partial gold must have parts"
        for expected, actual in zip(gold["parts"], answer.parts):
            if expected.get("status") == "stated":
                if actual.status != "stated" or actual.claim is None:
                    return False, f"part not stated: {expected}"
                if actual.claim.rhs.value != expected.get("value"):
                    return False, f"part value mismatch: {expected} vs {actual.claim.rhs.value}"
            elif expected.get("status") == "not stated":
                if actual.status != "not_stated":
                    return False, f"part should be not_stated: {expected}"
        return True, ""

    if qir.kind in ("lookup", "difference", "sum", "count"):
        if answer.parts[0].claim is None:
            return False, "canonical answer has no claim"
        actual = answer.parts[0].claim.rhs.value
        if actual != gold:
            return False, f"gold {gold!r} != canonical {actual!r}"
        return True, ""
    if qir.kind == "compare":
        if not isinstance(gold, dict) or "winner" not in gold:
            return False, "compare gold needs winner"
        a, b = qir.entities
        va, vb = field_value(dataset.by_title[a], qir.field), field_value(dataset.by_title[b], qir.field)
        winner = a if va > vb else b
        diff = abs(va - vb)
        if gold.get("winner") != winner:
            return False, f"winner {gold.get('winner')} != {winner}"
        if gold.get("difference_pp", gold.get("difference")) != diff:
            return False, f"difference mismatch: {gold} vs {diff}"
        return True, ""
    if qir.kind == "extremum":
        if not isinstance(gold, dict) or "winner" not in gold:
            return False, "extremum gold needs winner"
        if answer.parts[0].claim is None:
            return False, "extremum has no winner claim"
        winner = answer.parts[0].claim.rhs.value
        value = answer.parts[1].claim.rhs.value if len(answer.parts) > 1 else None
        if gold.get("winner") != winner:
            return False, f"winner {gold.get('winner')} != {winner}"
        expected_value = gold.get("pay", gold.get("growth_pct"))
        if expected_value is not None and value != expected_value:
            return False, f"value mismatch: {expected_value} != {value}"
        return True, ""
    return False, f"unsupported kind {qir.kind}"


def main() -> None:
    dataset = build_dataset()
    rows = [
        json.loads(line)
        for line in INPUT.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    existing = load_existing()
    errors = []
    seen = set()
    conditions = Counter()
    kinds = Counter()
    for row in rows:
        rid = str(row.get("id"))
        question = str(row.get("question", ""))
        key = norm(question)
        if key in existing:
            errors.append((rid, "duplicate of existing question"))
        if key in seen:
            errors.append((rid, "duplicate within fresh set"))
        seen.add(key)
        conditions[row.get("condition")] += 1
        qir = parse_question(rid, question, dataset)
        kinds[qir.kind] += 1
        ok, reason = validate_gold(row, qir, dataset)
        if not ok:
            errors.append((rid, reason))
        ok, reason = evidence_ok(row.get("evidence") or [])
        if not ok:
            errors.append((rid, reason))
    digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    print(f"rows: {len(rows)}")
    print(f"sha256: {digest}")
    print("conditions:", dict(conditions))
    print("kinds:", dict(kinds))
    print(f"errors: {len(errors)}")
    for rid, reason in errors[:30]:
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
                "conditions": dict(conditions),
                "categories": dict(kinds),
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
