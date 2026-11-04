"""Build a natural-reader-error audit slice from cached reader outputs.

The cached output is a model result, not a private label. The natural slice is
kept under `competitive/private/` (gitignored) so it is not published.

    .venv/bin/python competitive/build_natural.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.extract import verify_reader_answer  # noqa: E402
from formal.parse import parse_question  # noqa: E402
from formal.rows import build_dataset  # noqa: E402
from formal.z3check import Premises  # noqa: E402

QUESTIONS = ROOT / "bench" / "ooh-test-questions.jsonl"
READER = ROOT / "bench" / "results" / "arm-compare-heldout-deepseek-da-v2.jsonl"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"
TABLE = ROOT / "bench" / "ooh-table-v1.md"
OUT_DIR = Path(__file__).resolve().parent / "private"
OUT = OUT_DIR / "natural-80.jsonl"
VALUE_KINDS = {"lookup", "compare", "difference", "sum", "extremum", "count"}


def page(dataset, title: str) -> str:
    slug = dataset.by_title[title].slug
    return (CORPUS / f"{slug}.md").read_text(encoding="utf-8")


def evidence_for(qir, dataset) -> str:
    if qir.kind == "lookup":
        return page(dataset, qir.entity)
    if qir.kind in ("difference", "compare", "sum"):
        return "\n\n".join(page(dataset, e) for e in qir.entities)
    if qir.kind == "extremum":
        if qir.candidate_set and qir.candidate_set.kind == "select":
            return "\n\n".join(page(dataset, e) for e in qir.candidate_set.select)
        return TABLE.read_text(encoding="utf-8")
    if qir.kind == "count":
        return TABLE.read_text(encoding="utf-8")
    if qir.kind == "absence":
        return page(dataset, qir.entity)
    return ""


def main() -> None:
    dataset = build_dataset()
    premises = Premises(dataset)
    questions = {
        row["id"]: row
        for row in (
            json.loads(line)
            for line in QUESTIONS.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )
    }
    reader = {
        row["id"]: row
        for row in (
            json.loads(line)
            for line in READER.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )
    }
    out = []
    for qid, item in questions.items():
        if qid not in reader:
            continue
        qir = parse_question(qid, item["question"], dataset)
        if qir.kind == "partial" or qir.kind == "not_formalizable":
            continue
        answer = str(reader[qid].get("text") or reader[qid].get("rawAnswer") or "")
        extraction, verification = verify_reader_answer(
            item["question"], answer, dataset, premises, qir=qir
        )
        if qir.kind in VALUE_KINDS:
            condition = "answerable"
            provisional = (
                "supported"
                if verification.verdict in ("ENTAILED", "ENTAILED_UNDER_ASSUMPTIONS")
                else "contradicted"
            )
        else:
            condition = "unanswerable"
            provisional = (
                "absent"
                if verification.verdict == "ABSENT_CONFIRMED"
                else "contradicted"
            )
        out.append(
            {
                "id": f"natural-{qid}",
                "category": qir.kind,
                "condition": condition,
                "question": item["question"],
                "answer": answer,
                "gold": provisional,
                "provisional_gold": provisional,
                "formal_verdict": verification.verdict,
                "evidence": evidence_for(qir, dataset),
                "audit_required": "yes",
            }
        )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(json.dumps(row) + "\n" for row in out), encoding="utf-8")
    print(f"wrote {len(out)} natural claims -> {OUT}")


if __name__ == "__main__":
    main()
