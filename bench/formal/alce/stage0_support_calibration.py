"""Stage 0: can a local judge separate supporting from non-supporting citations?

Builds pairs from QAMPARI's oracle passages using ALCE's own `answers_found`
labels, then compares Ollama MiniCheck with a reference API judge.

    OPENCODE_API_KEY=... .venv-detectors/bin/python alce/stage0_support_calibration.py
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import secrets
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE.parent / "competitive" / "private" / "alce" / "ALCE-data" / "qampari_eval_gtr_top100_reranked_oracle.json"
OLLAMA = "http://localhost:11434/api/generate"
DEEPSEEK = "https://opencode.ai/inference/openai/v1/chat/completions"


def norm(text: str) -> str:
    s = str(text).lower()
    s = re.sub(r"\b(a|an|the)\b", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(s.split())


def ollama(model: str, document: str, claim: str, timeout: int = 180) -> tuple[bool | None, str, float]:
    payload = json.dumps(
        {
            "model": model,
            "prompt": f"Document: {document}\nClaim: {claim}",
            "stream": False,
            "options": {"temperature": 0},
        }
    ).encode()
    req = urllib.request.Request(OLLAMA, data=payload, headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = str(json.loads(response.read()).get("response", "")).strip()
    except (urllib.error.URLError, TimeoutError) as exc:
        return None, f"error: {exc}", time.perf_counter() - t0
    low = raw.lower()
    label = True if low.startswith("yes") else False if low.startswith("no") else None
    return label, raw, time.perf_counter() - t0


def reference(model: str, api_key: str, document: str, claim: str, timeout: int = 120) -> tuple[bool | None, str, float, dict]:
    prompt = (
        "Does the document support the claim? Answer only Yes or No.\n\n"
        f"Document: {document}\nClaim: {claim}"
    )
    payload = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 300,
        }
    ).encode()
    req = urllib.request.Request(
        DEEPSEEK,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "authorization": f"Bearer {api_key}",
            "x-opencode-session": "ses_" + secrets.token_hex(12),
            "User-Agent": "curl/8.7.1",
        },
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        return None, f"HTTP {exc.code}", time.perf_counter() - t0, {}
    raw = str(data["choices"][0]["message"]["content"]).strip()
    low = raw.lower()
    label = True if re.match(r"^\s*yes\b", low) else False if re.match(r"^\s*no\b", low) else None
    return label, raw, time.perf_counter() - t0, data.get("usage") or {}


def build_pairs(rows: list[dict], n_questions: int, per_question: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    sample = list(rows)
    rng.shuffle(sample)
    pairs = []
    questions_used = 0
    for item in sample:
        if questions_used >= n_questions:
            break
        used = 0
        before = len(pairs)
        for i, aliases in enumerate(item["answers"]):
            if used >= per_question:
                break
            def found(doc):
                flags = doc.get("answers_found") or []
                return len(flags) > i and flags[i] == 1
            positive_docs = [d for d in item["docs"] if found(d)]
            negative_docs = [d for d in item["docs"] if not found(d)]
            if not positive_docs or not negative_docs:
                continue
            answer = aliases[0]
            claim = f"{item['question']} {answer}"
            pos = rng.choice(positive_docs)
            neg = rng.choice(negative_docs)
            for doc, label, kind in ((pos, 1, "support"), (neg, 0, "non_support")):
                pairs.append(
                    {
                        "id": f"{item['id']}-{i}-{kind}",
                        "question": item["question"],
                        "answer": answer,
                        "claim": claim,
                        "doc_title": doc.get("title", ""),
                        "document": doc["text"],
                        "label": label,
                    }
                )
            used += 1
        if len(pairs) > before:
            questions_used += 1
    return pairs


def score(preds: list[bool | None], labels: list[int]) -> dict:
    tp = sum(1 for p, y in zip(preds, labels) if p is True and y == 1)
    tn = sum(1 for p, y in zip(preds, labels) if p is False and y == 0)
    fp = sum(1 for p, y in zip(preds, labels) if p is True and y == 0)
    fn = sum(1 for p, y in zip(preds, labels) if p is False and y == 1)
    unknown = sum(1 for p in preds if p is None)
    n = len(labels)
    return {
        "n": n,
        "accuracy": (tp + tn) / n if n else 0,
        "tpr": tp / (tp + fn) if tp + fn else 0,
        "tnr": tn / (tn + fp) if tn + fp else 0,
        "unknown": unknown,
        "tp": tp, "tn": tn, "fp": fp, "fn": fn,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--questions", type=int, default=40)
    parser.add_argument("--per-question", type=int, default=2)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--minicheck-model", default="bespoke-minicheck:latest")
    parser.add_argument("--reference-model", default="deepseek-v4.1-flash")
    parser.add_argument("--out", type=Path, default=HERE.parent / "competitive" / "private" / "alce" / "runs" / "stage0-report.json")
    args = parser.parse_args(argv)

    rows = json.loads(args.data.read_text(encoding="utf-8"))
    pairs = build_pairs(rows, args.questions, args.per_question, args.seed)
    print(f"pairs: {len(pairs)} ({sum(p['label'] for p in pairs)} support, {sum(1 - p['label'] for p in pairs)} non-support)")

    api_key = os.environ.get("OPENCODE_API_KEY")
    mc, ref = [], []
    detail = []
    t0 = time.perf_counter()
    for i, pair in enumerate(pairs, 1):
        m_label, m_raw, m_s = ollama(args.minicheck_model, pair["document"], pair["claim"])
        r_label, r_raw, r_s, r_usage = (None, "", 0.0, {}) if not api_key else reference(
            args.reference_model, api_key, pair["document"], pair["claim"]
        )
        mc.append(m_label)
        ref.append(r_label)
        detail.append({**pair, "minicheck": m_label, "minicheck_raw": m_raw, "reference": r_label, "reference_raw": r_raw})
        print(f"[{i}/{len(pairs)}] label={pair['label']} minicheck={m_label} ref={r_label} ({m_s:.1f}s)", flush=True)
    elapsed = time.perf_counter() - t0

    labels = [p["label"] for p in pairs]
    mc_score = score(mc, labels)
    ref_score = score(ref, labels)
    both = [(m, r) for m, r in zip(mc, ref) if m is not None and r is not None]
    agreement = sum(1 for m, r in both if m == r) / len(both) if both else 0

    report = {
        "data": str(args.data),
        "pairs": len(pairs),
        "seed": args.seed,
        "minicheck": mc_score,
        "reference": ref_score,
        "agreement_minicheck_reference": agreement,
        "agreement_n": len(both),
        "elapsed_s": elapsed,
        "detail": detail,
    }
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "detail"}, indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
