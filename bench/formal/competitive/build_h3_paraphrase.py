"""Build the 30 reviewed H3 paraphrases.

Fifteen items keep an H3 target (same gold) and fifteen use a new target. Gold
is computed from each item's explicit spec, never typed. Same-target items are
asserted against the original H3 gold.

    .venv/bin/python competitive/build_h3_paraphrase.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.rows import build_dataset  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "private" / "hard-h3-paraphrase-30.jsonl"
MANIFEST = HERE / "private" / "hard-h3-paraphrase-30-manifest.json"
SOURCE = HERE / "private" / "hard-h3-100.jsonl"

QUOTE_KEY = {
    "annual": "2023 Median Pay",
    "outlook_pct": "Job Outlook, 2023-33",
    "jobs": "Number of Jobs, 2023",
    "annual_openings": "openings",
    "education": "Typical Entry-Level Education",
}

PAID = {"candidateSet": "paid"}


def filters(growth=None, pay=None, education_ne=None, education_eq=None):
    out = []
    if growth is not None:
        out.append({"field": "outlook_pct", "op": ">", "value": growth})
    if pay is not None:
        out.append({"field": "annual", "op": ">", "value": pay})
    if education_ne is not None:
        out.append({"field": "education", "op": "!=", "value": education_ne})
    if education_eq is not None:
        out.append({"field": "education", "op": "=", "value": education_eq})
    return out


CASES = [
    # ---- multi-condition count: 5 (2 same, 3 new) ----
    dict(
        type="multi_count", target="same", source_id="hard-h3-002",
        question="Of the occupations that report a median annual pay, how many are projected to grow faster than 4% and pay more than $60,000?",
        spec={**PAID, "op": "count", "field": "annual", "filters": filters(4, 60_000)},
        notes="Wording only: faster than / pay more than. Same target as hard-h3-002.",
    ),
    dict(
        type="multi_count", target="same", source_id="hard-h3-004",
        question="How many occupations with a reported median annual pay show a projected growth rate above 4% and a median annual pay above $80,000?",
        spec={**PAID, "op": "count", "field": "annual", "filters": filters(4, 80_000)},
        notes="Near-template wording. Same target as hard-h3-004.",
    ),
    dict(
        type="multi_count", target="new",
        question="Count the occupations whose projected growth rate is above 7% and whose median annual pay is above $55,000.",
        spec={**PAID, "op": "count", "field": "annual", "filters": filters(7, 55_000)},
        notes="Imperative phrasing; new thresholds 7% / $55,000.",
    ),
    dict(
        type="multi_count", target="new",
        question="How many occupations have a projected growth rate above 6% and a median annual pay above $95,000?",
        spec={**PAID, "op": "count", "field": "annual", "filters": filters(6, 95_000)},
        notes="Near-template wording; new thresholds 6% / $95,000.",
    ),
    dict(
        type="multi_count", target="new",
        question="Among occupations with a reported median annual pay, how many have a projected growth rate above 12% and a median annual pay above $45,000?",
        spec={**PAID, "op": "count", "field": "annual", "filters": filters(12, 45_000)},
        notes="Leading clause before 'how many'; new thresholds 12% / $45,000.",
    ),
    # ---- multi-condition extremum: 4 (2 same, 2 new) ----
    dict(
        type="multi_extremum", target="same", source_id="hard-h3-021",
        question="Among occupations with a projected growth rate above 4% and a median annual pay above $60,000, which one has the highest median annual pay, and what is that value?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(4, 60_000)},
        notes="'which one has'; same target as hard-h3-021.",
    ),
    dict(
        type="multi_extremum", target="same", source_id="hard-h3-022",
        question="Which occupation has the most annual openings among those with a projected growth rate above 4% and a median annual pay above $60,000, and what is that value?",
        spec={**PAID, "op": "max", "field": "annual_openings", "filters": filters(4, 60_000)},
        notes="Filter clause moved to the end; same target as hard-h3-022.",
    ),
    dict(
        type="multi_extremum", target="new",
        question="Within occupations with a projected growth rate above 6% and a median annual pay above $70,000, which has the highest median annual pay, and what is that value?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(6, 70_000)},
        notes="'Within occupations'; new thresholds 6% / $70,000.",
    ),
    dict(
        type="multi_extremum", target="new",
        question="Of the occupations with a projected growth rate above 9% and a median annual pay above $60,000, which has the highest annual openings, and what is that value?",
        spec={**PAID, "op": "max", "field": "annual_openings", "filters": filters(9, 60_000)},
        notes="'Of the occupations'; new thresholds 9% / $60,000.",
    ),
    # ---- multi-condition sum: 4 (2 same, 2 new) ----
    dict(
        type="multi_sum", target="same", source_id="hard-h3-031",
        question="What is the combined 2023 employment of occupations with a projected growth rate above 4% and a median annual pay above $60,000?",
        spec={**PAID, "op": "sum", "field": "jobs", "filters": filters(4, 60_000)},
        notes="Template wording by design; same target as hard-h3-031.",
    ),
    dict(
        type="multi_sum", target="same", source_id="hard-h3-034",
        question="Add up the 2023 employment of occupations with a projected growth rate above 5% and a median annual pay above $60,000 and give the total.",
        spec={**PAID, "op": "sum", "field": "jobs", "filters": filters(5, 60_000)},
        notes="Imperative 'Add up'; same target as hard-h3-034.",
    ),
    dict(
        type="multi_sum", target="new",
        question="What is the combined 2023 employment of occupations with a projected growth rate above 7% and a median annual pay above $75,000?",
        spec={**PAID, "op": "sum", "field": "jobs", "filters": filters(7, 75_000)},
        notes="Near-template wording; new thresholds 7% / $75,000.",
    ),
    dict(
        type="multi_sum", target="new",
        question="Total the 2023 employment across occupations with a projected growth rate above 10% and a median annual pay above $50,000.",
        spec={**PAID, "op": "sum", "field": "jobs", "filters": filters(10, 50_000)},
        notes="Imperative 'Total'; new thresholds 10% / $50,000.",
    ),
    # ---- top-k: 5 (3 same, 2 new) ----
    dict(
        type="top_k", target="same", source_id="hard-h3-043",
        question="Rank the three occupations with the highest median annual pay among those projected to grow faster than 4%.",
        spec={**PAID, "op": "topk", "k": 3, "field": "annual", "filters": filters(4)},
        notes="'Rank the three'; same target as hard-h3-043.",
    ),
    dict(
        type="top_k", target="same", source_id="hard-h3-044",
        question="Which three occupations have the highest median annual pay among those projected to grow faster than 5%?",
        spec={**PAID, "op": "topk", "k": 3, "field": "annual", "filters": filters(5)},
        notes="Template wording by design; same target as hard-h3-044.",
    ),
    dict(
        type="top_k", target="same", source_id="hard-h3-096",
        question="Name the three occupations with the most annual openings among those projected to grow faster than 2%.",
        spec={**PAID, "op": "topk", "k": 3, "field": "annual_openings", "filters": filters(2)},
        notes="'Name the three'; same target as hard-h3-096.",
    ),
    dict(
        type="top_k", target="new",
        question="Which three occupations have the highest median annual pay among those projected to grow faster than 7%?",
        spec={**PAID, "op": "topk", "k": 3, "field": "annual", "filters": filters(7)},
        notes="Near-template wording; new threshold 7%.",
    ),
    dict(
        type="top_k", target="new",
        question="Which three occupations have the most annual openings among those projected to grow faster than 3%?",
        spec={**PAID, "op": "topk", "k": 3, "field": "annual_openings", "filters": filters(3)},
        notes="Near-template wording; new threshold 3%.",
    ),
    # ---- directional difference: 4 (2 same, 2 new) ----
    dict(
        type="directional_difference", target="same", source_id="hard-h3-049",
        question="How much larger is the annual openings figure for Top Executives than for Registered Nurses?",
        spec={"candidateSet": "select", "op": "diff", "field": "annual_openings", "select": ["Top Executives", "Registered Nurses"]},
        notes="'How much larger'; same target as hard-h3-049.",
    ),
    dict(
        type="directional_difference", target="same", source_id="hard-h3-051",
        question="How many more annual openings does Registered Nurses have than Top Executives?",
        spec={"candidateSet": "select", "op": "diff", "field": "annual_openings", "select": ["Registered Nurses", "Top Executives"]},
        notes="Template wording; negative answer; same target as hard-h3-051.",
    ),
    dict(
        type="directional_difference", target="new",
        question="How many more annual openings does Software Developers, Quality Assurance Analysts, and Testers have than Registered Nurses?",
        spec={"candidateSet": "select", "op": "diff", "field": "annual_openings", "select": ["Software Developers, Quality Assurance Analysts, and Testers", "Registered Nurses"]},
        notes="New pair; negative answer.",
    ),
    dict(
        type="directional_difference", target="new",
        question="How many more annual openings does Chefs and Head Cooks have than Electricians?",
        spec={"candidateSet": "select", "op": "diff", "field": "annual_openings", "select": ["Chefs and Head Cooks", "Electricians"]},
        notes="New pair; negative answer.",
    ),
    # ---- negation / education: 4 (2 same, 2 new) ----
    dict(
        type="negation", target="same", source_id="hard-h3-054",
        question="Which occupation with a projected growth rate above 5% that does not require a Bachelor's degree has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(5, education_ne="Bachelor's degree")},
        notes="Template wording by design; same target as hard-h3-054.",
    ),
    dict(
        type="negation", target="same", source_id="hard-h3-055",
        question="Among occupations with a projected growth rate above 5% that do not require a Master's degree, which has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(5, education_ne="Master's degree")},
        notes="Plural 'do not require'; same target as hard-h3-055.",
    ),
    dict(
        type="negation", target="new",
        question="Which occupation with a projected growth rate above 4% that does not require a Doctoral or professional degree has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(4, education_ne="Doctoral or professional degree")},
        notes="New exclusion: doctoral/professional; threshold 4%.",
    ),
    dict(
        type="negation", target="new",
        question="Which occupation with a projected growth rate above 7% that does not require an Associate's degree has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(7, education_ne="Associate's degree")},
        notes="New exclusion: associate's; threshold 7%.",
    ),
    # ---- equality filter: 4 (2 same, 2 new) ----
    dict(
        type="equality_filter", target="same", source_id="hard-h3-090",
        question="Among occupations with exactly 7% projected growth, which has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": filters(education_eq=None) + [{"field": "outlook_pct", "op": "=", "value": 7}]},
        notes="Template wording by design; same target as hard-h3-090.",
    ),
    dict(
        type="equality_filter", target="same", source_id="hard-h3-092",
        question="For occupations at exactly 9% projected growth, which has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": [{"field": "outlook_pct", "op": "=", "value": 9}]},
        notes="'at exactly'; same target as hard-h3-092.",
    ),
    dict(
        type="equality_filter", target="new",
        question="Among occupations with exactly 5% projected growth, which has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": [{"field": "outlook_pct", "op": "=", "value": 5}]},
        notes="New equality target 5%.",
    ),
    dict(
        type="equality_filter", target="new",
        question="Among occupations with exactly 3% projected growth, which has the highest median annual pay, and what is that pay?",
        spec={**PAID, "op": "max", "field": "annual", "filters": [{"field": "outlook_pct", "op": "=", "value": 3}]},
        notes="New equality target 3%.",
    ),
]


def qualifies(row, filt):
    fn = {
        ">": lambda a, b: a > b,
        ">=": lambda a, b: a >= b,
        "<": lambda a, b: a < b,
        "<=": lambda a, b: a <= b,
        "=": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
    }[filt["op"]]
    return fn(getattr(row, filt["field"]), filt["value"])


def gold_for(ds, spec):
    rows = list(ds.rows)
    paid = [r for r in rows if r.annual is not None]
    if spec["candidateSet"] == "select":
        return [ds.by_title[t] for t in spec["select"]]
    base = paid if spec["candidateSet"] == "paid" else rows
    return [r for r in base if all(qualifies(r, f) for f in spec.get("filters", []))]


def compute_gold(ds, case):
    spec = case["spec"]
    matches = gold_for(ds, spec)
    op = spec["op"]
    if op == "count":
        return len(matches)
    if op == "sum":
        return sum(r.jobs for r in matches)
    if op == "max":
        winner = max(matches, key=lambda r: getattr(r, spec["field"]))
        if case["type"] == "multi_extremum":
            return {"winner": winner.title, "value": getattr(winner, spec["field"])}
        return {"winner": winner.title, "pay": getattr(winner, spec["field"])}
    if op == "topk":
        key = "pay" if spec["field"] == "annual" else "openings"
        top = sorted(matches, key=lambda r: getattr(r, spec["field"]), reverse=True)[: spec["k"]]
        return [{"title": r.title, key: getattr(r, spec["field"])} for r in top]
    if op == "diff":
        a, b = matches
        return getattr(a, spec["field"]) - getattr(b, spec["field"])
    raise SystemExit(f"unsupported op {op}")


def evidence_for(case, matches, ds):
    fields = {f["field"] for f in case["spec"].get("filters", [])}
    if case["spec"]["op"] in ("max", "topk", "sum"):
        fields.add(case["spec"]["field"])
    fields = [f for f in fields if f in QUOTE_KEY]
    out = []
    limit = 3 if case["spec"]["op"] == "topk" else 12
    for row in matches[:limit]:
        for field in fields:
            out.append({"slug": row.slug, "title": row.title, "quote": row.quotes[QUOTE_KEY[field]]})
    return out


def sources_for(case, matches):
    if case["spec"]["op"] == "topk":
        return [r.slug for r in matches[: case["spec"]["k"]]]
    if case["spec"]["op"] == "max":
        return [max(matches, key=lambda r: getattr(r, case["spec"]["field"])).slug]
    return [r.slug for r in matches]


def spec_text(spec):
    if spec["candidateSet"] == "select":
        return f"diff {spec['field']}: {spec['select'][0]} − {spec['select'][1]}"
    parts = [f"{spec['op']}({spec['field']})"]
    for f in spec.get("filters", []):
        parts.append(f"{f['field']} {f['op']} {f['value']}")
    if spec["op"] == "topk":
        parts.append(f"k={spec['k']}")
    return " | ".join(parts)


def key_for_gold(gold):
    if isinstance(gold, list):
        return json.dumps([(g["title"], g.get("pay", g.get("openings"))) for g in gold], sort_keys=True)
    if isinstance(gold, dict):
        return json.dumps([gold.get("winner"), gold.get("value", gold.get("pay"))])
    return json.dumps(gold)


def main() -> None:
    ds = build_dataset()
    source = {r["id"]: r for r in (json.loads(l) for l in SOURCE.read_text(encoding="utf-8").splitlines() if l.strip())}
    out = []
    for i, case in enumerate(CASES, 1):
        gold = compute_gold(ds, case)
        item = {
            "id": f"hard-h3-p{i:03d}",
            "split": "hard-h3-paraphrase",
            "level": "H3-P",
            "type": case["type"],
            "target": case["target"],
            "source_id": case.get("source_id"),
            "condition": "answerable",
            "question": case["question"],
            "gold": gold,
            "spec": case["spec"],
            "formula": spec_text(case["spec"]),
            "evidence": evidence_for(case, gold_for(ds, case["spec"]), ds),
            "sources": sources_for(case, gold_for(ds, case["spec"])),
            "notes": case["notes"],
            "validation": "candidate",
        }
        if case.get("source_id"):
            src = source[case["source_id"]]
            if key_for_gold(gold) != key_for_gold(src["gold"]):
                raise SystemExit(f"{item['id']}: same-target gold mismatch vs {case['source_id']}")
        if case["target"] == "same" and not case.get("source_id"):
            raise SystemExit(f"{item['id']}: same target needs a source id")
        if case["target"] == "new" and case.get("source_id"):
            raise SystemExit(f"{item['id']}: new target should not link a source")
        out.append(item)

    OUT.write_text("".join(json.dumps(r) + "\n" for r in out), encoding="utf-8")
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    MANIFEST.write_text(
        json.dumps(
            {
                "path": str(OUT),
                "sha256": digest,
                "count": len(out),
                "types": dict(Counter(r["type"] for r in out)),
                "targets": dict(Counter(r["target"] for r in out)),
                "validation": "candidate; human review required",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(out)} -> {OUT}")
    print("sha256:", digest)
    print("types:", dict(Counter(r["type"] for r in out)))
    print("targets:", dict(Counter(r["target"] for r in out)))


if __name__ == "__main__":
    main()
