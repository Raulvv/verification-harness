"""Reader-first extraction tests: prose answer -> typed claim -> verdict."""

from __future__ import annotations

import unittest

from formal.extract import RuleBasedExtractor, verify_reader_answer
from formal.rows import build_dataset
from formal.z3check import Premises


class ReaderFirstTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset = build_dataset()
        cls.premises = Premises(cls.dataset)

    def test_lookup_correct(self) -> None:
        extraction, verification = verify_reader_answer(
            "What is the median annual wage for Writers and Authors?",
            "The 2023 median annual wage for writers and authors is $73,690 per year.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(extraction.claims[0].text, "73,690")
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_lookup_wrong_value(self) -> None:
        _, verification = verify_reader_answer(
            "What is the median annual wage for Writers and Authors?",
            "The 2023 median annual wage for writers and authors is $99,999 per year.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_difference_correct(self) -> None:
        extraction, verification = verify_reader_answer(
            "What is the difference in median annual pay between Chefs and Head Cooks and Accountants and Auditors?",
            "The difference is $20,960 per year.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(extraction.claims[0].text, "20,960")
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_difference_wrong_value(self) -> None:
        _, verification = verify_reader_answer(
            "What is the difference in median annual pay between Chefs and Head Cooks and Accountants and Auditors?",
            "The difference is $1 per year.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_sum_correct(self) -> None:
        _, verification = verify_reader_answer(
            "What is the combined 2023 employment of Financial Analysts and Customer Service Representatives?",
            "The combined 2023 employment was 3,359,400.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_compare_correct(self) -> None:
        _, verification = verify_reader_answer(
            "Which has the higher median annual pay, Social Workers or Registered Nurses, and by how much?",
            "Registered Nurses have the higher median annual pay: $86,070, compared with $58,380 for Social Workers. The difference is $27,690.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_compare_wrong_winner(self) -> None:
        _, verification = verify_reader_answer(
            "Which has the higher median annual pay, Social Workers or Registered Nurses, and by how much?",
            "Social Workers have the higher median annual pay. The difference is $27,690.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_extremum_correct(self) -> None:
        _, verification = verify_reader_answer(
            "Among Childcare Workers, Mechanical Engineers, and Janitors and Building Cleaners, which occupation has the highest projected growth rate?",
            "Mechanical Engineers has the highest projected growth rate: 11%, compared with 3% for Janitors and Building Cleaners and a decline of 1% for Childcare Workers.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_extremum_wrong_winner(self) -> None:
        _, verification = verify_reader_answer(
            "Among Childcare Workers, Mechanical Engineers, and Janitors and Building Cleaners, which occupation has the highest projected growth rate?",
            "Childcare Workers has the highest projected growth rate: 11%.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_count_correct(self) -> None:
        _, verification = verify_reader_answer(
            "How many of the 48 occupations have a projected growth rate greater than 10% from 2023 to 2033?",
            "6 occupations.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_count_wrong(self) -> None:
        _, verification = verify_reader_answer(
            "How many of the 48 occupations have a projected growth rate greater than 10% from 2023 to 2033?",
            "7 occupations.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_abstention_has_no_typed_claim(self) -> None:
        extraction, verification = verify_reader_answer(
            "What is the median annual wage for Writers and Authors?",
            "NOT FOUND — the corpus does not state it.",
            self.dataset,
            self.premises,
        )
        self.assertIsNone(extraction.answer)
        self.assertIn("abstention", extraction.notes)
        self.assertEqual(verification.verdict, "INCOMPLETE")

    def test_unsupported_question_is_explicit(self) -> None:
        extraction, verification = verify_reader_answer(
            "Why do electricians earn more than carpenters?",
            "Because of unionization.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(extraction.qir.kind, "not_formalizable")
        self.assertEqual(verification.verdict, "NOT_FORMALIZABLE")

    def test_extractor_is_deterministic(self) -> None:
        extractor = RuleBasedExtractor(self.dataset)
        q = "What is the median annual wage for Writers and Authors?"
        a = "The 2023 median annual wage for writers and authors is $73,690 per year."
        first = extractor.extract(q, a)
        second = extractor.extract(q, a)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
