"""Apply one or more multi-reader gold-form exports.

Reads the one-question form export(s), merges the human labels, applies any
confirmed corrections, and writes a human-labelled claim file.

    .venv/bin/python competitive/apply_multireader_audit.py \
      --input competitive/private/multireader-320.jsonl \
      --export ~/Downloads/gold-results-deepseek.json \
      --export ~/Downloads/gold-results-sonnet.json \
      --export ~/Downloads/gold-results-glm.json \
      --export ~/Downloads/gold-results-qwen.json \
      --out competitive/private/multireader-320-human.jsonl

The export may be a single form (`{"results": [...]}`), a combined export
(`{"sources": {...}}`), or a bare list. Later exports override earlier ones for
the same claim id.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
DEFAULT_INPUT = HERE / "private" / "multireader-320.jsonl"
DEFAULT_OUT = HERE / "private" / "multireader-320-human.jsonl"

# Confirmed by the auditor after review. Keep this empty until the audit says
# otherwise; corrections are recorded separately from the raw export.
CORRECTIONS: dict[str, str] = {}


def load_export(path: Path) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    labels: dict[str, dict[str, Any]] = {}

    def add(row: dict[str, Any]) -> None:
        key = row.get("id") or row.get("claim_id") or row.get("claimId")
        if key:
            labels[str(key)] = row

    if isinstance(payload, list):
        for row in payload:
            if isinstance(row, dict):
                add(row)
    elif isinstance(payload, dict):
        if isinstance(payload.get("results"), list):
            for row in payload["results"]:
                if isinstance(row, dict):
                    add(row)
        for source in (payload.get("sources") or {}).values():
            if isinstance(source, dict):
                if isinstance(source.get("results"), list):
                    for row in source["results"]:
                        if isinstance(row, dict):
                            add(row)
                else:
                    for key, row in source.items():
                        if isinstance(row, dict):
                            row = {**row, "id": row.get("id") or key}
                            add(row)
    else:
        raise SystemExit(f"unsupported export shape: {path}")
    return labels


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Apply multi-reader gold-form exports")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--export",
        type=Path,
        action="append",
        required=True,
        help="gold-form export JSON; repeat for multiple forms",
    )
    parser.add_argument(
        "--corrections",
        type=Path,
        help="optional JSON object mapping claim id to corrected label",
    )
    args = parser.parse_args(argv)

    corrections = dict(CORRECTIONS)
    if args.corrections:
        corrections.update(json.loads(args.corrections.read_text(encoding="utf-8")))

    labels: dict[str, dict[str, Any]] = {}
    for path in args.export:
        labels.update(load_export(path))

    rows = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    disagreements = []
    applied = []
    missing = []
    for row in rows:
        human = labels.get(row["id"], {})
        raw = human.get("gold")
        corrected = corrections.get(row["id"], raw)
        row["gold_provisional"] = row.get("gold")
        row["gold_raw"] = raw
        row["gold_human"] = corrected
        row["gold_correction"] = corrections.get(row["id"])
        row["notes_human"] = human.get("notes", "")
        row["gold"] = corrected or row.get("gold")
        if not corrected:
            missing.append(row["id"])
        if corrected and corrected != row["gold_provisional"]:
            disagreements.append(
                {
                    "id": row["id"],
                    "provisional": row["gold_provisional"],
                    "human": corrected,
                    "raw": raw,
                    "formal": row.get("formal_verdict"),
                }
            )
        if row["gold_correction"]:
            applied.append({"id": row["id"], "from": raw, "to": corrected})

    args.out.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    print(f"wrote {len(rows)} -> {args.out}")
    print("human labels:", dict(Counter(r["gold_human"] for r in rows)))
    print("missing human labels:", len(missing))
    if missing:
        print(" ", ", ".join(missing[:20]), "..." if len(missing) > 20 else "")
    print("confirmed corrections:", len(applied))
    for c in applied:
        print(" ", c)
    print("disagreements with provisional:", len(disagreements))
    for d in disagreements:
        print(" ", d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
