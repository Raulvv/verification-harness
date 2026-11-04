"""Build an error-enriched audit slice from the four-reader set.

Selects provisional contradicted/partial claims and formal
CONTRADICTION/INCOMPLETE claims. This is a stress test, not a random natural
sample.

    .venv/bin/python competitive/build_error_enriched.py
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE / "private" / "multireader-320.jsonl"
OUT = HERE / "private" / "error-enriched-38.jsonl"
SELECT_GOLD = {"contradicted", "partial"}
SELECT_VERDICT = {"CONTRADICTION", "INCOMPLETE"}


def main() -> None:
    rows = [
        json.loads(line)
        for line in BASE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    selected = [
        row
        for row in rows
        if row.get("gold") in SELECT_GOLD or row.get("formal_verdict") in SELECT_VERDICT
    ]
    for row in selected:
        row["audit_required"] = "yes"
        row["slice"] = "error-enriched"
    OUT.write_text(
        "".join(json.dumps(row) + "\n" for row in selected), encoding="utf-8"
    )
    print(f"wrote {len(selected)} -> {OUT}")
    print("readers:", dict(Counter(row["reader"] for row in selected)))
    print("provisional:", dict(Counter(row["gold"] for row in selected)))
    print("formal:", dict(Counter(row["formal_verdict"] for row in selected)))
    print("categories:", dict(Counter(row["category"] for row in selected)))


if __name__ == "__main__":
    main()
