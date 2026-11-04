"""Build the frozen 50-claim public OOH pilot set.

No private labels, no model calls. Correct answers are derived from the public
table; contradicted variants are deliberately wrong; evidence is the relevant
page text (or the public markdown table for global aggregates).
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

OUT = Path(__file__).resolve().parent / "pilot-50.jsonl"
QUESTIONS = ROOT / "bench" / "ooh-test-questions.jsonl"
DEV = ROOT / "bench" / "ooh-dev-aggregation.jsonl"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"
TABLE = ROOT / "bench" / "ooh-table-v1.md"

LOOKUP = [
    "test-014", "test-044", "test-067", "test-073",
    "test-020", "test-031", "test-058", "test-033",
]
DIFF_COMPARE = [
    "test-001", "test-053", "test-064", "test-065",
    "test-007", "test-011", "test-038", "test-088",
]
EXTREMUM = ["test-005", "test-030", "test-048", "test-079"]
COUNT_SUM = ["dev-agg-004", "dev-agg-005", "test-019"]
ABSENCE = ["test-003", "test-091"]


def page(dataset, title: str) -> str:
    slug = dataset.by_title[title].slug
    return (CORPUS / f"{slug}.md").read_text(encoding="utf-8")


def table() -> str:
    return TABLE.read_text(encoding="utf-8")


def lookup_answer(field: str, title: str, value) -> str:
    if field == "annual":
        return f"The 2023 median annual pay for {title} is ${value:,} per year."
    if field == "outlook_pct":
        return f"The projected growth rate for {title} from 2023 to 2033 is {value}%."
    if field == "jobs":
        return f"{title} held {value:,} jobs in 2023."
    if field == "change":
        return f"The projected employment change for {title} from 2023 to 2033 is {value:,}."
    if field == "annual_openings":
        return f"About {value:,} openings for {title} are projected each year, on average, over the decade."
    return f"{title}: {value}"


def wrong_value(field: str, value):
    if field == "outlook_pct":
        return value + 1
    return value + 1000


def format_field(field: str, value) -> str:
    if field == "annual":
        return f"${value:,}"
    if field == "outlook_pct":
        return f"{value}%"
    if field in ("jobs", "change", "annual_openings"):
        return f"{value:,}"
    return str(value)


def main() -> None:
    dataset = build_dataset()
    qmap = {}
    for path in (QUESTIONS, DEV):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                qmap[row["id"]] = row
    out = []

    def add(item):
        out.append(item)

    for qid in LOOKUP:
        item = qmap[qid]
        q = parse_question(qid, item["question"], dataset)
        assert q.kind == "lookup" and q.entity and q.field
        row = dataset.by_title[q.entity]
        value = field_value(row, q.field)
        assert value is not None
        evidence = page(dataset, q.entity)
        add({
            "id": f"{qid}-supported",
            "category": "lookup",
            "question": item["question"],
            "answer": lookup_answer(q.field, q.entity, value),
            "gold": "supported",
            "evidence": evidence,
        })
        add({
            "id": f"{qid}-contradicted",
            "category": "lookup",
            "question": item["question"],
            "answer": lookup_answer(q.field, q.entity, wrong_value(q.field, value)),
            "gold": "contradicted",
            "evidence": evidence,
        })

    for qid in DIFF_COMPARE:
        item = qmap[qid]
        q = parse_question(qid, item["question"], dataset)
        if q.kind == "difference":
            a, b = q.entities
            va = field_value(dataset.by_title[a], q.field)
            vb = field_value(dataset.by_title[b], q.field)
            d = abs(va - vb)
            evidence = page(dataset, a) + "\n\n" + page(dataset, b)
            add({
                "id": f"{qid}-supported",
                "category": "difference",
                "question": item["question"],
                "answer": f"The difference is {d:,}.",
                "gold": "supported",
                "evidence": evidence,
            })
            add({
                "id": f"{qid}-contradicted",
                "category": "difference",
                "question": item["question"],
                "answer": f"The difference is {d + 1:,}.",
                "gold": "contradicted",
                "evidence": evidence,
            })
        else:
            assert q.kind == "compare"
            a, b = q.entities
            va = field_value(dataset.by_title[a], q.field)
            vb = field_value(dataset.by_title[b], q.field)
            winner, loser = (a, b) if va > vb else (b, a)
            vw, vl = max(va, vb), min(va, vb)
            evidence = page(dataset, a) + "\n\n" + page(dataset, b)
            add({
                "id": f"{qid}-supported",
                "category": "compare",
                "question": item["question"],
                "answer": f"{winner} has the higher value: {format_field(q.field, vw)} compared with {format_field(q.field, vl)} for {loser}. The difference is {format_field(q.field, vw - vl)}.",
                "gold": "supported",
                "evidence": evidence,
            })
            add({
                "id": f"{qid}-contradicted",
                "category": "compare",
                "question": item["question"],
                "answer": f"{loser} has the higher value: {format_field(q.field, vl)} compared with {format_field(q.field, vw)} for {winner}. The difference is {format_field(q.field, vw - vl)}.",
                "gold": "contradicted",
                "evidence": evidence,
            })

    for qid in EXTREMUM:
        item = qmap[qid]
        q = parse_question(qid, item["question"], dataset)
        assert q.kind == "extremum"
        rows = candidate_rows(q, dataset)
        ordered = sorted(rows, key=lambda r: (field_value(r, q.field), r.title))
        winner = ordered[-1] if q.op == "max" else ordered[0]
        runner = ordered[-2] if q.op == "max" else ordered[1]
        value = field_value(winner, q.field)
        evidence = "\n\n".join(page(dataset, r.title) for r in rows)
        label = "highest" if q.op == "max" else "lowest"
        add({
            "id": f"{qid}-supported",
            "category": "extremum",
            "question": item["question"],
            "answer": f"{winner.title} has the {label} value: {format_field(q.field, value)}.",
            "gold": "supported",
            "evidence": evidence,
        })
        add({
            "id": f"{qid}-contradicted",
            "category": "extremum",
            "question": item["question"],
            "answer": f"{runner.title} has the {label} value: {format_field(q.field, field_value(runner, q.field))}.",
            "gold": "contradicted",
            "evidence": evidence,
        })

    for qid in COUNT_SUM:
        item = qmap[qid]
        q = parse_question(qid, item["question"], dataset)
        if q.kind == "count":
            n = len(candidate_rows(q, dataset))
            evidence = table()
            add({
                "id": f"{qid}-supported",
                "category": "count",
                "question": item["question"],
                "answer": f"{n} occupations.",
                "gold": "supported",
                "evidence": evidence,
            })
            add({
                "id": f"{qid}-contradicted",
                "category": "count",
                "question": item["question"],
                "answer": f"{n + 1} occupations.",
                "gold": "contradicted",
                "evidence": evidence,
            })
        else:
            assert q.kind == "sum"
            total = sum(field_value(dataset.by_title[e], q.field) for e in q.entities)
            evidence = "\n\n".join(page(dataset, e) for e in q.entities)
            add({
                "id": f"{qid}-supported",
                "category": "sum",
                "question": item["question"],
                "answer": f"The combined 2023 employment is {total:,}.",
                "gold": "supported",
                "evidence": evidence,
            })
            add({
                "id": f"{qid}-contradicted",
                "category": "sum",
                "question": item["question"],
                "answer": f"The combined 2023 employment is {total + 1000:,}.",
                "gold": "contradicted",
                "evidence": evidence,
            })

    for qid in ABSENCE:
        item = qmap[qid]
        q = parse_question(qid, item["question"], dataset)
        assert q.kind == "absence" and q.entity
        evidence = page(dataset, q.entity)
        add({
            "id": f"{qid}-absent",
            "category": "absence",
            "question": item["question"],
            "answer": "NOT FOUND — the corpus does not state the requested fact.",
            "gold": "absent",
            "evidence": evidence,
        })
        if q.field == "annual":
            fabricated = f"The median annual pay in {q.scope.value} is $100,000."
        else:
            fabricated = "18,500 openings are projected for 2033 specifically."
        add({
            "id": f"{qid}-contradicted",
            "category": "absence",
            "question": item["question"],
            "answer": fabricated,
            "gold": "contradicted",
            "evidence": evidence,
        })

    OUT.write_text("".join(json.dumps(row) + "\n" for row in out), encoding="utf-8")
    print(f"wrote {len(out)} claims -> {OUT}")


if __name__ == "__main__":
    main()
