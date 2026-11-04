"""Build the 160-claim public OOH competitive set.

All 40 answerable value questions and all 40 unanswerable questions from the
public 100. Each answerable question gets a supported answer and a deliberately
wrong contradicted answer; each unanswerable question gets an absent answer and
a fabricated contradicted answer. No private labels.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.compile import candidate_rows  # noqa: E402
from formal.parse import parse_question  # noqa: E402
from formal.rows import build_dataset, field_value  # noqa: E402

OUT = Path(__file__).resolve().parent / "pilot-160.jsonl"
QUESTIONS = ROOT / "bench" / "ooh-test-questions.jsonl"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"
TABLE = ROOT / "bench" / "ooh-table-v1.md"
VALUE_KINDS = {"lookup", "compare", "difference", "sum", "extremum", "count"}


def page(dataset, title: str) -> str:
    slug = dataset.by_title[title].slug
    return (CORPUS / f"{slug}.md").read_text(encoding="utf-8")


def table() -> str:
    return TABLE.read_text(encoding="utf-8")


def fmt(field: str, value) -> str:
    if field == "annual":
        return f"${value:,}"
    if field == "outlook_pct":
        return f"{value}%"
    if field in ("jobs", "change", "annual_openings", "jobs2033"):
        return f"{value:,}"
    return str(value)


def lookup_answer(field: str, title: str, value) -> str:
    if field == "annual":
        return f"The 2023 median annual pay for {title} is {fmt(field, value)} per year."
    if field == "outlook_pct":
        return f"The projected growth rate for {title} from 2023 to 2033 is {fmt(field, value)}."
    if field == "jobs":
        return f"{title} held {fmt(field, value)} jobs in 2023."
    if field == "change":
        return f"The projected employment change for {title} from 2023 to 2033 is {fmt(field, value)}."
    if field == "annual_openings":
        return f"About {fmt(field, value)} openings for {title} are projected each year, on average, over the decade."
    return f"{title}: {value}"


def wrong_value(field: str, value):
    if field == "outlook_pct":
        return value + 1
    return value + 1000


def answerable_claims(dataset, item, q):
    if q.kind == "lookup":
        row = dataset.by_title[q.entity]
        value = field_value(row, q.field)
        evidence = page(dataset, q.entity)
        return [
            {
                "category": "lookup",
                "answer": lookup_answer(q.field, q.entity, value),
                "gold": "supported",
                "evidence": evidence,
            },
            {
                "category": "lookup",
                "answer": lookup_answer(q.field, q.entity, wrong_value(q.field, value)),
                "gold": "contradicted",
                "evidence": evidence,
            },
        ]
    if q.kind == "difference":
        a, b = q.entities
        va = field_value(dataset.by_title[a], q.field)
        vb = field_value(dataset.by_title[b], q.field)
        d = abs(va - vb)
        evidence = page(dataset, a) + "\n\n" + page(dataset, b)
        return [
            {"category": "difference", "answer": f"The difference is {fmt(q.field, d)}.", "gold": "supported", "evidence": evidence},
            {"category": "difference", "answer": f"The difference is {fmt(q.field, d + 1)}.", "gold": "contradicted", "evidence": evidence},
        ]
    if q.kind == "compare":
        a, b = q.entities
        va = field_value(dataset.by_title[a], q.field)
        vb = field_value(dataset.by_title[b], q.field)
        winner, loser = (a, b) if va > vb else (b, a)
        vw, vl = max(va, vb), min(va, vb)
        evidence = page(dataset, a) + "\n\n" + page(dataset, b)
        return [
            {
                "category": "compare",
                "answer": f"{winner} has the higher value: {fmt(q.field, vw)} compared with {fmt(q.field, vl)} for {loser}. The difference is {fmt(q.field, vw - vl)}.",
                "gold": "supported",
                "evidence": evidence,
            },
            {
                "category": "compare",
                "answer": f"{loser} has the higher value: {fmt(q.field, vl)} compared with {fmt(q.field, vw)} for {winner}. The difference is {fmt(q.field, vw - vl)}.",
                "gold": "contradicted",
                "evidence": evidence,
            },
        ]
    if q.kind == "extremum":
        rows = candidate_rows(q, dataset)
        ordered = sorted(rows, key=lambda r: (field_value(r, q.field), r.title))
        winner = ordered[-1] if q.op == "max" else ordered[0]
        runner = ordered[-2] if q.op == "max" else ordered[1]
        label = "highest" if q.op == "max" else "lowest"
        if q.candidate_set and q.candidate_set.kind == "select":
            evidence = "\n\n".join(page(dataset, r.title) for r in rows)
        else:
            evidence = table()
        return [
            {
                "category": "extremum",
                "answer": f"{winner.title} has the {label} value: {fmt(q.field, field_value(winner, q.field))}.",
                "gold": "supported",
                "evidence": evidence,
            },
            {
                "category": "extremum",
                "answer": f"{runner.title} has the {label} value: {fmt(q.field, field_value(runner, q.field))}.",
                "gold": "contradicted",
                "evidence": evidence,
            },
        ]
    if q.kind == "sum":
        total = sum(field_value(dataset.by_title[e], q.field) for e in q.entities)
        evidence = "\n\n".join(page(dataset, e) for e in q.entities)
        label = "projected 2033 employment" if q.field == "jobs2033" else "2023 employment"
        return [
            {"category": "sum", "answer": f"The combined {label} is {total:,}.", "gold": "supported", "evidence": evidence},
            {"category": "sum", "answer": f"The combined {label} is {total + 1000:,}.", "gold": "contradicted", "evidence": evidence},
        ]
    return []


def absence_claims(dataset, item, q):
    evidence = page(dataset, q.entity)
    if q.field == "annual":
        where = "in" if q.scope.kind == "place" else "at"
        fabricated = f"The median annual pay {where} {q.scope.value} is $100,000."
    elif q.field == "jobs":
        fabricated = "The number employed in 2010 was 100,000."
    elif q.field == "outlook_pct":
        fabricated = "The projected growth rate for 2012-22 was 5%."
    else:
        fabricated = "18,500 openings are projected for 2033 specifically."
    return [
        {
            "category": "absence",
            "answer": "NOT FOUND — the corpus does not state the requested fact.",
            "gold": "absent",
            "evidence": evidence,
        },
        {
            "category": "absence",
            "answer": fabricated,
            "gold": "contradicted",
            "evidence": evidence,
        },
    ]


def main() -> None:
    dataset = build_dataset()
    items = [
        json.loads(line)
        for line in QUESTIONS.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    out = []
    for item in items:
        q = parse_question(item["id"], item["question"], dataset)
        if q.kind in VALUE_KINDS:
            for claim in answerable_claims(dataset, item, q):
                out.append({"id": f"{item['id']}-{claim['gold']}", "question": item["question"], **claim})
        elif q.kind == "absence":
            for claim in absence_claims(dataset, item, q):
                out.append({"id": f"{item['id']}-{claim['gold']}", "question": item["question"], **claim})
    OUT.write_text("".join(json.dumps(row) + "\n" for row in out), encoding="utf-8")
    print(f"wrote {len(out)} claims -> {OUT}")


if __name__ == "__main__":
    main()
