"""Compare the first and second rater labels.

    .venv/bin/python competitive/compare_raters.py \
      --second ~/Downloads/second-rater-results.json
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIRST = HERE / "private" / "multireader-320-human.jsonl"


def load_first(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("gold"):
            out[str(row["id"])] = str(row["gold"])
    return out


def load_second(path: Path) -> dict[str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    if isinstance(payload, dict) and isinstance(payload.get("results"), list):
        for row in payload["results"]:
            if row.get("id") and row.get("gold"):
                out[str(row["id"])] = str(row["gold"])
    elif isinstance(payload, dict) and isinstance(payload.get("sources"), dict):
        for source in payload["sources"].values():
            for key, row in source.items():
                if isinstance(row, dict) and row.get("gold"):
                    out[str(row.get("id") or key)] = str(row["gold"])
    else:
        raise SystemExit(f"unsupported export shape: {path}")
    return out


def cohen_kappa(first: list[str], second: list[str]) -> float:
    n = len(first)
    if not n:
        return 0.0
    agree = sum(a == b for a, b in zip(first, second)) / n
    p = Counter(first)
    q = Counter(second)
    expected = sum((p[label] / n) * (q[label] / n) for label in set(p) | set(q))
    return (agree - expected) / (1 - expected) if expected < 1 else 1.0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare first and second raters")
    parser.add_argument("--first", type=Path, default=FIRST)
    parser.add_argument("--second", type=Path, required=True)
    args = parser.parse_args(argv)

    first = load_first(args.first)
    second = load_second(args.second)
    ids = sorted(set(first) & set(second))
    missing = sorted(set(first) - set(second))
    if not ids:
        raise SystemExit("no overlapping labels")
    a = [first[i] for i in ids]
    b = [second[i] for i in ids]
    n = len(ids)
    agree = sum(x == y for x, y in zip(a, b))
    print(f"common claims: {n}")
    print(f"raw agreement: {agree}/{n} = {agree / n:.3f}")
    print(f"Cohen's kappa: {cohen_kappa(a, b):.3f}")
    print("first labels:", dict(Counter(a)))
    print("second labels:", dict(Counter(b)))
    print("missing second labels:", len(missing))
    if missing:
        print(" ", ", ".join(missing[:20]), "..." if len(missing) > 20 else "")
    print("\nconfusion (first -> second):")
    confusion: dict[str, Counter[str]] = defaultdict(Counter)
    for x, y in zip(a, b):
        confusion[x][y] += 1
    labels = sorted(set(a) | set(b))
    print("first\\second".ljust(14) + "".join(label.ljust(14) for label in labels))
    for x in labels:
        print(x.ljust(14) + "".join(str(confusion[x][y]).ljust(14) for y in labels))
    print("\ndisagreements:")
    for claim_id, x, y in zip(ids, a, b):
        if x != y:
            print(f"  {claim_id}: first={x} second={y}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
