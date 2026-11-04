"""Build the H2 hard set: multi-hop projected 2033 employment.

100 answerable questions requiring jobs2033 = jobs + change:
40 difference, 30 compare, 30 extremum.

    .venv/bin/python competitive/build_hard_h2.py
"""

from __future__ import annotations

import hashlib
import itertools
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.compile import derive_answer  # noqa: E402
from formal.parse import parse_question  # noqa: E402
from formal.rows import build_dataset  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "private" / "hard-h2-100.jsonl"
MANIFEST = HERE / "private" / "hard-h2-100-manifest.json"
EXISTING = [
    ROOT / "bench" / "ooh-test-questions.jsonl",
    ROOT / "bench" / "ooh-pilot-v2.jsonl",
    HERE / "private" / "fresh-300.jsonl",
]
SEED = 0


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def sig(qir) -> tuple:
    if qir.kind in ("difference", "sum", "compare"):
        return (qir.kind, qir.field, tuple(sorted(qir.entities)))
    if qir.kind == "extremum":
        return (
            "extremum",
            qir.field,
            qir.op,
            qir.candidate_set.kind if qir.candidate_set else None,
            tuple(sorted(qir.entities)),
            str(qir.filter),
        )
    return (qir.kind, qir.question)


def quotes(row, fields):
    keys = {"jobs": "Number of Jobs, 2023", "change": "Employment Change, 2023-33"}
    return [
        {"slug": row.slug, "title": row.title, "quote": row.quotes[keys[field]]}
        for field in fields
    ]


def main() -> None:
    dataset = build_dataset()
    rows = list(dataset.rows)
    used_text: set[str] = set()
    used_sig: set[tuple] = set()
    for path in EXISTING:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            question = str(item.get("question", ""))
            if not question:
                continue
            used_text.add(norm(question))
            qir = parse_question(str(item.get("id", "existing")), question, dataset)
            if qir.kind not in ("not_formalizable", "partial", "absence"):
                used_sig.add(sig(qir))

    rng = random.Random(SEED)
    out: list[dict] = []
    skipped = Counter()

    def add(question, gold, formula, evidence_items, sources, expected_kind):
        key = norm(question)
        if key in used_text:
            skipped["duplicate_text"] += 1
            return False
        qir = parse_question(f"hard-h2-{len(out) + 1:03d}", question, dataset)
        if qir.kind != expected_kind:
            skipped[f"parse_{qir.kind}"] += 1
            return False
        key_sig = sig(qir)
        if key_sig in used_sig:
            skipped["duplicate_sig"] += 1
            return False
        answer = derive_answer(qir, dataset)
        if qir.kind in ("difference", "sum"):
            actual = answer.parts[0].claim.rhs.value
            if actual != gold:
                skipped["gold_mismatch"] += 1
                return False
        elif qir.kind == "compare":
            actual_diff = answer.parts[1].claim.rhs.value if len(answer.parts) > 1 else None
            if actual_diff != gold["difference"]:
                skipped["gold_mismatch"] += 1
                return False
        elif qir.kind == "extremum":
            actual_winner = answer.parts[0].claim.rhs.value
            actual_value = answer.parts[1].claim.rhs.value if len(answer.parts) > 1 else None
            if actual_winner != gold["winner"] or actual_value != gold["value"]:
                skipped["gold_mismatch"] += 1
                return False
        used_text.add(key)
        used_sig.add(key_sig)
        out.append(
            {
                "id": f"hard-h2-{len(out) + 1:03d}",
                "split": "hard-h2",
                "condition": "answerable",
                "question": question,
                "gold": gold,
                "formula": formula,
                "evidence": evidence_items,
                "sources": sources,
                "validation": "candidate",
                "notes": "Derived from jobs + change; requires two Quick Facts per occupation.",
            }
        )
        return True

    pairs = list(itertools.combinations(rows, 2))
    rng.shuffle(pairs)
    for a, b in pairs:
        if sum(1 for row in out if "difference" in row["question"]) >= 40:
            break
        va, vb = a.jobs2033, b.jobs2033
        add(
            f"What is the difference in projected 2033 employment between {a.title} and {b.title}?",
            abs(va - vb),
            f"({a.jobs:,} + {a.change:,}) − ({b.jobs:,} + {b.change:,}) = {abs(va - vb):,}",
            quotes(a, ("jobs", "change")) + quotes(b, ("jobs", "change")),
            [a.slug, b.slug],
            "difference",
        )

    for a, b in pairs:
        if sum(1 for row in out if "higher projected 2033 employment" in row["question"]) >= 30:
            break
        va, vb = a.jobs2033, b.jobs2033
        if va == vb:
            continue
        winner, loser = (a, b) if va > vb else (b, a)
        diff = abs(va - vb)
        add(
            f"Which has the higher projected 2033 employment, {a.title} or {b.title}, and by how much?",
            {"winner": winner.title, "difference": diff},
            f"({winner.jobs:,} + {winner.change:,}) − ({loser.jobs:,} + {loser.change:,}) = {diff:,}",
            quotes(a, ("jobs", "change")) + quotes(b, ("jobs", "change")),
            [a.slug, b.slug],
            "compare",
        )

    triples = list(itertools.combinations(rows, 3))
    rng.shuffle(triples)
    for a, b, c in triples:
        if sum(1 for row in out if "highest projected 2033 employment" in row["question"]) >= 30:
            break
        winner = max((a, b, c), key=lambda row: row.jobs2033)
        add(
            f"Among {a.title}, {b.title}, and {c.title}, which has the highest projected 2033 employment, and what is that employment?",
            {"winner": winner.title, "value": winner.jobs2033},
            None,
            quotes(a, ("jobs", "change")) + quotes(b, ("jobs", "change")) + quotes(c, ("jobs", "change")),
            [a.slug, b.slug, c.slug],
            "extremum",
        )

    if len(out) != 100:
        raise SystemExit(f"expected 100 questions, got {len(out)}: {skipped}")
    OUT.write_text("".join(json.dumps(row) + "\n" for row in out), encoding="utf-8")
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    MANIFEST.write_text(
        json.dumps(
            {
                "path": str(OUT),
                "sha256": digest,
                "count": len(out),
                "conditions": dict(Counter(row["condition"] for row in out)),
                "categories": dict(Counter(parse_question(row["id"], row["question"], dataset).kind for row in out)),
                "skipped": dict(skipped),
                "validation": "candidate; human review required",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(out)} -> {OUT}")
    print("sha256:", digest)
    print("categories:", dict(Counter(parse_question(row["id"], row["question"], dataset).kind for row in out)))
    print("skipped:", dict(skipped))


if __name__ == "__main__":
    main()
