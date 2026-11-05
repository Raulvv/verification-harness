"""Validate the H3 hard set (no model calls)."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.parse import find_entities  # noqa: E402
from formal.rows import build_dataset  # noqa: E402

HERE = Path(__file__).resolve().parent
INPUT = HERE / "private" / "hard-h3-100.jsonl"
MANIFEST = HERE / "private" / "hard-h3-100-manifest.json"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def main() -> None:
    ds = build_dataset()
    rows = [json.loads(line) for line in INPUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    paid = [row for row in rows if True]  # placeholder
    paid = [row for row in ds.rows if row.annual is not None]
    errors = []
    seen = set()
    for row in rows:
        q = row["question"]
        if norm(q) in seen:
            errors.append((row["id"], "duplicate"))
        seen.add(norm(q))
        for item in row.get("evidence", []):
            path = CORPUS / f"{item['slug']}.md"
            if not path.exists() or item["quote"] not in path.read_text(encoding="utf-8"):
                errors.append((row["id"], f"bad quote {item['slug']}"))
        t = row["type"]
        if t == "multi_count":
            m = re.search(r"growth rate above (\d+)%.*pay above \$([\d,]+)", q, re.I)
            if not m:
                errors.append((row["id"], "cannot parse thresholds"))
                continue
            g, p = int(m.group(1)), int(m.group(2).replace(",", ""))
            if sum(1 for r in paid if r.outlook_pct > g and r.annual > p) != row["gold"]:
                errors.append((row["id"], "count mismatch"))
        elif t == "multi_extremum":
            m = re.search(r"growth rate above (\d+)%.*pay above \$([\d,]+)", q, re.I)
            if not m:
                errors.append((row["id"], "cannot parse thresholds"))
                continue
            g, p = int(m.group(1)), int(m.group(2).replace(",", ""))
            cand = [r for r in paid if r.outlook_pct > g and r.annual > p]
            field = "annual_openings" if "annual openings" in q else "annual"
            winner = max(cand, key=lambda r: getattr(r, field))
            if row["gold"] != {"winner": winner.title, "value": getattr(winner, field)}:
                errors.append((row["id"], "extremum mismatch"))
        elif t == "multi_sum":
            m = re.search(r"growth rate above (\d+)%.*pay above \$([\d,]+)", q, re.I)
            if not m:
                errors.append((row["id"], "cannot parse thresholds"))
                continue
            g, p = int(m.group(1)), int(m.group(2).replace(",", ""))
            cand = [r for r in paid if r.outlook_pct > g and r.annual > p]
            if sum(r.jobs for r in cand) != row["gold"]:
                errors.append((row["id"], "sum mismatch"))
        elif t == "top_k":
            m = re.search(r"faster than (\d+)%", q, re.I)
            if not m:
                errors.append((row["id"], "cannot parse growth"))
                continue
            g = int(m.group(1))
            cand = [r for r in paid if r.outlook_pct > g]
            field = "annual_openings" if "annual openings" in q else "annual"
            top = sorted(cand, key=lambda r: getattr(r, field), reverse=True)[:3]
            expected = [
                {"title": r.title, "pay" if field == "annual" else "openings": getattr(r, field)}
                for r in top
            ]
            if row["gold"] != expected:
                errors.append((row["id"], "top-k mismatch"))
        elif t == "directional_difference":
            titles = find_entities(q, ds)
            if len(titles) != 2:
                errors.append((row["id"], f"entities {titles}"))
                continue
            a, b = ds.by_title[titles[0]], ds.by_title[titles[1]]
            if a.annual_openings - b.annual_openings != row["gold"]:
                errors.append((row["id"], "directional mismatch"))
        elif t == "negation":
            m = re.search(r"growth rate above (\d+)%.*does not require a (.+?) has", q, re.I)
            if not m:
                errors.append((row["id"], "cannot parse negation"))
                continue
            g, edu = int(m.group(1)), m.group(2).strip()
            cand = [r for r in paid if r.outlook_pct > g and r.education != edu]
            winner = max(cand, key=lambda r: r.annual)
            if row["gold"] != {"winner": winner.title, "pay": winner.annual}:
                errors.append((row["id"], "negation mismatch"))
        elif t == "equality_filter":
            m = re.search(r"exactly (\d+)% projected growth", q, re.I)
            if not m:
                errors.append((row["id"], "cannot parse equality"))
                continue
            g = int(m.group(1))
            cand = [r for r in paid if r.outlook_pct == g]
            winner = max(cand, key=lambda r: r.annual)
            if row["gold"] != {"winner": winner.title, "pay": winner.annual}:
                errors.append((row["id"], "equality mismatch"))
        elif t in ("ambiguity", "tie_break"):
            if not row.get("expected_verdict"):
                errors.append((row["id"], "missing expected_verdict"))
        elif t == "partial":
            if not isinstance(row["gold"], dict) or len(row["gold"].get("parts", [])) != 2:
                errors.append((row["id"], "bad partial gold"))
        else:
            errors.append((row["id"], f"unknown type {t}"))

    digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    print(f"rows: {len(rows)}")
    print(f"sha256: {digest}")
    print(f"errors: {len(errors)}")
    for rid, reason in errors[:30]:
        print(f"  {rid}: {reason}")
    if errors:
        raise SystemExit(1)
    human_approved = all(str(row.get("validation", "")) == "human-approved" for row in rows)
    MANIFEST.write_text(
        json.dumps(
            {
                "path": str(INPUT),
                "sha256": digest,
                "count": len(rows),
                "types": dict((t, sum(1 for r in rows if r["type"] == t)) for t in {r["type"] for r in rows}),
                "conditions": dict((c, sum(1 for r in rows if r["condition"] == c)) for c in {r["condition"] for r in rows}),
                "validation": "human-approved" if human_approved else "mechanically validated; human review required",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {MANIFEST}")


if __name__ == "__main__":
    main()
