"""Apply the exported gold-form labels to the claim sets.

Reads `~/Downloads/gold-results-combined.json` and writes:
  competitive/pilot-160-human.jsonl
  competitive/private/natural-80-human.jsonl

The human label is authoritative. A normalized label is also recorded for
answerable/unanswerable consistency; it does not overwrite the human label.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
COMBINED = Path(os.path.expanduser("~/Downloads/gold-results-combined.json"))
SOURCES = {
    "gold-form-ooh-160-claim-gold": (HERE / "pilot-160.jsonl", HERE / "pilot-160-human.jsonl"),
    "gold-form-natural-reader-error-gold": (
        HERE / "private" / "natural-80.jsonl",
        HERE / "private" / "natural-80-human.jsonl",
    ),
}

# Confirmed by the auditor after the first pass. The raw export stays intact.
CORRECTIONS = {
    "natural-test-100": "contradicted",
    "natural-test-041": "contradicted",
    "natural-test-050": "contradicted",
    "natural-test-062": "contradicted",
    "natural-test-076": "contradicted",
    "natural-test-077": "contradicted",
    "natural-test-087": "contradicted",
    "natural-test-095": "contradicted",
    "natural-test-089": "supported",
}


def normalize(condition: str, gold: str) -> str:
    if condition == "answerable" and gold == "absent":
        return "contradicted"
    if condition == "unanswerable" and gold in ("supported", "contradicted", "partial"):
        return "contradicted"
    return gold


def main() -> None:
    payload = json.loads(COMBINED.read_text(encoding="utf-8"))
    sources = payload["sources"]
    for key, (base, out) in SOURCES.items():
        labels = sources.get(key, {})
        rows = [
            json.loads(line)
            for line in base.read_text(encoding="utf-8").splitlines()
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
            row["gold_normalized"] = normalize(
                row.get("condition", "answerable"), row["gold"]
            )
            if row["gold_human"] and row["gold_human"] != row["gold_provisional"]:
                disagreements.append(
                    {
                        "id": row["id"],
                        "provisional": row["gold_provisional"],
                        "human": row["gold_human"],
                        "raw": row["gold_raw"],
                        "normalized": row["gold_normalized"],
                        "formal": row.get("formal_verdict"),
                    }
                )
            if row["gold_correction"]:
                corrections.append({"id": row["id"], "from": raw, "to": corrected})
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
        print(f"== {key}")
        print(f"wrote {len(rows)} -> {out}")
        print("human labels:", dict(Counter(r["gold_human"] for r in rows)))
        print("normalized:", dict(Counter(r["gold_normalized"] for r in rows)))
        print("disagreements:", len(disagreements))
        for d in disagreements:
            print(" ", d)
        print("confirmed corrections:", len(corrections))
        for c in corrections:
            print(" ", c)


if __name__ == "__main__":
    main()
