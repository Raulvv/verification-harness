"""Closed-corpus absence tests: a receipt, not an open-world claim."""

from __future__ import annotations

import unittest

from formal.compile import derive_answer
from formal.coverage import CorpusIndex, verify_corpus_absence
from formal.rows import ROOT, build_dataset
from formal.spec import SpecRegistry, close_qir
from formal.spec_examples import open_world_absence
from formal.z3check import Premises, check_answer


class CoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset = build_dataset()
        cls.premises = Premises(cls.dataset)
        cls.index = CorpusIndex.from_directory(
            ROOT / "bench/corpus/ooh-v1", "ooh-v1"
        )

    def test_index_searches_all_pages(self) -> None:
        self.assertEqual(len(self.index.files), 48)
        self.assertEqual(self.index.search("New York City").hits, 0)
        self.assertGreater(self.index.search("Registered Nurses").hits, 0)

    def test_not_found_in_corpus(self) -> None:
        verification = verify_corpus_absence(self.index, "New York City")
        self.assertEqual(verification.verdict, "NOT_FOUND_IN_CORPUS")
        self.assertEqual(len(verification.coverage_receipts), 1)
        receipt = verification.coverage_receipts[0]
        self.assertEqual(receipt.corpus_id, "ooh-v1")
        self.assertEqual(receipt.files_searched, 48)
        self.assertEqual(receipt.hits, 0)
        self.assertTrue(receipt.complete)

    def test_seeded_mention_is_not_absent(self) -> None:
        verification = verify_corpus_absence(self.index, "Registered Nurses")
        self.assertEqual(verification.verdict, "CONTRADICTION")
        self.assertGreater(verification.coverage_receipts[0].hits, 0)

    def _closed_absence_qir(self):
        qir = open_world_absence()
        resolution = close_qir(
            qir,
            registry=SpecRegistry(),
            overrides={"scope:corpus": "ooh-v1"},
        )
        self.assertTrue(resolution.closed)
        return resolution.qir

    def test_absence_with_receipt_is_not_found(self) -> None:
        qir = self._closed_absence_qir()
        answer = derive_answer(qir, self.dataset)
        receipt = self.index.search("New York City")
        verification = check_answer(
            qir,
            answer,
            self.premises,
            coverage_receipts=(receipt,),
        )
        self.assertEqual(verification.verdict, "NOT_FOUND_IN_CORPUS")
        self.assertEqual(verification.coverage_receipts[0].corpus_id, "ooh-v1")

    def test_absence_without_receipt_needs_specification(self) -> None:
        qir = self._closed_absence_qir()
        answer = derive_answer(qir, self.dataset)
        verification = check_answer(qir, answer, self.premises)
        self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
        self.assertNotEqual(verification.verdict, "ABSENT_CONFIRMED")

if __name__ == "__main__":
    unittest.main()
