"""Apply the multi-reader gold-form export.

Reads ~/Downloads/gold-results.json (the one-question form export), applies the
confirmed corrections, and writes private/multireader-160-human.jsonl.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPORT = Path(os.path.expanduser("~/Downloads/gold-results.json"))
BASE = HERE / "private" / "multireader-160.jsonl"
OUT = HERE / "private" / "multireader-160-human.jsonl"

CORRECTIONS = {
    "mr-sonnet-da-test-041": "contradicted",
    "mr-sonnet-da-test-050": "contradicted",
    "mr-sonnet-da-test-062": "contradicted",
    "mr-sonnet-da-test-088": "partial",
    "mr-glm-da-test-088": "partial",
    "mr-glm-da-test-038": "partial",
    "mr-sonnet-da-test-100": "contradicted",
    "mr-glm-da-test-100": "contradicted",
}


def main() -> None:
    payload = json.loads(EXPORT.read_text(encoding="utf-8"))
    labels = {r["id"]: r for r in payload["results"]}
    rows = [
        json.loads(line)
        for line in BASE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    disagreements = []
    corrections = []
    for row in rows:
        human = labels.get(row["id"], {})
        raw = human.get("gold")
        corrected = CORRECTIONS.get(row["id"], raw)
        row["gold_provisional"] = row.get("gold")
        row["gold_raw"] = raw
        row["gold_human"] = corrected
        row["gold_correction"] = CORRECTIONS.get(row["id"])
        row["notes_human"] = human.get("notes", "")
        row["gold"] = corrected or row.get("gold")
        if row["gold_human"] and row["gold_human"] != row["gold_provisional"]:
            disagreements.append(
                {
                    "id": row["id"],
                    "provisional": row["gold_provisional"],
                    "human": row["gold_human"],
                    "raw": raw,
                    "formal": row.get("formal_verdict"),
                }
            )
        if row["gold_correction"]:
            corrections.append({"id": row["id"], "from": raw, "to": corrected})
    OUT.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    print(f"wrote {len(rows)} -> {OUT}")
    print("human labels:", dict(Counter(r["gold_human"] for r in rows)))
    print("confirmed corrections:", len(corrections))
    for c in corrections:
        print(" ", c)
    print("disagreements with provisional:", len(disagreements))
    for d in disagreements:
        print(" ", d)


if __name__ == "__main__":
    main()
