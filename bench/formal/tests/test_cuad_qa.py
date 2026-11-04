"""CUAD QA metric tests with synthetic predictions (no model download)."""

from __future__ import annotations

import unittest

from formal.cuad import CuadSpan
from formal.cuad_qa import QAResult, QASpan, metrics, presence_metrics


def _result(
    question_id: str,
    category: str,
    gold: list[CuadSpan],
    preds: list[QASpan],
) -> QAResult:
    return QAResult(
        id=question_id,
        contract="contract",
        category=category,
        question="question",
        context="context",
        gold_spans=tuple(gold),
        is_impossible=not gold,
        preds=tuple(preds),
    )


class CuadQaMetricTest(unittest.TestCase):
    def test_exact_match_has_perfect_aupr(self) -> None:
        gold = CuadSpan("governed by the laws of Delaware", 0, 34)
        result = _result(
            "q1",
            "Governing Law",
            [gold],
            [QASpan("governed by the laws of Delaware", 0, 34, 1.0)],
        )
        data = metrics([result])
        category = data["per_category"]["Governing Law"]
        self.assertAlmostEqual(category["aupr"], 1.0)
        self.assertAlmostEqual(category["p_at_80"], 1.0)
        self.assertAlmostEqual(category["p_at_90"], 1.0)

    def test_no_answer_question_counts_false_positives(self) -> None:
        result = _result(
            "q1",
            "Governing Law",
            [],
            [QASpan("the Company shall maintain insurance", 0, 37, 1.0)],
        )
        data = metrics([result])
        category = data["per_category"]["Governing Law"]
        self.assertEqual(category["positive_questions"], 0)
        self.assertAlmostEqual(category["aupr"], 0.0)

    def test_macro_average_is_over_categories(self) -> None:
        gold_a = CuadSpan("governed by the laws of Delaware", 0, 34)
        gold_b = CuadSpan("the Company shall maintain insurance", 0, 37)
        results = [
            _result(
                "q1",
                "Governing Law",
                [gold_a],
                [QASpan(gold_a.text, 0, 34, 1.0)],
            ),
            _result(
                "q2",
                "Insurance",
                [gold_b],
                [QASpan("wrong span", 0, 10, 1.0)],
            ),
        ]
        data = metrics(results)
        self.assertEqual(data["categories"], 2)
        self.assertAlmostEqual(
            data["macro"]["aupr"],
            (
                data["per_category"]["Governing Law"]["aupr"]
                + data["per_category"]["Insurance"]["aupr"]
            )
            / 2,
        )

    def test_presence_metrics_counts_no_answer_false_accepts(self) -> None:
        gold = CuadSpan("governed by the laws of Delaware", 0, 34)
        results = [
            _result(
                "q1",
                "Governing Law",
                [gold],
                [QASpan(gold.text, 0, 34, 1.0)],
            ),
            _result(
                "q2",
                "Governing Law",
                [],
                [QASpan("wrong span", 0, 10, 1.0)],
            ),
        ]
        data = presence_metrics(results)
        at_one = data["at_zero"]
        self.assertEqual(at_one["tp"], 1)
        self.assertEqual(at_one["fp"], 1)
        self.assertAlmostEqual(at_one["precision"], 0.5)
        self.assertAlmostEqual(at_one["false_accept_rate"], 1.0)
        self.assertIn("best_f1", data)
        self.assertIn("precision_first", data)


if __name__ == "__main__":
    unittest.main()
