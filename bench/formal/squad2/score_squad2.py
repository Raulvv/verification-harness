"""Score the SQuAD 2.0 mixed test.

    .venv-detectors/bin/python squad2/score_squad2.py \
      --rows competitive/private/squad2/runs/squad2-mix-200.jsonl
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


def norm(s: str) -> str:
    s = str(s).lower()
    s = "".join(ch for ch in s if ch not in set(string.punctuation))
    s = re.sub(r"\b(a|an|the)\b", " ", s)
    return " ".join(s.split())


def em(pred: str, golds: list[str]) -> int:
    return int(any(norm(pred) == norm(g) for g in golds))


def f1(pred: str, golds: list[str]) -> float:
    best = 0.0
    p = norm(pred).split()
    for g in golds:
        g = norm(g).split()
        if not p or not g:
            best = max(best, float(p == g))
            continue
        common = Counter(p) & Counter(g)
        same = sum(common.values())
        if not same:
            continue
        prec, rec = same / len(p), same / len(g)
        best = max(best, 2 * prec * rec / (prec + rec))
    return best


def pct(xs: list[float], p: float) -> float:
    ys = sorted(xs)
    if not ys:
        return 0.0
    k = min(len(ys) - 1, max(0, int(round(p * (len(ys) - 1)))))
    return ys[k]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=Path, required=True)
    parser.add_argument("--boot", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines() if line.strip()]
    per: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        ans_em = 0 if r["impossible"] else em(r["answer"], r["gold"])
        ans_f1 = 0.0 if r["impossible"] else f1(r["answer"], r["gold"])
        abstain = 1 if r["abstained"] else 0
        false_answer = 1 if r["impossible"] and not r["abstained"] else 0
        overall = abstain if r["impossible"] else ans_em
        attempted = (0 if r["abstained"] and not r.get("rejected") else 1)
        per[r["id"]][r["arm"]] = {
            "impossible": r["impossible"],
            "em": ans_em,
            "f1": ans_f1,
            "abstain": abstain,
            "false_answer": false_answer,
            "overall": overall,
            "attempted": attempted,
            "rejected": r.get("rejected", 0),
        }

    ids = sorted(i for i, a in per.items() if "B" in a and "DA" in a)
    summary = {}
    for arm in ["B", "DA"]:
        pos = [per[i][arm] for i in ids if not per[i][arm]["impossible"]]
        neg = [per[i][arm] for i in ids if per[i][arm]["impossible"]]
        attempted = sum(per[i][arm]["attempted"] for i in ids)
        rejected = sum(per[i][arm]["rejected"] for i in ids)
        valid = attempted - rejected
        summary[arm] = {
            "answerable_n": len(pos),
            "answerable_em": 100 * sum(x["em"] for x in pos) / len(pos) if pos else 0,
            "answerable_f1": 100 * sum(x["f1"] for x in pos) / len(pos) if pos else 0,
            "answerable_abstain": 100 * sum(x["abstain"] for x in pos) / len(pos) if pos else 0,
            "unanswerable_n": len(neg),
            "unanswerable_abstain": 100 * sum(x["abstain"] for x in neg) / len(neg) if neg else 0,
            "unanswerable_false": 100 * sum(x["false_answer"] for x in neg) / len(neg) if neg else 0,
            "overall_exact": 100 * sum(per[i][arm]["overall"] for i in ids) / len(ids) if ids else 0,
            "quote_validity": 100 * valid / attempted if arm == "DA" and attempted else None,
            "attempted": attempted,
            "rejected": rejected,
        }

    print(f"paired questions: {len(ids)}")
    for arm, s in summary.items():
        print(
            f"{arm}: answerable EM {s['answerable_em']:.1f} F1 {s['answerable_f1']:.1f} "
            f"abstain {s['answerable_abstain']:.1f} | unanswerable abstain {s['unanswerable_abstain']:.1f} "
            f"false {s['unanswerable_false']:.1f} | overall {s['overall_exact']:.1f} "
            + (f"| quote {s['quote_validity']:.1f}% ({s['attempted']-s['rejected']}/{s['attempted']})" if arm == "DA" else "")
        )

    rng = random.Random(args.seed)
    for key, label in [
        ("abstain", "unanswerable abstention"),
        ("false_answer", "unanswerable false-answer"),
        ("em", "answerable EM"),
        ("overall", "overall exact"),
    ]:
        ds = [per[i]["DA"][key] - per[i]["B"][key] for i in ids]
        boots = sorted(sum(ds[rng.randrange(len(ds))] for _ in ds) / len(ds) for _ in range(args.boot))
        lo, hi = pct(boots, 0.025), pct(boots, 0.975)
        print(f"DA-B {label:24s}: {100*sum(ds)/len(ds):+.1f}  95% [{100*lo:+.1f}, {100*hi:+.1f}]")

    errs = Counter(r["arm"] for r in rows if r.get("error"))
    cost = sum((r.get("usage") or {}).get("cost", 0) or 0 for r in rows)
    print(f"errors: {dict(errs)}  cost: ${cost:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
