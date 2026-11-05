"""Score a QAMPARI pilot: correctness (ALCE F1), citation support (MiniCheck),
quote validity (DA), and coverage.

    .venv-detectors/bin/python alce/score_qampari.py --rows alce/qampari-pilot.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import string
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "competitive" / "private" / "alce" / "ALCE-data" / "qampari_eval_gtr_top100_reranked_oracle.json"
OLLAMA = "http://localhost:11434/api/generate"


def normalize_answer(s: str) -> str:
    s = str(s).lower()
    s = "".join(ch for ch in s if ch not in set(string.punctuation))
    s = re.sub(r"\b(a|an|the)\b", " ", s)
    return " ".join(s.split())


def qampari_scores(formatted: str, gold: list[list[str]]) -> dict:
    stripped = re.sub(r"\[\d+\]", "", formatted)
    preds = [normalize_answer(x.strip()) for x in stripped.rstrip().rstrip(".").rstrip(",").split(",")]
    preds = [p for p in preds if p]
    answers = [[normalize_answer(x) for x in group] for group in gold]
    flat = [x for group in answers for x in group]
    prec = sum(1 for p in preds if p in flat) / len(preds) if preds else 0.0
    rec = sum(1 for group in answers if any(x in preds for x in group)) / len(answers) if answers else 0.0
    rec5 = min(5, sum(1 for group in answers if any(x in preds for x in group))) / min(5, len(answers)) if answers else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    f1_5 = 2 * prec * rec5 / (prec + rec5) if prec + rec5 else 0.0
    return {"prec": prec, "rec": rec, "rec5": rec5, "f1": f1, "f1_5": f1_5, "n_pred": len(preds)}


def minicheck(document: str, claim: str, model: str = "bespoke-minicheck:latest", timeout: int = 180) -> bool | None:
    payload = json.dumps(
        {"model": model, "prompt": f"Document: {document}\nClaim: {claim}", "stream": False, "options": {"temperature": 0}}
    ).encode()
    req = urllib.request.Request(OLLAMA, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = str(json.loads(response.read()).get("response", "")).strip().lower()
    return True if raw.startswith("yes") else False if raw.startswith("no") else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=Path, default=HERE.parent / "competitive" / "private" / "alce" / "runs" / "qampari-pilot.jsonl")
    parser.add_argument("--out", type=Path, default=HERE.parent / "competitive" / "private" / "alce" / "runs" / "qampari-pilot-score.json")
    parser.add_argument("--model", default="bespoke-minicheck:latest")
    args = parser.parse_args(argv)

    data = {x["id"]: x for x in json.loads(DATA.read_text(encoding="utf-8"))}
    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines() if line.strip()]
    by_arm: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_arm[row["arm"]].append(row)

    summary = {}
    t0 = time.perf_counter()
    for arm, arm_rows in sorted(by_arm.items()):
        f1s, coverage, n_answers, rejected, quote_ok, quote_attempt = [], [], [], [], [], []
        support_items, total_items, support_cites, total_cites = 0, 0, 0, 0
        detail = []
        for row in arm_rows:
            q = qampari_scores(row["formatted"], row["gold"])
            f1s.append(q)
            coverage.append(0 if row["not_found"] else 1)
            n_answers.append(len(row["answers"]))
            rejected.append(row.get("rejected", 0))
            docs = data[row["id"]]["docs"]
            attempted = len(row["answers"]) + row.get("rejected", 0)
            if arm == "DA":
                quote_attempt.append(attempted)
                quote_ok.append(len(row["answers"]))
            supported = 0
            for a in row["answers"]:
                doc = docs[int(a["doc"]) - 1]
                ok = minicheck(doc["text"], f"{row['question']} {a['text']}", args.model)
                supported += 1 if ok else 0
                total_cites += 1
                support_cites += 1 if ok else 0
                detail.append({"id": row["id"], "arm": arm, "answer": a["text"], "doc": a["doc"], "support": ok})
            total_items += len(row["answers"])
            support_items += supported
        summary[arm] = {
            "questions": len(arm_rows),
            "coverage": sum(coverage) / len(coverage) if coverage else 0,
            "avg_answers": sum(n_answers) / len(n_answers) if n_answers else 0,
            "qampari_prec": 100 * sum(x["prec"] for x in f1s) / len(f1s) if f1s else 0,
            "qampari_rec": 100 * sum(x["rec"] for x in f1s) / len(f1s) if f1s else 0,
            "qampari_f1": 100 * sum(x["f1"] for x in f1s) / len(f1s) if f1s else 0,
            "qampari_rec_top5": 100 * sum(x["rec5"] for x in f1s) / len(f1s) if f1s else 0,
            "qampari_f1_top5": 100 * sum(x["f1_5"] for x in f1s) / len(f1s) if f1s else 0,
            "citation_rec": 100 * support_items / total_items if total_items else 0,
            "citation_prec": 100 * support_cites / total_cites if total_cites else 0,
            "rejected_quotes": sum(rejected),
            "quote_validity": 100 * sum(quote_ok) / sum(quote_attempt) if arm == "DA" and sum(quote_attempt) else None,
            "support_n": total_items,
            "detail": detail,
        }
    elapsed = time.perf_counter() - t0
    args.out.write_text(json.dumps({"summary": summary, "elapsed_s": elapsed}, indent=2) + "\n", encoding="utf-8")
    for arm, s in summary.items():
        print(
            f"{arm}: n={s['questions']} f1={s['qampari_f1']:.1f} prec={s['qampari_prec']:.1f} rec={s['qampari_rec']:.1f} "
            f"cit_rec={s['citation_rec']:.1f} cit_prec={s['citation_prec']:.1f} "
            f"quote={s['quote_validity'] if s['quote_validity'] is None else round(s['quote_validity'], 1)} "
            f"cov={100*s['coverage']:.1f} ans/q={s['avg_answers']:.2f}"
        )
    print(f"wrote {args.out} ({elapsed:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
