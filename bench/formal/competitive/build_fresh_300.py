"""Build a fresh 300-question OOH set for the formal verifier.

This is a deterministic candidate generator, not a human-authored benchmark.
Every row is mechanically validated against the 48-row snapshot; the output is
marked `validation: candidate` and must be human-reviewed before use as a
held-out set.

    .venv/bin/python competitive/build_fresh_300.py
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

from formal.parse import parse_question  # noqa: E402
from formal.rows import Row, build_dataset  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "private" / "fresh-300.jsonl"
MANIFEST = HERE / "private" / "fresh-300-manifest.json"
EXISTING = ROOT / "bench" / "ooh-test-questions.jsonl"
PILOT = ROOT / "bench" / "ooh-pilot-v2.jsonl"
SEED = 0

FIELD_QUOTE = {
    "annual": "2023 Median Pay",
    "outlook_pct": "Job Outlook, 2023-33",
    "jobs": "Number of Jobs, 2023",
    "change": "Employment Change, 2023-33",
    "annual_openings": "openings",
    "education": "Typical Entry-Level Education",
}

PLACES = [
    "New York City",
    "California",
    "Texas",
    "New York",
    "Los Angeles",
    "Houston",
    "Chicago",
    "Florida",
]


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def quote(row: Row, field: str) -> dict:
    key = FIELD_QUOTE[field]
    return {"slug": row.slug, "title": row.title, "quote": row.quotes[key]}


def evidence(rows: list[Row], field: str) -> list[dict]:
    return [quote(row, field) for row in rows]


def sig(qir) -> tuple:
    if qir.kind == "lookup":
        return ("lookup", qir.field, qir.entity)
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
    if qir.kind == "count":
        return ("count", qir.field, str(qir.filter))
    return (qir.kind, qir.question)


class Builder:
    def __init__(self, dataset):
        self.dataset = dataset
        self.rows = list(dataset.rows)
        self.paid = [row for row in self.rows if row.annual is not None]
        self.used_text: set[str] = set()
        self.used_sig: set[tuple] = set()
        self.rows_out: list[dict] = []
        self.rng = random.Random(SEED)
        self.skipped: Counter[str] = Counter()
        self._load_existing()

    def _load_existing(self) -> None:
        for path in (EXISTING, PILOT):
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                item = json.loads(line)
                question = str(item.get("question", ""))
                if not question:
                    continue
                self.used_text.add(norm(question))
                qir = parse_question(str(item.get("id", "existing")), question, self.dataset)
                if qir.kind not in ("not_formalizable", "partial", "absence"):
                    self.used_sig.add(sig(qir))

    def add(
        self,
        *,
        condition: str,
        question: str,
        gold,
        formula: str | None,
        evidence_items: list[dict],
        sources: list[str],
        notes: str,
        expected_kind: str,
    ) -> bool:
        key = norm(question)
        if key in self.used_text:
            self.skipped["duplicate_text"] += 1
            return False
        qir = parse_question(f"fresh-{len(self.rows_out) + 1:03d}", question, self.dataset)
        if qir.kind != expected_kind:
            self.skipped[f"parse_{qir.kind}"] += 1
            return False
        if expected_kind not in ("partial", "absence"):
            key_sig = sig(qir)
            if key_sig in self.used_sig:
                self.skipped["duplicate_sig"] += 1
                return False
            self.used_sig.add(key_sig)
        self.used_text.add(key)
        self.rows_out.append(
            {
                "id": f"fresh-{len(self.rows_out) + 1:03d}",
                "split": "fresh",
                "condition": condition,
                "question": question,
                "gold": gold,
                "formula": formula,
                "evidence": evidence_items,
                "sources": sources,
                "validation": "candidate",
                "notes": notes,
            }
        )
        return True

    def take(self, candidates, n: int, label: str) -> None:
        before = len(self.rows_out)
        for candidate in candidates:
            if len(self.rows_out) - before >= n:
                break
            self.add(**candidate)
        got = len(self.rows_out) - before
        if got < n:
            print(f"warning: {label}: wanted {n}, got {got}")

    def answerable(self) -> None:
        lookups = []
        for field in ("annual", "outlook_pct", "jobs", "change", "annual_openings"):
            for row in self.paid if field == "annual" else self.rows:
                if field == "annual" and row.annual is None:
                    continue
                if field == "outlook_pct":
                    question = f"What is the projected growth rate for {row.title} from 2023 to 2033?"
                    gold = row.outlook_pct
                elif field == "jobs":
                    question = f"How many jobs did {row.title} hold in 2023?"
                    gold = row.jobs
                elif field == "change":
                    question = f"What is the projected employment change for {row.title} from 2023 to 2033?"
                    gold = row.change
                elif field == "annual_openings":
                    question = f"About how many openings for {row.title} are projected each year, on average, over the decade?"
                    gold = row.annual_openings
                else:
                    question = f"What is the median annual pay for {row.title}?"
                    gold = row.annual
                lookups.append(
                    dict(
                        condition="answerable",
                        question=question,
                        gold=gold,
                        formula=None,
                        evidence_items=[quote(row, field)],
                        sources=[row.slug],
                        notes="",
                        expected_kind="lookup",
                    )
                )
        self.rng.shuffle(lookups)
        # Keep a mix of fields, not only one field.
        for field, n in (("annual", 15), ("outlook_pct", 10), ("jobs", 5), ("change", 5), ("annual_openings", 5)):
            field_items = [c for c in lookups if c["question"].startswith({
                "annual": "What is the median annual pay",
                "outlook_pct": "What is the projected growth rate",
                "jobs": "How many jobs did",
                "change": "What is the projected employment change",
                "annual_openings": "About how many openings",
            }[field])]
            self.take(field_items, n, f"lookup_{field}")

        pairs = list(itertools.combinations(self.rows, 2))
        self.rng.shuffle(pairs)
        diffs = []
        for a, b in pairs:
            if a.annual is None or b.annual is None:
                continue
            diffs.append(
                dict(
                    condition="answerable",
                    question=f"What is the difference in median annual pay between {a.title} and {b.title}?",
                    gold=abs((a.annual or 0) - (b.annual or 0)),
                    formula=f"{a.annual:,} − {b.annual:,} = {abs((a.annual or 0) - (b.annual or 0)):,}",
                    evidence_items=evidence([a, b], "annual"),
                    sources=[a.slug, b.slug],
                    notes="",
                    expected_kind="difference",
                )
            )
        self.take(diffs, 10, "difference_pay")

        for field, label in (("jobs", "jobs"), ("change", "change"), ("annual_openings", "openings")):
            items = []
            for a, b in pairs:
                va = getattr(a, field)
                vb = getattr(b, field)
                if field == "jobs":
                    question = f"What is the difference in 2023 employment between {a.title} and {b.title}?"
                elif field == "change":
                    question = f"What is the difference in projected employment change between {a.title} and {b.title} from 2023 to 2033?"
                else:
                    question = f"What is the difference in annual openings between {a.title} and {b.title}?"
                items.append(
                    dict(
                        condition="answerable",
                        question=question,
                        gold=abs(va - vb),
                        formula=f"{va:,} − {vb:,} = {abs(va - vb):,}",
                        evidence_items=evidence([a, b], field),
                        sources=[a.slug, b.slug],
                        notes="",
                        expected_kind="difference",
                    )
                )
            self.take(items, 5, f"difference_{label}")

        sums = []
        for a, b in pairs:
            sums.append(
                dict(
                    condition="answerable",
                    question=f"What is the combined 2023 employment of {a.title} and {b.title}?",
                    gold=a.jobs + b.jobs,
                    formula=f"{a.jobs:,} + {b.jobs:,} = {a.jobs + b.jobs:,}",
                    evidence_items=evidence([a, b], "jobs"),
                    sources=[a.slug, b.slug],
                    notes="",
                    expected_kind="sum",
                )
            )
        self.take(sums, 5, "sum_jobs")
        sums2033 = []
        for a, b in pairs:
            sums2033.append(
                dict(
                    condition="answerable",
                    question=f"What is the combined projected 2033 employment of {a.title} and {b.title}?",
                    gold=a.jobs2033 + b.jobs2033,
                    formula=f"{a.jobs2033:,} + {b.jobs2033:,} = {a.jobs2033 + b.jobs2033:,}",
                    evidence_items=evidence([a, b], "jobs"),
                    sources=[a.slug, b.slug],
                    notes="",
                    expected_kind="sum",
                )
            )
        self.take(sums2033, 5, "sum_2033")

        compares = []
        for a, b in pairs:
            if a.outlook_pct == b.outlook_pct:
                continue
            winner, loser = (a, b) if a.outlook_pct > b.outlook_pct else (b, a)
            compares.append(
                dict(
                    condition="answerable",
                    question=f"Which has the higher projected growth rate, {a.title} or {b.title}, and by how many percentage points?",
                    gold={"winner": winner.title, "difference_pp": winner.outlook_pct - loser.outlook_pct},
                    formula=f"{winner.outlook_pct}% − {loser.outlook_pct}% = {winner.outlook_pct - loser.outlook_pct} percentage points",
                    evidence_items=evidence([a, b], "outlook_pct"),
                    sources=[a.slug, b.slug],
                    notes="",
                    expected_kind="compare",
                )
            )
        self.take(compares, 8, "compare_growth")
        compares_pay = []
        for a, b in pairs:
            if a.annual is None or b.annual is None or a.annual == b.annual:
                continue
            winner, loser = (a, b) if a.annual > b.annual else (b, a)
            compares_pay.append(
                dict(
                    condition="answerable",
                    question=f"Which has the higher median annual pay, {a.title} or {b.title}, and by how much?",
                    gold={"winner": winner.title, "difference": winner.annual - loser.annual},
                    formula=f"${winner.annual:,} − ${loser.annual:,} = ${winner.annual - loser.annual:,}",
                    evidence_items=evidence([a, b], "annual"),
                    sources=[a.slug, b.slug],
                    notes="",
                    expected_kind="compare",
                )
            )
        self.take(compares_pay, 7, "compare_pay")

        triples = list(itertools.combinations(self.paid, 3))
        self.rng.shuffle(triples)
        extremums = []
        for a, b, c in triples:
            winner = max((a, b, c), key=lambda row: row.annual or -1)
            extremums.append(
                dict(
                    condition="answerable",
                    question=f"Among {a.title}, {b.title}, and {c.title}, which has the highest median annual pay, and what is that pay?",
                    gold={"winner": winner.title, "pay": winner.annual},
                    formula=None,
                    evidence_items=evidence([a, b, c], "annual"),
                    sources=[a.slug, b.slug, c.slug],
                    notes="",
                    expected_kind="extremum",
                )
            )
        self.take(extremums, 10, "extremum_select")

        filtered = []
        for threshold in (4, 5, 6, 8, 10, 15, 20):
            candidates = [row for row in self.paid if row.outlook_pct > threshold]
            if not candidates:
                continue
            winner = max(candidates, key=lambda row: row.annual or -1)
            filtered.append(
                dict(
                    condition="answerable",
                    question=f"Among occupations projected to grow faster than {threshold}%, which has the highest median annual pay, and what is that pay?",
                    gold={"winner": winner.title, "pay": winner.annual},
                    formula=None,
                    evidence_items=evidence([winner], "annual"),
                    sources=[winner.slug],
                    notes=f"Filtered over paid rows with outlook_pct > {threshold}.",
                    expected_kind="extremum",
                )
            )
        self.take(filtered, 5, "extremum_filtered")

        counts = []
        for threshold in (0, 2, 4, 5, 6, 8, 10, 15, 20, 25, 30):
            matches = [row for row in self.rows if row.outlook_pct > threshold]
            counts.append(
                dict(
                    condition="answerable",
                    question=f"How many of the 48 occupations have a projected growth rate greater than {threshold}% from 2023 to 2033?",
                    gold=len(matches),
                    formula=None,
                    evidence_items=evidence(matches, "outlook_pct"),
                    sources=[row.slug for row in matches],
                    notes=f"Count over all 48 rows; outlook_pct > {threshold}.",
                    expected_kind="count",
                )
            )
        self.take(counts, 2, "count_growth")
        for threshold in (50000, 60000, 70000, 80000, 90000, 100000, 120000):
            matches = [row for row in self.paid if (row.annual or 0) > threshold]
            counts.append(
                dict(
                    condition="answerable",
                    question=f"How many occupations with a reported median annual pay have a median annual pay above ${threshold:,}?",
                    gold=len(matches),
                    formula=None,
                    evidence_items=evidence(matches, "annual"),
                    sources=[row.slug for row in matches],
                    notes=f"Count over paid rows; annual > {threshold}.",
                    expected_kind="count",
                )
            )
        self.take([c for c in counts if c["question"].startswith("How many occupations with a reported")], 2, "count_pay")
        doctoral_rows = [row for row in self.paid if row.education == "Doctoral or professional degree"]
        self.take(
            [
                dict(
                    condition="answerable",
                    question="How many occupations with a reported median annual pay require a doctoral or professional degree for entry?",
                    gold=len(doctoral_rows),
                    formula=None,
                    evidence_items=evidence(doctoral_rows, "education"),
                    sources=[row.slug for row in doctoral_rows],
                    notes="Count over paid rows; education = Doctoral or professional degree.",
                    expected_kind="count",
                )
            ],
            1,
            "count_education",
        )

        # Fill any shortfall with extra lookups.
        while len(self.rows_out) < 120:
            before = len(self.rows_out)
            self.take(lookups, 120 - before, "fill_lookups")
            if len(self.rows_out) == before:
                break

    def partials(self) -> None:
        pay_place = []
        for row in self.paid:
            for place in PLACES:
                pay_place.append(
                    dict(
                        condition="partial",
                        question=f"What is the median annual pay for {row.title}, and what is their median annual pay in {place}?",
                        gold={
                            "parts": [
                                {"part": "US median annual pay", "value": row.annual, "status": "stated"},
                                {"part": f"{place} median annual pay", "value": None, "status": "not stated"},
                            ]
                        },
                        formula=None,
                        evidence_items=[quote(row, "annual")],
                        sources=[row.slug],
                        notes="Place-level pay is not in the snapshot.",
                        expected_kind="partial",
                    )
                )
        self.rng.shuffle(pay_place)
        self.take(pay_place, 20, "partial_pay_place")

        growth_2010 = []
        for row in self.rows:
            growth_2010.append(
                dict(
                    condition="partial",
                    question=f"What is the projected growth rate for {row.title} from 2023 to 2033, and how many {row.title} were employed in 2010?",
                    gold={
                        "parts": [
                            {"part": "2023–33 projected growth", "value": row.outlook_pct, "status": "stated"},
                            {"part": "2010 employment", "value": None, "status": "not stated"},
                        ]
                    },
                    formula=None,
                    evidence_items=[quote(row, "outlook_pct")],
                    sources=[row.slug],
                    notes="2010 employment is not in the snapshot.",
                    expected_kind="partial",
                )
            )
        self.rng.shuffle(growth_2010)
        self.take(growth_2010, 20, "partial_growth_2010")

        education_2033 = []
        for row in self.rows:
            education_2033.append(
                dict(
                    condition="partial",
                    question=f"What is the typical entry-level education for {row.title}, and how many openings for {row.title} are projected for 2033 specifically?",
                    gold={
                        "parts": [
                            {"part": "typical entry-level education", "value": row.education, "status": "stated"},
                            {"part": "2033-specific openings", "value": None, "status": "not stated"},
                        ]
                    },
                    formula=None,
                    evidence_items=[quote(row, "education")],
                    sources=[row.slug],
                    notes="2033-specific openings are not in the snapshot.",
                    expected_kind="partial",
                )
            )
        self.rng.shuffle(education_2033)
        self.take(education_2033, 20, "partial_education_2033")

    def unanswerable(self) -> None:
        place_pay = []
        for row in self.paid:
            for place in PLACES:
                place_pay.append(
                    dict(
                        condition="unanswerable",
                        question=f"What is the median annual pay for {row.title} in {place}?",
                        gold=None,
                        formula=None,
                        evidence_items=[quote(row, "annual")],
                        sources=[row.slug],
                        notes=f"{place} pay is not in the snapshot.",
                        expected_kind="absence",
                    )
                )
        self.rng.shuffle(place_pay)
        self.take(place_pay, 30, "absence_place_pay")

        y2010 = []
        for row in self.rows:
            y2010.append(
                dict(
                    condition="unanswerable",
                    question=f"How many {row.title} were employed in 2010?",
                    gold=None,
                    formula=None,
                    evidence_items=[quote(row, "jobs")],
                    sources=[row.slug],
                    notes="2010 employment is not in the snapshot.",
                    expected_kind="absence",
                )
            )
        self.rng.shuffle(y2010)
        self.take(y2010, 30, "absence_2010")

        growth_2012 = []
        for row in self.rows:
            growth_2012.append(
                dict(
                    condition="unanswerable",
                    question=f"What was the projected growth rate for {row.title} for 2012-22?",
                    gold=None,
                    formula=None,
                    evidence_items=[quote(row, "outlook_pct")],
                    sources=[row.slug],
                    notes="2012–22 growth is not in the snapshot.",
                    expected_kind="absence",
                )
            )
        self.rng.shuffle(growth_2012)
        self.take(growth_2012, 30, "absence_2012_22")

        openings_2033 = []
        for row in self.rows:
            openings_2033.append(
                dict(
                    condition="unanswerable",
                    question=f"How many openings for {row.title} are projected for 2033 specifically?",
                    gold=None,
                    formula=None,
                    evidence_items=[quote(row, "annual_openings")],
                    sources=[row.slug],
                    notes="2033-specific openings are not in the snapshot.",
                    expected_kind="absence",
                )
            )
        self.rng.shuffle(openings_2033)
        self.take(openings_2033, 30, "absence_2033_openings")


def main() -> None:
    dataset = build_dataset()
    builder = Builder(dataset)
    builder.answerable()
    builder.partials()
    builder.unanswerable()
    rows = builder.rows_out
    if len(rows) != 300:
        raise SystemExit(f"expected 300 questions, got {len(rows)}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    manifest = {
        "path": str(OUT),
        "sha256": digest,
        "count": len(rows),
        "conditions": dict(Counter(row["condition"] for row in rows)),
        "categories": dict(Counter(parse_question(row["id"], row["question"], dataset).kind for row in rows)),
        "skipped": dict(builder.skipped),
        "validation": "candidate; human review required",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} -> {OUT}")
    print("sha256:", digest)
    print("conditions:", manifest["conditions"])
    print("categories:", manifest["categories"])
    print("skipped:", manifest["skipped"])


if __name__ == "__main__":
    main()
