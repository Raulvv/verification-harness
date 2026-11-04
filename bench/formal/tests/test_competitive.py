"""Competitive benchmark harness tests (fixtures only; no model calls)."""

from __future__ import annotations

import unittest

from formal.competitive import DEFAULT_CLAIMS, format_report, map_verdict, run


class CompetitiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.detector = DEFAULT_CLAIMS.parent / "detectors" / "nli.jsonl"
        cls.result = run(DEFAULT_CLAIMS, [cls.detector])

    def test_formal_has_no_false_accepts(self) -> None:
        formal = self.result["systems"]["formal"]
        self.assertEqual(formal["n"], 10)
        self.assertEqual(formal["false_accept_count"], 0)
        self.assertEqual(formal["false_reject_count"], 0)
        self.assertEqual(formal["binary_accuracy"], 1.0)
        self.assertEqual(formal["exact_accuracy"], 1.0)

    def test_detector_fixture_exposes_false_accept_and_reject(self) -> None:
        nli = self.result["systems"]["nli"]
        self.assertEqual(nli["false_accept_count"], 1)
        self.assertEqual(nli["false_reject_count"], 1)
        self.assertEqual(nli["false_accepts"], ["lookup-contradicted"])
        self.assertEqual(nli["false_rejects"], ["compare-supported"])
        self.assertEqual(nli["binary_accuracy"], 0.8)

    def test_report_contains_both_systems(self) -> None:
        report = format_report(self.result)
        self.assertIn("formal", report)
        self.assertIn("nli", report)
        self.assertIn("by category", report)

    def test_pilot_set_has_evidence_and_both_polarities(self) -> None:
        from formal.competitive import load_claims

        pilot = DEFAULT_CLAIMS.parent / "pilot-50.jsonl"
        claims = load_claims(pilot)
        self.assertEqual(len(claims), 50)
        self.assertTrue(all(c.evidence for c in claims))
        golds = {c.gold for c in claims}
        self.assertEqual(golds, {"supported", "contradicted", "absent"})
        categories = {c.category for c in claims}
        self.assertTrue({"lookup", "difference", "compare", "extremum", "count", "sum", "absence"} <= categories)

    def test_verdict_mapping(self) -> None:
        self.assertEqual(map_verdict("ENTAILED"), "supported")
        self.assertEqual(map_verdict("ENTAILED_UNDER_ASSUMPTIONS"), "supported")
        self.assertEqual(map_verdict("CONTRADICTION"), "contradicted")
        self.assertEqual(map_verdict("ABSENT_CONFIRMED"), "absent")
        self.assertEqual(map_verdict("NEEDS_SPECIFICATION"), "needs_specification")
        self.assertEqual(map_verdict("UNKNOWN"), "unknown")


if __name__ == "__main__":
    unittest.main()
