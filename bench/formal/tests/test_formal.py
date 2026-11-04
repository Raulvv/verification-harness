"""Non-vacuous tests for the formal spike.

Run from bench/formal:

    .venv/bin/python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import unittest
from collections import Counter

from formal.compile import derive_answer
from formal.evaluate import (
    DEV_QUESTIONS,
    TEST_QUESTIONS,
    VALUE_KINDS,
    canonical_summary,
    load_jsonl,
    mutations_for,
)
from formal.negative import known_row_cases
from formal.parse import parse_question
from formal.rows import build_dataset, schema_has
from formal.z3check import Premises, check_answer


class FormalSpikeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset = build_dataset()
        cls.premises = Premises(cls.dataset)
        cls.test_items = load_jsonl(TEST_QUESTIONS)
        cls.dev_items = load_jsonl(DEV_QUESTIONS)
        cls.test_qir = {
            item["id"]: parse_question(item["id"], item["question"], cls.dataset)
            for item in cls.test_items
        }
        cls.test_answers = {
            qid: derive_answer(qir, cls.dataset) for qid, qir in cls.test_qir.items()
        }
        cls.test_verdicts = {
            qid: check_answer(qir, cls.test_answers[qid], cls.premises)
            for qid, qir in cls.test_qir.items()
        }

    # ------------------------------------------------------------------
    # Data and IR
    # ------------------------------------------------------------------
    def test_table_and_json_agree(self) -> None:
        self.assertTrue(self.dataset.table_agreement["agrees"], self.dataset.table_agreement["mismatches"])
        self.assertEqual(len(self.dataset.rows), 48)
        self.assertEqual(len(self.dataset.paid), 46)

    def test_parser_is_total(self) -> None:
        kinds = Counter(q.kind for q in self.test_qir.values())
        self.assertEqual(kinds["not_formalizable"], 0)
        self.assertEqual(
            kinds,
            Counter(
                {
                    "lookup": 20,
                    "compare": 4,
                    "difference": 7,
                    "sum": 3,
                    "extremum": 6,
                    "absence": 40,
                    "partial": 20,
                }
            ),
        )

    def test_formalizable_value_subset_is_30_to_50(self) -> None:
        n = sum(
            1
            for q in self.test_qir.values()
            if q.formalizable and q.kind in VALUE_KINDS
        )
        self.assertGreaterEqual(n, 30)
        self.assertLessEqual(n, 50)
        self.assertEqual(n, 40)

    def test_every_question_compiles_to_answer_ir(self) -> None:
        for qid, qir in self.test_qir.items():
            answer = self.test_answers[qid]
            self.assertGreaterEqual(len(answer.parts), 1, qid)
            for part in answer.parts:
                self.assertIn(part.status, {"stated", "not_stated", "unknown"}, qid)

    # ------------------------------------------------------------------
    # Canonical verdicts
    # ------------------------------------------------------------------
    def test_canonical_verdicts(self) -> None:
        verdicts = Counter(v.verdict for v in self.test_verdicts.values())
        self.assertEqual(verdicts["ENTAILED"], 59)
        self.assertEqual(verdicts["ABSENT_CONFIRMED"], 40)
        self.assertEqual(verdicts["UNKNOWN"], 1)
        self.assertEqual(verdicts["CONTRADICTION"], 0)
        self.assertEqual(verdicts["NOT_FORMALIZABLE"], 0)

    def test_dev_verdicts(self) -> None:
        for item in self.dev_items:
            qir = parse_question(item["id"], item["question"], self.dataset)
            answer = derive_answer(qir, self.dataset)
            verdict = check_answer(qir, answer, self.premises)
            self.assertEqual(verdict.verdict, "ENTAILED", item["id"])

    # ------------------------------------------------------------------
    # Soundness: no false ENTAILED
    # ------------------------------------------------------------------
    def test_known_rows(self) -> None:
        cases = known_row_cases(self.dataset)
        self.assertEqual(len(cases), 17)
        false_entailed = 0
        for case in cases:
            v = check_answer(case.qir, case.answer, self.premises)
            if case.expected == "NOT_ENTAILED":
                passed = v.verdict != "ENTAILED"
            else:
                passed = v.verdict == case.expected
            self.assertTrue(passed, f"{case.qid} {case.label}: expected {case.expected}, got {v.verdict}")
            if v.verdict == "ENTAILED" and case.expected != "ENTAILED":
                false_entailed += 1
        self.assertEqual(false_entailed, 0)

    def test_mutations_never_entailed(self) -> None:
        total = 0
        false_entailed = []
        for item in self.test_items:
            qir = self.test_qir[item["id"]]
            answer = self.test_answers[item["id"]]
            for label, mutated in mutations_for(qir, answer, self.dataset):
                total += 1
                v = check_answer(qir, mutated, self.premises)
                if v.verdict == "ENTAILED":
                    false_entailed.append((item["id"], label))
        self.assertGreater(total, 50)
        self.assertEqual(false_entailed, [])

    # ------------------------------------------------------------------
    # Specific counterexamples
    # ------------------------------------------------------------------
    def test_top_coded_max_is_unknown_not_entailed(self) -> None:
        v = self.test_verdicts["test-095"]
        self.assertEqual(v.verdict, "UNKNOWN")
        self.assertEqual(v.checks[0].verdict, "ENTAILED")  # winner
        self.assertEqual(v.checks[1].verdict, "UNKNOWN")  # exact pay
        model = v.checks[1].counterexample["model"]
        self.assertGreaterEqual(model["Physicians and Surgeons.annual"], 239200)

    def test_filter_boundary_and_wrong_candidate_set(self) -> None:
        # Current harness answer: Accountants 79,880 as the filtered maximum.
        cases = [c for c in known_row_cases(self.dataset) if c.qid == "test-100"]
        harness = next(c for c in cases if "current harness" in c.label)
        v = check_answer(harness.qir, harness.answer, self.premises)
        self.assertEqual(v.verdict, "CONTRADICTION")

        boundary = next(c for c in cases if "boundary" in c.label)
        v = check_answer(boundary.qir, boundary.answer, self.premises)
        self.assertEqual(v.verdict, "CONTRADICTION")

        dropped = next(c for c in cases if "dropped filter" in c.label)
        v = check_answer(dropped.qir, dropped.answer, self.premises)
        self.assertEqual(v.verdict, "INCOMPLETE")

    def test_directional_difference_is_contradicted(self) -> None:
        cases = [c for c in known_row_cases(self.dataset) if c.qid == "test-041"]
        directional = next(c for c in cases if "directional" in c.label)
        v = check_answer(directional.qir, directional.answer, self.premises)
        self.assertEqual(v.verdict, "CONTRADICTION")

    def test_schema_absence_and_overclaim(self) -> None:
        self.assertEqual(self.test_verdicts["test-091"].verdict, "ABSENT_CONFIRMED")
        cases = [c for c in known_row_cases(self.dataset) if c.qid == "test-091"]
        overclaim = next(c for c in cases if "annual average" in c.label)
        v = check_answer(overclaim.qir, overclaim.answer, self.premises)
        self.assertEqual(v.verdict, "INCOMPLETE")

    # ------------------------------------------------------------------
    # Citations and determinism
    # ------------------------------------------------------------------
    def test_every_citation_maps_to_a_structured_field(self) -> None:
        checked = 0
        for qid, answer in self.test_answers.items():
            for part in answer.parts:
                for citation in part.citations:
                    hit = self.dataset.map_quote(citation.quote, citation.title)
                    self.assertIsNotNone(hit, f"{qid}: {citation.quote!r}")
                    row, field = hit
                    self.assertEqual(row.title, citation.title, qid)
                    self.assertIn(citation.quote, row.quotes.values(), qid)
                    checked += 1
        self.assertGreater(checked, 50)

    def test_deterministic_rerun(self) -> None:
        for item in self.test_items:
            qir = parse_question(item["id"], item["question"], self.dataset)
            answer = derive_answer(qir, self.dataset)
            v = check_answer(qir, answer, self.premises)
            self.assertEqual(v.verdict, self.test_verdicts[item["id"]].verdict, item["id"])
            self.assertEqual(
                canonical_summary(qir, answer),
                canonical_summary(self.test_qir[item["id"]], self.test_answers[item["id"]]),
                item["id"],
            )

    def test_not_formalizable_is_explicit(self) -> None:
        qir = parse_question(
            "x", "Why do electricians earn more than carpenters?", self.dataset
        )
        self.assertEqual(qir.kind, "not_formalizable")
        answer = derive_answer(qir, self.dataset)
        v = check_answer(qir, answer, self.premises)
        self.assertEqual(v.verdict, "NOT_FORMALIZABLE")

    def test_na_pay_lookup_is_confirmed_absence(self) -> None:
        qir = parse_question(
            "x", "What is the median annual pay for Fishing and Hunting Workers?", self.dataset
        )
        self.assertEqual(qir.kind, "lookup")
        answer = derive_answer(qir, self.dataset)
        self.assertEqual(answer.parts[0].status, "not_stated")
        v = check_answer(qir, answer, self.premises)
        self.assertEqual(v.verdict, "ABSENT_CONFIRMED")

    def test_schema_absence_is_closed_world(self) -> None:
        self.assertFalse(schema_has("annual", "place"))
        self.assertFalse(schema_has("jobs", "year"))
        self.assertFalse(schema_has("outlook_pct", "period"))
        self.assertFalse(schema_has("annual_openings", "specific_year"))
        self.assertTrue(schema_has("annual", None))
        self.assertIsNone(self.dataset.by_title["Fishing and Hunting Workers"].annual)
        self.assertIsNone(self.dataset.by_title["Musicians and Singers"].annual)


if __name__ == "__main__":
    unittest.main()
