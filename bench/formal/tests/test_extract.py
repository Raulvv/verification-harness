"""Reader-first extraction tests: prose answer -> typed claim -> verdict."""

from __future__ import annotations

import unittest

from formal.extract import RuleBasedExtractor, verify_reader_answer
from formal.rows import build_dataset
from formal.spec_examples import best_stability, most_bachelors_pay_over_60k
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

    def test_absence_abstention_is_absent_confirmed(self) -> None:
        extraction, verification = verify_reader_answer(
            "What is the median annual pay for Information Security Analysts in New York?",
            "NOT FOUND — the corpus does not state the median annual pay for Information Security Analysts in New York.",
            self.dataset,
            self.premises,
        )
        self.assertIsNotNone(extraction.answer)
        self.assertEqual(verification.verdict, "ABSENT_CONFIRMED")

    def test_absence_overclaim_is_incomplete(self) -> None:
        extraction, verification = verify_reader_answer(
            "What is the median annual pay for Information Security Analysts in New York?",
            "The median annual pay in New York is $100,000.",
            self.dataset,
            self.premises,
        )
        self.assertIsNone(extraction.answer)
        self.assertIn("absence_overclaim", extraction.notes)
        self.assertEqual(verification.verdict, "INCOMPLETE")

    def test_quantified_yes_is_entailed_under_assumptions(self) -> None:
        _, verification = verify_reader_answer(
            "Most occupations with a bachelor's degree pay more than $60,000.",
            "Yes — 16 of 17 matching occupations satisfy the condition.",
            self.dataset,
            self.premises,
            qir=most_bachelors_pay_over_60k(),
        )
        self.assertEqual(verification.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertTrue(verification.assumptions)

    def test_quantified_no_is_contradicted(self) -> None:
        _, verification = verify_reader_answer(
            "Most occupations with a bachelor's degree pay more than $60,000.",
            "No — only 16 of 17 matching occupations satisfy the condition.",
            self.dataset,
            self.premises,
            qir=most_bachelors_pay_over_60k(),
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_rank_correct(self) -> None:
        _, verification = verify_reader_answer(
            "This is the best career for someone who wants stability.",
            "Using the default definitions, the top-ranked occupation is Software Developers, Quality Assurance Analysts, and Testers (score 63.8).",
            self.dataset,
            self.premises,
            qir=best_stability(),
        )
        self.assertEqual(verification.verdict, "ENTAILED_UNDER_ASSUMPTIONS")

    def test_rank_wrong_winner(self) -> None:
        _, verification = verify_reader_answer(
            "This is the best career for someone who wants stability.",
            "Using the default definitions, the top-ranked occupation is Accountants and Auditors (score 79.88).",
            self.dataset,
            self.premises,
            qir=best_stability(),
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_answerable_not_found_is_contradiction(self) -> None:
        _, verification = verify_reader_answer(
            "How many more annual openings does Graphic Designers have than Waiters and Waitresses?",
            "NOT FOUND — the corpus does not state how many more annual openings Graphic Designers have than Waiters and Waitresses.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")

    def test_doc_reference_does_not_become_the_value(self) -> None:
        _, verification = verify_reader_answer(
            "What is the projected employment change for Musicians and Singers from 2023 to 2033?",
            "Doc 1 projects that employment of Musicians and Singers will change by 3,500 jobs from 2023 to 2033. That is a 2% increase, described as slower than average, from a base of 169,300 jobs in 2023.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_arithmetic_difference_takes_the_result(self) -> None:
        _, verification = verify_reader_answer(
            "What is the difference in projected employment change between School and Career Counselors and Advisors and Chemists and Materials Scientists from 2023 to 2033?",
            "School and Career Counselors and Advisors have a change of 16,200 jobs. Chemists and Materials Scientists have a change of 7,500 jobs. The difference is 16,200 − 7,500 = 8,700 jobs.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_arithmetic_sum_takes_the_result(self) -> None:
        _, verification = verify_reader_answer(
            "What is the combined 2023 employment of Financial Analysts and Customer Service Representatives?",
            "Financial Analysts had 404,800 jobs in 2023, and Customer Service Representatives had 2,954,600 jobs in 2023. Combined, that is 404,800 + 2,954,600 = 3,359,400 jobs.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_percentage_points_more_wording(self) -> None:
        _, verification = verify_reader_answer(
            "Which has the higher projected growth rate, Machinists and Tool and Die Makers or Heating, Air Conditioning, and Refrigeration Mechanics and Installers, and by how many percentage points?",
            "Heating, Air Conditioning, and Refrigeration Mechanics and Installers has the higher projected growth rate. Their outlook is 9%, while Machinists and Tool and Die Makers have 0%. Therefore, HVAC Mechanics and Installers are projected to grow by 9 percentage points more than Machinists and Tool and Die Makers.",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_top_coded_lower_bound_is_supported(self) -> None:
        _, verification = verify_reader_answer(
            "Among all 46 occupations in this snapshot that report a median annual pay, which has the highest median annual pay, and what is that pay?",
            "Among the occupations shown, physicians and surgeons have the highest median annual pay: their 2023 median pay is equal to or greater than $239,200 per year, which exceeds the medians for accountants and auditors ($79,880), chefs and head cooks ($58,920), and machinists and tool and die makers ($53,180).",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_verbose_sum_extracts_the_combined_value(self) -> None:
        _, verification = verify_reader_answer(
            "What is the combined projected 2033 employment of Financial Analysts and Actuaries?",
            "The documents do not state projected 2033 employment levels directly, but they give the 2023 job counts and the projected 2023–33 employment change for each occupation, so the figure can be derived. Financial analysts: 404,800 jobs in 2023 plus an employment change of 37,900 over 2023–33, giving about 442,700 jobs in 2033. Actuaries: 30,200 jobs in 2023 plus an employment change of 6,600, giving about 36,800 jobs in 2033. Combined projected 2033 employment is therefore roughly 479,500 (442,700 + 36,800).",
            self.dataset,
            self.premises,
        )
        self.assertEqual(verification.verdict, "ENTAILED")

    def test_false_absence_subclaim_is_contradiction(self) -> None:
        _, verification = verify_reader_answer(
            "Among Electricians, Automotive Service Technicians and Mechanics, and Financial Analysts, which occupation has the highest median annual pay?",
            "The documents state that financial analysts had a 2023 median annual pay of $99,890 and automotive service technicians and mechanics had $47,770. They do not state the median annual pay for electricians, so the highest among all three cannot be determined from the corpus; among the two occupations whose pay is stated, financial analysts are higher.",
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
        self.assertEqual(verification.verdict, "CONTRADICTION")

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
