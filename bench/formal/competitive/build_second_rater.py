"""Build a blind second-rater sample from the audited 320-claim set.

Includes every contradicted/partial claim plus a random sample of supported and
absent claims. The first rater's labels and the formal verdict are removed.

    .venv/bin/python competitive/build_second_rater.py
"""

from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE / "private" / "multireader-320-human.jsonl"
OUT = HERE / "private" / "second-rater-60.jsonl"
SEED = 0
N_SUPPORTED = 15
N_ABSENT = 15

STRIP = {
    "gold",
    "provisional_gold",
    "formal_verdict",
    "gold_provisional",
    "gold_raw",
    "gold_human",
    "gold_correction",
    "notes_human",
    "gold_normalized",
}


def main() -> None:
    rows = [
        json.loads(line)
        for line in BASE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    errors = [row for row in rows if row.get("gold") in ("contradicted", "partial")]
    supported = [row for row in rows if row.get("gold") == "supported"]
    absent = [row for row in rows if row.get("gold") == "absent"]
    rng = random.Random(SEED)
    sample = (
        errors
        + rng.sample(supported, min(N_SUPPORTED, len(supported)))
        + rng.sample(absent, min(N_ABSENT, len(absent)))
    )
    rng.shuffle(sample)
    cleaned = []
    for row in sample:
        item = {key: value for key, value in row.items() if key not in STRIP}
        item["audit_required"] = "yes"
        item["slice"] = "second-rater"
        cleaned.append(item)
    OUT.write_text(
        "".join(json.dumps(row) + "\n" for row in cleaned), encoding="utf-8"
    )
    print(f"wrote {len(cleaned)} -> {OUT}")
    print("readers:", dict(Counter(row["reader"] for row in cleaned)))
    print("categories:", dict(Counter(row["category"] for row in cleaned)))


if __name__ == "__main__":
    main()
