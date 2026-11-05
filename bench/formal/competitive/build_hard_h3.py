"""Build the H3 hard set: multi-condition, top-k, edge, and ambiguity.

100 candidate questions for human review. Gold is computed from the 48-row
snapshot; this file does not depend on the reader run.

    .venv/bin/python competitive/build_hard_h3.py
"""

from __future__ import annotations

import hashlib
import json
import random
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
import sys  # noqa: E402
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.rows import build_dataset  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "private" / "hard-h3-100.jsonl"
MANIFEST = HERE / "private" / "hard-h3-100-manifest.json"
SEED = 0

QUOTE_KEY = {
    "annual": "2023 Median Pay",
    "outlook_pct": "Job Outlook, 2023-33",
    "jobs": "Number of Jobs, 2023",
    "change": "Employment Change, 2023-33",
    "annual_openings": "openings",
    "education": "Typical Entry-Level Education",
}


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def ev(rows, fields, limit=12):
    out = []
    for row in rows[:limit]:
        for field in fields:
            out.append(
                {
                    "slug": row.slug,
                    "title": row.title,
                    "quote": row.quotes[QUOTE_KEY[field]],
                }
            )
    return out


def main() -> None:
    ds = build_dataset()
    rows = list(ds.rows)
    paid = [row for row in rows if row.annual is not None]
    out: list[dict] = []
    seen: set[str] = set()

    def add(level, qtype, condition, question, gold, formula, evidence, sources, notes, expected_verdict=None):
        key = norm(question)
        if key in seen or len(out) >= 100:
            return False
        seen.add(key)
        item = {
            "id": f"hard-h3-{len(out) + 1:03d}",
            "split": "hard-h3",
            "level": level,
            "type": qtype,
            "condition": condition,
            "question": question,
            "gold": gold,
            "formula": formula,
            "evidence": evidence,
            "sources": sources,
            "notes": notes,
            "validation": "candidate",
        }
        if expected_verdict:
            item["expected_verdict"] = expected_verdict
        out.append(item)
        return True

    # H3-A: multi-condition count, 20
    for g in (4, 5, 6, 8, 10, 15, 20):
        for p in (50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 120_000):
            matches = [row for row in paid if row.outlook_pct > g and row.annual > p]
            if 1 <= len(matches) <= 25:
                add(
                    "H3-A",
                    "multi_count",
                    "answerable",
                    f"How many occupations with a reported median annual pay have a projected growth rate above {g}% and a median annual pay above ${p:,}?",
                    len(matches),
                    f"{len(matches)} matching paid occupations",
                    ev(matches, ("outlook_pct", "annual")),
                    [row.slug for row in matches],
                    "Multi-condition count over the 46 paid rows.",
                )
            if len(out) >= 20:
                break
        if len(out) >= 20:
            break

    # H3-A: multi-condition extremum, 10
    start = len(out)
    for g in (4, 5, 6, 8, 10, 15):
        for p in (60_000, 80_000, 100_000):
            matches = [row for row in paid if row.outlook_pct > g and row.annual > p]
            if len(matches) < 2:
                continue
            for field, phrase in (("annual", "median annual pay"), ("annual_openings", "annual openings")):
                winner = max(matches, key=lambda row: getattr(row, field))
                add(
                    "H3-A",
                    "multi_extremum",
                    "answerable",
                    f"Among occupations with a projected growth rate above {g}% and a median annual pay above ${p:,}, which has the highest {phrase}, and what is that value?",
                    {"winner": winner.title, "value": getattr(winner, field)},
                    None,
                    ev(matches, ("outlook_pct", "annual")),
                    [row.slug for row in matches],
                    "Multi-condition extremum over the 46 paid rows.",
                )
                if len(out) - start >= 10:
                    break
            if len(out) - start >= 10:
                break
        if len(out) - start >= 10:
            break

    # H3-A: multi-condition sum, 10
    start = len(out)
    for g in (4, 5, 6, 8, 10):
        for p in (60_000, 80_000, 100_000):
            matches = [row for row in paid if row.outlook_pct > g and row.annual > p]
            if len(matches) < 2:
                continue
            total = sum(row.jobs for row in matches)
            add(
                "H3-A",
                "multi_sum",
                "answerable",
                f"What is the combined 2023 employment of occupations with a projected growth rate above {g}% and a median annual pay above ${p:,}?",
                total,
                "+".join(f"{row.jobs:,}" for row in matches) + f" = {total:,}",
                ev(matches, ("jobs", "outlook_pct", "annual")),
                [row.slug for row in matches],
                "Multi-condition sum over the 46 paid rows.",
            )
            if len(out) - start >= 10:
                break
        if len(out) - start >= 10:
            break

    # H3-A: top-k, 10
    start = len(out)
    for g in (0, 2, 4, 5, 6, 8, 10, 15):
        candidates = [row for row in paid if row.outlook_pct > g]
        if len(candidates) < 3:
            continue
        top = sorted(candidates, key=lambda row: row.annual, reverse=True)[:3]
        add(
            "H3-A",
            "top_k",
            "answerable",
            f"Which three occupations have the highest median annual pay among those projected to grow faster than {g}%?",
            [{"title": row.title, "pay": row.annual} for row in top],
            "; ".join(f"{row.title} ${row.annual:,}" for row in top),
            ev(top, ("annual", "outlook_pct")),
            [row.slug for row in top],
            "Top three by median annual pay; no tie in this snapshot.",
        )
        if len(out) - start >= 10:
            break

    # H3-A: directional difference, 5
    pairs = [
        ("Top Executives", "Registered Nurses"),
        ("Software Developers, Quality Assurance Analysts, and Testers", "Accountants and Auditors"),
        ("Registered Nurses", "Top Executives"),
        ("Janitors and Building Cleaners", "Interior Designers"),
        ("Electricians", "Chefs and Head Cooks"),
    ]
    for a_title, b_title in pairs:
        a, b = ds.by_title[a_title], ds.by_title[b_title]
        add(
            "H3-A",
            "directional_difference",
            "answerable",
            f"How many more annual openings does {a.title} have than {b.title}?",
            a.annual_openings - b.annual_openings,
            f"{a.annual_openings:,} − {b.annual_openings:,} = {a.annual_openings - b.annual_openings:,}",
            ev([a, b], ("annual_openings",)),
            [a.slug, b.slug],
            "Signed difference; negative means the first has fewer openings.",
        )

    # H3-A: negation / education filter, 5
    for g, edu in ((5, "Bachelor's degree"), (5, "Master's degree"), (6, "High school diploma or equivalent"), (8, "Postsecondary nondegree award"), (10, "Master's degree")):
        matches = [row for row in paid if row.outlook_pct > g and row.education != edu]
        if not matches:
            continue
        winner = max(matches, key=lambda row: row.annual)
        add(
            "H3-A",
            "negation",
            "answerable",
            f"Which occupation with a projected growth rate above {g}% that does not require a {edu} has the highest median annual pay, and what is that pay?",
            {"winner": winner.title, "pay": winner.annual},
            None,
            ev([winner], ("annual", "outlook_pct", "education")),
            [winner.slug],
            f"Excludes education = {edu}.",
        )

    # H3-B: ambiguity / specification, 15
    ambiguous = [
        ("Which occupation is the best career?", "NEEDS_SPECIFICATION", "best is not defined"),
        ("Which occupation is most stable?", "NEEDS_SPECIFICATION", "stability is not defined"),
        ("Which occupation has the best work-life balance?", "NOT_FORMALIZABLE", "no corpus measure"),
        ("Is a master's degree worth it?", "NOT_FORMALIZABLE", "normative and individual"),
        ("What is the annual pay if the hourly pay is $30 and the worker works 40 hours per week?", "NEEDS_SPECIFICATION", "hours per week not in the snapshot"),
        ("Which occupation will grow the most after 2033?", "NEEDS_SPECIFICATION", "post-2033 is out of snapshot"),
        ("Which occupation is best for someone who wants to help people?", "NOT_FORMALIZABLE", "preference is not formalizable"),
        ("Which occupation is the most stressful?", "NOT_FORMALIZABLE", "no corpus measure"),
        ("How many occupations will be replaced by AI?", "NOT_FORMALIZABLE", "counterfactual and undefined"),
        ("Which occupation has the best future?", "NEEDS_SPECIFICATION", "best/future undefined"),
        ("Is the projected growth rate good?", "NEEDS_SPECIFICATION", "good is not defined"),
        ("Which occupation should I choose?", "NOT_FORMALIZABLE", "advice, not verification"),
        ("Which occupation has the highest pay in California?", "NEEDS_SPECIFICATION", "place-level pay is not in the snapshot"),
        ("Which occupation is most prestigious?", "NOT_FORMALIZABLE", "no corpus measure"),
        ("Which occupation has the highest pay per hour?", "NEEDS_SPECIFICATION", "hourly pay exists but the ranking rule is not specified"),
    ]
    for question, verdict, note in ambiguous:
        add("H3-B", "ambiguity", "ambiguous", question, None, None, [], [], note, expected_verdict=verdict)

    # H3-B: partial / absence, 15
    places = ["New York City", "California", "Texas", "Chicago", "Florida"]
    for i, row in enumerate([row for row in paid if row.annual is not None][:5]):
        place = places[i % len(places)]
        add(
            "H3-B",
            "partial",
            "partial",
            f"What is the median annual pay for {row.title}, and what is their median annual pay in {place}?",
            {"parts": [
                {"part": "US median annual pay", "value": row.annual, "status": "stated"},
                {"part": f"{place} median annual pay", "value": None, "status": "not stated"},
            ]},
            None,
            ev([row], ("annual",)),
            [row.slug],
            "Place-level pay is not in the snapshot.",
        )
    for row in rows[:5]:
        add(
            "H3-B",
            "partial",
            "partial",
            f"What is the projected growth rate for {row.title} from 2023 to 2033, and how many {row.title} were employed in 2010?",
            {"parts": [
                {"part": "2023–33 projected growth", "value": row.outlook_pct, "status": "stated"},
                {"part": "2010 employment", "value": None, "status": "not stated"},
            ]},
            None,
            ev([row], ("outlook_pct",)),
            [row.slug],
            "2010 employment is not in the snapshot.",
        )
    for row in rows[:5]:
        add(
            "H3-B",
            "partial",
            "partial",
            f"What is the typical entry-level education for {row.title}, and how many openings for {row.title} are projected for 2033 specifically?",
            {"parts": [
                {"part": "typical entry-level education", "value": row.education, "status": "stated"},
                {"part": "2033-specific openings", "value": None, "status": "not stated"},
            ]},
            None,
            ev([row], ("education",)),
            [row.slug],
            "2033-specific openings are not in the snapshot.",
        )

    # H3-B: tie-break / edge, 10
    edge_growth = [6, 7, 8, 9, 11, 22]
    for g in edge_growth:
        matches = [row for row in paid if row.outlook_pct == g]
        if len(matches) < 2:
            continue
        winner = max(matches, key=lambda row: row.annual)
        add(
            "H3-B",
            "equality_filter",
            "answerable",
            f"Among occupations with exactly {g}% projected growth, which has the highest median annual pay, and what is that pay?",
            {"winner": winner.title, "pay": winner.annual},
            None,
            ev(matches, ("outlook_pct", "annual")),
            [row.slug for row in matches],
            "Equality filter on growth.",
        )
    add(
        "H3-B",
        "tie_break",
        "ambiguous",
        "Two occupations have the same projected growth. Which has the higher median annual pay?",
        None,
        None,
        [],
        [],
        "Tie-break policy is not specified.",
        expected_verdict="NEEDS_SPECIFICATION",
    )
    add(
        "H3-B",
        "tie_break",
        "ambiguous",
        "Two occupations have the same median annual pay. Which has more annual openings?",
        None,
        None,
        [],
        [],
        "Tie-break policy is not specified.",
        expected_verdict="NEEDS_SPECIFICATION",
    )

    # Fill any shortfall with extra top-k/equality questions.
    if len(out) < 100:
        for g in (2, 4, 5, 6, 8, 10, 15, 20):
            candidates = [row for row in paid if row.outlook_pct > g]
            if len(candidates) < 3:
                continue
            top = sorted(candidates, key=lambda row: row.annual_openings, reverse=True)[:3]
            add(
                "H3-A",
                "top_k",
                "answerable",
                f"Which three occupations have the most annual openings among those projected to grow faster than {g}%?",
                [{"title": row.title, "openings": row.annual_openings} for row in top],
                "; ".join(f"{row.title} {row.annual_openings:,}" for row in top),
                ev(top, ("annual_openings", "outlook_pct")),
                [row.slug for row in top],
                "Top three by annual openings; no tie in this snapshot.",
            )
            if len(out) >= 100:
                break

    if len(out) != 100:
        raise SystemExit(f"expected 100 questions, got {len(out)}")
    OUT.write_text("".join(json.dumps(row) + "\n" for row in out), encoding="utf-8")
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    MANIFEST.write_text(
        json.dumps(
            {
                "path": str(OUT),
                "sha256": digest,
                "count": len(out),
                "levels": dict(Counter(row["level"] for row in out)),
                "types": dict(Counter(row["type"] for row in out)),
                "conditions": dict(Counter(row["condition"] for row in out)),
                "validation": "candidate; human review required",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(out)} -> {OUT}")
    print("sha256:", digest)
    print("types:", dict(Counter(row["type"] for row in out)))
    print("conditions:", dict(Counter(row["condition"] for row in out)))


if __name__ == "__main__":
    main()
