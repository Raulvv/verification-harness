"""Write a deterministic contract subset for quick CUAD comparisons.

    .venv/bin/python legal/cuad/make_subset.py --n 20 \
      --output legal/cuad/out/subset-contracts.txt
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE / "data" / "test.json"
DEFAULT_OUT = HERE / "out" / "subset-contracts.txt"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write a deterministic CUAD subset")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--n", type=int, default=20)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    payload = json.loads(args.data.read_text(encoding="utf-8"))
    titles = sorted(str(contract["title"]) for contract in payload["data"])
    if args.n > len(titles):
        raise SystemExit(f"requested {args.n} contracts, only {len(titles)} available")
    subset = sorted(random.Random(args.seed).sample(titles, args.n))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(subset) + "\n", encoding="utf-8")
    print(f"wrote {len(subset)} contracts -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
