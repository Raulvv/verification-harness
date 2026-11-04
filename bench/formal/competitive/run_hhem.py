"""Run Vectara HHEM-2.1-Open locally over a claim set.

Local, no API cost. Writes a detector score file compatible with
`formal.competitive`.

    .venv-detectors/bin/python competitive/run_hhem.py \
      --input competitive/pilot-50.jsonl \
      --output competitive/detectors/hhem.jsonl
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

MODEL = "vectara/hallucination_evaluation_model"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run HHEM locally")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--max-chars", type=int, default=6000)
    args = parser.parse_args(argv)

    from transformers import AutoModelForSequenceClassification

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, trust_remote_code=True
    )
    model.eval()
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
            score = float(model.predict([(evidence, str(row["answer"]))])[0])
        except Exception as exc:
            score = 0.5
            label = "unknown"
            raw = f"error: {exc}"
        else:
            label = "supported" if score >= 0.5 else "contradicted"
            raw = str(score)
        out.append(
            {
                "id": row["id"],
                "label": label,
                "score": score,
                "model": args.model,
                "raw": raw,
            }
        )
        print(f"[{i}/{len(rows)}] {row['id']} -> {label} ({score:.3f})", flush=True)
    elapsed = time.perf_counter() - t0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(x) + "\n" for x in out), encoding="utf-8"
    )
    print(f"wrote {len(out)} rows -> {args.output} in {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
