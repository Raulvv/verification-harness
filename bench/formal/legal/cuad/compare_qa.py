"""Compare two CUAD QA metrics files.

    .venv/bin/python legal/cuad/compare_qa.py \
      --a legal/cuad/out/cuad-qa-metrics.json \
      --b legal/cuad/out/cuad-qa-large-metrics.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _row(name: str, data: dict) -> str:
    macro = data.get("macro", {})
    presence = data.get("presence") or {}
    zero = presence.get("at_zero", {})
    best = presence.get("best_f1", {})
    precise = presence.get("precision_first", {})
    return (
        f"{name:18s} "
        f"AUPR={macro.get('aupr', 0):.3f} "
        f"P@80={macro.get('p_at_80', 0):.3f} "
        f"P@90={macro.get('p_at_90', 0):.3f} | "
        f"zero: cov={zero.get('coverage', 0):.3f} far={zero.get('false_accept_rate', 0):.3f} | "
        f"bestF1: cov={best.get('coverage', 0):.3f} far={best.get('false_accept_rate', 0):.3f} | "
        f"prec: cov={precise.get('coverage', 0):.3f} far={precise.get('false_accept_rate', 0):.3f}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare CUAD QA metrics")
    parser.add_argument("--a", type=Path, required=True)
    parser.add_argument("--b", type=Path, required=True)
    parser.add_argument("--label-a", default="A")
    parser.add_argument("--label-b", default="B")
    args = parser.parse_args(argv)
    a = _load(args.a)
    b = _load(args.b)
    print(_row(args.label_a, a))
    print(_row(args.label_b, b))
    for key in ("aupr", "p_at_80", "p_at_90"):
        delta = b.get("macro", {}).get(key, 0) - a.get("macro", {}).get(key, 0)
        print(f"delta {key}: {delta:+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
