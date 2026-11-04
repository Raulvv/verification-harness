"""Build a two-reader natural-error set for the held-out replication.

Readers:
  - Sonnet 5.5 DA
  - GLM-5.3-Flash DA

The outputs are cached model results, not private labels. The set is kept under
competitive/private/ (gitignored).
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "bench" / "formal"))

from formal.extract import verify_reader_answer  # noqa: E402
from formal.parse import parse_question  # noqa: E402
from formal.rows import build_dataset  # noqa: E402
from formal.z3check import Premises  # noqa: E402

QUESTIONS = ROOT / "bench" / "ooh-test-questions.jsonl"
CORPUS = ROOT / "bench" / "corpus" / "ooh-v1"
TABLE = ROOT / "bench" / "ooh-table-v1.md"
READERS = {
    "sonnet-da": ROOT / "bench" / "results" / "arm-compare-heldout-sonnet55-da-v2.jsonl",
    "glm-da": ROOT / "bench" / "results" / "arm-compare-heldout-glm53flash-v2.jsonl",
}
OUT_DIR = Path(__file__).resolve().parent / "private"
OUT = OUT_DIR / "multireader-160.jsonl"
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


def load_reader(path: Path, arm: str | None = None) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if arm and row.get("arm") != arm:
            continue
        out[row["id"]] = str(row.get("text") or row.get("rawAnswer") or "")
    return out


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
    out = []
    for reader, path in READERS.items():
        arm = "DA" if reader == "glm-da" else None
        answers = load_reader(path, arm)
        for qid, item in questions.items():
            if qid not in answers:
                continue
            qir = parse_question(qid, item["question"], dataset)
            if qir.kind in ("partial", "not_formalizable"):
                continue
            answer = answers[qid]
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
                    "id": f"mr-{reader}-{qid}",
                    "reader": reader,
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
    OUT.write_text("".join(json.dumps(r) + "\n" for r in out), encoding="utf-8")
    print(f"wrote {len(out)} claims -> {OUT}")
    print("readers:", dict(Counter(r["reader"] for r in out)))
    print("conditions:", dict(Counter(r["condition"] for r in out)))
    print("provisional:", dict(Counter(r["gold"] for r in out)))


if __name__ == "__main__":
    main()
