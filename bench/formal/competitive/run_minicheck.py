"""Run MiniCheck (Ollama `bespoke-minicheck`) over a claim set.

Local, no API cost. Writes a detector score file compatible with
`formal.competitive`.

    .venv/bin/python competitive/run_minicheck.py \
      --input competitive/pilot-50.jsonl \
      --output competitive/detectors/minicheck.jsonl
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

OLLAMA = "http://localhost:11434/api/generate"


def check(model: str, document: str, claim: str, max_chars: int) -> tuple[str, float, str]:
    doc = document[:max_chars]
    prompt = f"Document: {doc}\nClaim: {claim}"
    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA, data=payload, headers={"Content-Type": "application/json"}
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as response:
        data = json.loads(response.read())
    elapsed = time.perf_counter() - t0
    raw = str(data.get("response", "")).strip()
    low = raw.lower()
    if low.startswith("yes"):
        return "supported", 1.0, raw
    if low.startswith("no"):
        return "contradicted", 0.0, raw
    return "unknown", 0.5, raw


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run MiniCheck via Ollama")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default="bespoke-minicheck")
    parser.add_argument("--max-chars", type=int, default=6000)
    args = parser.parse_args(argv)

    rows = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    out = []
    t0 = time.perf_counter()
    for i, row in enumerate(rows, 1):
        label, score, raw = check(
            args.model, str(row.get("evidence", "")), str(row["answer"]), args.max_chars
        )
        out.append(
            {
                "id": row["id"],
                "label": label,
                "score": score,
                "model": args.model,
                "raw": raw,
            }
        )
        print(f"[{i}/{len(rows)}] {row['id']} -> {label}", flush=True)
    elapsed = time.perf_counter() - t0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(x) + "\n" for x in out), encoding="utf-8"
    )
    print(f"wrote {len(out)} rows -> {args.output} in {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
