"""Build the human-audit sheet for the 160-claim pilot.

100% of contradicted claims + a deterministic 20% sample of supported/absent
claims. The verdict columns are intentionally blank.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IN = HERE / "pilot-160.jsonl"
OUT = HERE / "AUDIT-SHEET.csv"


def main() -> None:
    rows = [
        json.loads(line)
        for line in IN.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    supported_seen = 0
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "id",
                "category",
                "question",
                "answer",
                "gold",
                "evidence_chars",
                "audit_required",
                "auditor1_verdict",
                "auditor1_notes",
                "auditor2_verdict",
                "auditor2_notes",
            ],
        )
        writer.writeheader()
        for row in rows:
            if row["gold"] == "contradicted":
                required = True
            else:
                supported_seen += 1
                required = supported_seen % 5 == 0
            writer.writerow(
                {
                    "id": row["id"],
                    "category": row["category"],
                    "question": row["question"],
                    "answer": row["answer"],
                    "gold": row["gold"],
                    "evidence_chars": len(row.get("evidence", "")),
                    "audit_required": "yes" if required else "no",
                    "auditor1_verdict": "",
                    "auditor1_notes": "",
                    "auditor2_verdict": "",
                    "auditor2_notes": "",
                }
            )
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
