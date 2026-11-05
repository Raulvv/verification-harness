"""Validate the H3 paraphrase set (and merge blind items).

Gold is recomputed from each row's explicit spec; a stored gold that disagrees
is an error. Blind rows may omit gold, evidence and sources — they are filled
here, so gold is never hand-typed.

    .venv/bin/python competitive/validate_h3_paraphrase.py
    .venv/bin/python competitive/validate_h3_paraphrase.py \
      --input competitive/private/hard-h3-paraphrase-30.jsonl \
      --input competitive/private/hard-h3-paraphrase-blind.jsonl \
      --out competitive/private/hard-h3-paraphrase-35.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.rows import build_dataset  # noqa: E402
from competitive.build_h3_paraphrase import (  # noqa: E402
    compute_gold, evidence_for, gold_for, key_for_gold, sources_for,
)

HERE = Path(__file__).resolve().parent
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"
SOURCE = HERE / "private" / "hard-h3-100.jsonl"
DEFAULT_IN = [HERE / "private" / "hard-h3-paraphrase-30.jsonl"]
TYPES = {
    "multi_count", "multi_extremum", "multi_sum", "top_k",
    "directional_difference", "negation", "equality_filter",
}


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, action="append")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args(argv)

    inputs = args.input or DEFAULT_IN
    rows: list[dict] = []
    for path in inputs:
        rows.extend(json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    ds = build_dataset()
    source = {r["id"]: r for r in (json.loads(l) for l in SOURCE.read_text(encoding="utf-8").splitlines() if l.strip())}

    errors = []
    seen_q = set()
    seen_id = set()
    for row in rows:
        rid = row.get("id")
        if not rid or rid in seen_id:
            errors.append((rid, "missing or duplicate id"))
        seen_id.add(rid)
        q = row.get("question", "")
        if not q or norm(q) in seen_q:
            errors.append((rid, "missing or duplicate question"))
        seen_q.add(norm(q))
        if row.get("type") not in TYPES:
            errors.append((rid, f"unknown type {row.get('type')}"))
            continue
        if not isinstance(row.get("spec"), dict):
            errors.append((rid, "missing spec"))
            continue
        try:
            gold = compute_gold(ds, row)
        except Exception as exc:  # noqa: BLE001 - surface every bad spec
            errors.append((rid, f"spec does not compute: {exc}"))
            continue
        if "gold" in row and key_for_gold(row["gold"]) != key_for_gold(gold):
            errors.append((rid, "stored gold disagrees with spec"))
        row["gold"] = gold
        matches = gold_for(ds, row["spec"])
        if not matches and row["spec"]["op"] != "count":
            errors.append((rid, "no matching rows"))
        if not row.get("evidence"):
            row["evidence"] = evidence_for(row, matches, ds)
        if not row.get("sources"):
            row["sources"] = sources_for(row, matches)
        for item in row["evidence"]:
            path = CORPUS / f"{item['slug']}.md"
            if not path.exists() or item["quote"] not in path.read_text(encoding="utf-8"):
                errors.append((rid, f"bad quote {item['slug']}"))
        src_id = row.get("source_id")
        if src_id:
            if src_id not in source:
                errors.append((rid, f"unknown source_id {src_id}"))
            elif key_for_gold(gold) != key_for_gold(source[src_id]["gold"]):
                errors.append((rid, f"same-target gold mismatch vs {src_id}"))
        row.setdefault("split", "hard-h3-paraphrase")
        row.setdefault("level", "H3-P")
        row.setdefault("condition", "answerable")
        row.setdefault("validation", "candidate")

    print(f"rows: {len(rows)}")
    print(f"types: {dict(Counter(r.get('type') for r in rows))}")
    print(f"targets: {dict(Counter(r.get('target', 'blind') for r in rows))}")
    print(f"errors: {len(errors)}")
    for rid, reason in errors[:30]:
        print(f"  {rid}: {reason}")
    if errors:
        return 1

    digest = hashlib.sha256("".join(json.dumps(r) + "\n" for r in rows).encode()).hexdigest()
    print(f"sha256 (canonical): {digest}")
    out = args.out
    if out:
        out.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
        print(f"wrote {len(rows)} -> {out}")
    manifest_path = args.manifest or (out.with_name(out.stem + "-manifest.json") if out else None)
    if manifest_path:
        approved = all(str(r.get("validation")) == "human-approved" for r in rows)
        manifest_path.write_text(
            json.dumps(
                {
                    "path": str(out or inputs[0]),
                    "sha256": hashlib.sha256((out or inputs[0]).read_bytes()).hexdigest() if (out or inputs[0]).exists() else digest,
                    "count": len(rows),
                    "types": dict(Counter(r.get("type") for r in rows)),
                    "targets": dict(Counter(r.get("target", "blind") for r in rows)),
                    "validation": "human-approved" if approved else "candidate; human review required",
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
