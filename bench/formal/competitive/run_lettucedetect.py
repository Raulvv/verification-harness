"""Run LettuceDetect locally over a claim set.

Uses the ModernBERT base detector (MIT). No API cost.

    .venv-detectors/bin/python competitive/run_lettucedetect.py \
      --input competitive/pilot-50.jsonl \
      --output competitive/detectors/lettucedetect.jsonl
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

MODEL = "KRLabsOrg/lettucedect-base-modernbert-en-v1"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run LettuceDetect locally")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--max-chars", type=int, default=6000)
    args = parser.parse_args(argv)

    from lettucedetect.models.inference import HallucinationDetector

    detector = HallucinationDetector(method="transformer", model_path=args.model)
    rows = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    out = []
    t0 = time.perf_counter()
    for i, row in enumerate(rows, 1):
        evidence = str(row.get("evidence", ""))[: args.max_chars]
        try:
            spans = detector.predict(
                context=[evidence],
                question=str(row["question"]),
                answer=str(row["answer"]),
                output_format="spans",
            )
        except Exception as exc:  # one bad claim must not kill the run
            spans = []
            label = "unknown"
            score = 0.5
            raw = f"error: {exc}"
        else:
            label = "contradicted" if spans else "supported"
            score = 0.0 if spans else 1.0
            raw = json.dumps(spans)
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
