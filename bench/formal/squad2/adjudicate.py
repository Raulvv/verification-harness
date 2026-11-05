"""Adjudicate SQuAD 2.0 unanswerable items that DA answered.

Two judges (local gpt-oss:20b and DeepSeek) decide whether the context
actually answers the question with the model's answer. This separates genuine
false answers from debatable SQuAD labels.

    OPENCODE_API_KEY=... .venv-detectors/bin/python squad2/adjudicate.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROWS = HERE.parent / "competitive" / "private" / "squad2" / "runs" / "squad2-mix-200.jsonl"
OLLAMA = "http://localhost:11434/api/generate"
DEEPSEEK = "https://opencode.ai/inference/openai/v1/chat/completions"


def prompt(row: dict) -> str:
    return (
        "Return ONLY JSON: {\"verdict\":\"SUPPORTED|UNSUPPORTED|AMBIGUOUS\",\"reason\":\"one short sentence\"}.\n"
        "SUPPORTED means the context supports the model answer; UNSUPPORTED means it does not; "
        "AMBIGUOUS means the context cannot decide. The dataset labels the question unanswerable: "
        "ignore that label and judge only the context. Check the exact entity, scope, quantifiers "
        "and negation in the question, not just topical overlap.\n\n"
        f"Question: {row['question']}\n"
        f"Context: {row['context']}\n"
        f"Model answer: {row['answer']}"
    )


def parse(text: str) -> str:
    raw = str(text).strip()
    block = re.search(r"\{[\s\S]*\}", raw)
    if block:
        try:
            verdict = str(json.loads(block.group(0)).get("verdict", "")).upper()
            if verdict in {"UNSUPPORTED", "SUPPORTED", "AMBIGUOUS"}:
                return verdict
        except json.JSONDecodeError:
            pass
    up = raw.upper()
    for label in ("UNSUPPORTED", "SUPPORTED", "AMBIGUOUS"):
        if re.search(rf"\b{label}\b", up):
            return label
    return "UNKNOWN"


def local(model: str, p: str, timeout: int = 300) -> tuple[str, str, float]:
    payload = json.dumps({"model": model, "prompt": p, "stream": False, "format": "json", "options": {"temperature": 0, "num_predict": 2000}}).encode()
    req = urllib.request.Request(OLLAMA, data=payload, headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = str(json.loads(r.read()).get("response", "")).strip()
    return parse(text), text, time.perf_counter() - t0


def remote(key: str, model: str, p: str, timeout: int = 120) -> tuple[str, str, float]:
    payload = json.dumps(
        {"model": model, "messages": [{"role": "user", "content": p}], "temperature": 0, "max_tokens": 3000, "response_format": {"type": "json_object"}}
    ).encode()
    req = urllib.request.Request(
        DEEPSEEK,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "authorization": f"Bearer {key}",
            "x-opencode-session": "ses_" + secrets.token_hex(12),
            "User-Agent": "curl/8.7.1",
        },
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    text = str(data["choices"][0]["message"]["content"]).strip()
    return parse(text), text, time.perf_counter() - t0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=Path, default=DEFAULT_ROWS)
    parser.add_argument("--out", type=Path, default=DEFAULT_ROWS.with_name("squad2-adjudication.jsonl"))
    parser.add_argument("--local-model", default="gpt-oss:20b")
    parser.add_argument("--remote-model", default="deepseek-v4.1-flash")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--arm", default="DA")
    args = parser.parse_args(argv)

    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines() if line.strip()]
    items = [r for r in rows if r["arm"] == args.arm and r["impossible"] and not r["abstained"]]
    if args.limit:
        items = items[: args.limit]
    key = os.environ.get("OPENCODE_API_KEY")
    out = []
    for i, row in enumerate(items, 1):
        p = prompt(row)
        l_label, l_raw, l_s = local(args.local_model, p)
        r_label, r_raw, r_s = (None, "", 0.0) if not key else remote(key, args.remote_model, p)
        out.append({**row, "judge_local": l_label, "judge_remote": r_label, "judge_local_raw": l_raw, "judge_remote_raw": r_raw})
        print(f"[{i}/{len(items)}] local={l_label} remote={r_label} ({l_s:.1f}s/{r_s:.1f}s) | {row['question'][:70]}", flush=True)

    args.out.write_text("".join(json.dumps(r) + "\n" for r in out), encoding="utf-8")
    counts = {"genuine_unsupported": 0, "label_noise_supported": 0, "ambiguous": 0}
    for r in out:
        pair = {r["judge_local"], r["judge_remote"]}
        if pair == {"UNSUPPORTED"}:
            counts["genuine_unsupported"] += 1
        elif pair == {"SUPPORTED"}:
            counts["label_noise_supported"] += 1
        else:
            counts["ambiguous"] += 1
    print(f"\nanswered unanswerable items: {len(out)}")
    print(json.dumps(counts, indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
