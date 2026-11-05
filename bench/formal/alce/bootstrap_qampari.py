"""Paired bootstrap for a QAMPARI pilot.

Reads the pilot rows and the scorer output, then resamples questions to put
95% intervals on the B-vs-DA differences.

    .venv-detectors/bin/python alce/bootstrap_qampari.py \
      --rows competitive/private/alce/runs/qampari-pilot-200.jsonl \
      --score competitive/private/alce/runs/qampari-pilot-200-score.json
"""

from __future__ import annotations

import argparse
import json
import random
import re
import string
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def normalize_answer(s: str) -> str:
    s = str(s).lower()
    s = "".join(ch for ch in s if ch not in set(string.punctuation))
    s = re.sub(r"\b(a|an|the)\b", " ", s)
    return " ".join(s.split())


def f1(formatted: str, gold: list[list[str]]) -> float:
    stripped = re.sub(r"\[\d+\]", "", formatted)
    preds = [normalize_answer(x.strip()) for x in stripped.rstrip().rstrip(".").rstrip(",").split(",")]
    preds = [p for p in preds if p]
    answers = [[normalize_answer(x) for x in group] for group in gold]
    flat = [x for group in answers for x in group]
    prec = sum(1 for p in preds if p in flat) / len(preds) if preds else 0.0
    rec = sum(1 for group in answers if any(x in preds for x in group)) / len(answers) if answers else 0.0
    return 2 * prec * rec / (prec + rec) if prec + rec else 0.0


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def pct(xs: list[float], p: float) -> float:
    if not xs:
        return 0.0
    ys = sorted(xs)
    k = min(len(ys) - 1, max(0, int(round(p * (len(ys) - 1)))))
    return ys[k]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=Path, required=True)
    parser.add_argument("--score", type=Path, required=True)
    parser.add_argument("--boot", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines() if line.strip()]
    score = json.loads(args.score.read_text(encoding="utf-8"))["summary"]

    by_id: dict[str, dict[str, dict]] = defaultdict(dict)
    for row in rows:
        by_id[row["id"]][row["arm"]] = row

    supported = Counter()
    items = Counter()
    for arm, s in score.items():
        for d in s.get("detail", []):
            items[(d["id"], arm)] += 1
            if d["support"] is True:
                supported[(d["id"], arm)] += 1

    def support_rate(i: str, arm: str) -> float:
        n = items[(i, arm)]
        return supported[(i, arm)] / n if n else 0.0

    ids = sorted(i for i, arms in by_id.items() if "B" in arms and "DA" in arms)
    f1_b = {i: f1(by_id[i]["B"]["formatted"], by_id[i]["B"]["gold"]) for i in ids}
    f1_d = {i: f1(by_id[i]["DA"]["formatted"], by_id[i]["DA"]["gold"]) for i in ids}
    sup_b = {i: support_rate(i, "B") for i in ids}
    sup_d = {i: support_rate(i, "DA") for i in ids}
    cov_b = {i: 0 if by_id[i]["B"]["not_found"] else 1 for i in ids}
    cov_d = {i: 0 if by_id[i]["DA"]["not_found"] else 1 for i in ids}

    print(f"questions: {len(ids)}")
    print(f"B : F1 {100*mean(list(f1_b.values())):.1f}  citation support {100*mean(list(sup_b.values())):.1f}  coverage {100*mean(list(cov_b.values())):.1f}")
    print(f"DA: F1 {100*mean(list(f1_d.values())):.1f}  citation support {100*mean(list(sup_d.values())):.1f}  coverage {100*mean(list(cov_d.values())):.1f}")

    diffs = {
        "F1": [f1_d[i] - f1_b[i] for i in ids],
        "citation_support": [sup_d[i] - sup_b[i] for i in ids],
        "coverage": [cov_d[i] - cov_b[i] for i in ids],
    }
    rng = random.Random(args.seed)
    for name, ds in diffs.items():
        boots = []
        for _ in range(args.boot):
            sample = [ds[rng.randrange(len(ds))] for _ in ds]
            boots.append(mean(sample))
        lo, hi = pct(boots, 0.025), pct(boots, 0.975)
        wins = sum(1 for d in ds if d > 1e-9)
        losses = sum(1 for d in ds if d < -1e-9)
        print(f"DA-B {name:16s}: {100*mean(ds):+.1f}  95% [{100*lo:+.1f}, {100*hi:+.1f}]  wins {wins} losses {losses} ties {len(ds)-wins-losses}")

    attempts = sum(len(r["answers"]) + r.get("rejected", 0) for r in rows if r["arm"] == "DA")
    ok = sum(len(r["answers"]) for r in rows if r["arm"] == "DA")
    print(f"DA quote validity: {100*ok/attempts:.1f}% ({ok}/{attempts})" if attempts else "DA quote validity: n/a")
    errs = Counter(r["arm"] for r in rows if r.get("error"))
    print(f"JSON errors: {dict(errs)}")
    cost = sum((r.get("usage") or {}).get("cost", 0) or 0 for r in rows)
    print(f"cost: ${cost:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
