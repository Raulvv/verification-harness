"""CUAD adapter tests with a tiny synthetic fixture (no downloads, no models)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from formal.cuad import (
    CuadSpan,
    SpanPrediction,
    contract_vectors,
    evaluate,
    fit_models,
    load_cuad,
    load_official_split,
    predict,
    quote_supports,
    sentences,
    span_jaccard,
    span_metrics,
)


def _qa(category: str, context: str, spans: list[str]) -> dict:
    answers = [
        {"text": span, "answer_start": context.index(span)}
        for span in spans
    ]
    return {
        "id": f"fixture__{category}",
        "question": f'Highlight the parts related to "{category}" that should be reviewed.',
        "answers": answers,
        "is_impossible": not answers,
    }


def _contract(title: str, context: str, qas: list[dict]) -> dict:
    return {"title": title, "paragraphs": [{"context": context, "qas": qas}]}


def _fixture() -> dict:
    c1 = (
        "This Agreement is governed by the laws of the State of Delaware. "
        "The Company shall maintain insurance against liability."
    )
    c2 = (
        "This Agreement is governed by the laws of the State of New York. "
        "No party shall compete with the other party."
    )
    t1 = (
        "This Agreement is governed by the laws of the State of California. "
        "The Company shall maintain insurance coverage."
    )
    t2 = (
        "This Agreement is governed by the laws of the State of Texas. "
        "The parties shall not compete."
    )
    train = {
        "version": "aok_v1.0",
        "data": [
            _contract(
                "train-1",
                c1,
                [
                    _qa("Governing Law", c1, ["governed by the laws of the State of Delaware"]),
                    _qa("Insurance", c1, ["maintain insurance"]),
                    _qa("Non-Compete", c1, []),
                ],
            ),
            _contract(
                "train-2",
                c2,
                [
                    _qa("Governing Law", c2, ["governed by the laws of the State of New York"]),
                    _qa("Insurance", c2, []),
                    _qa("Non-Compete", c2, ["shall compete"]),
                ],
            ),
        ],
    }
    test = {
        "version": "aok_v1.0",
        "data": [
            _contract(
                "test-1",
                t1,
                [
                    _qa("Governing Law", t1, ["governed by the laws of the State of California"]),
                    _qa("Insurance", t1, ["maintain insurance coverage"]),
                    _qa("Non-Compete", t1, []),
                ],
            ),
            _contract(
                "test-2",
                t2,
                [
                    _qa("Governing Law", t2, ["governed by the laws of the State of Texas"]),
                    _qa("Insurance", t2, []),
                    _qa("Non-Compete", t2, ["shall not compete"]),
                ],
            ),
        ],
    }
    return {"train": train, "test": test}


class CuadTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = _fixture()

    def _write(self, directory: Path) -> Path:
        (directory / "CUADv1.json").write_text(
            json.dumps(self.fixture["train"]), encoding="utf-8"
        )
        (directory / "test.json").write_text(
            json.dumps(self.fixture["test"]), encoding="utf-8"
        )
        return directory

    def test_load_official_split(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = self._write(Path(tmp))
            train, test = load_official_split(data)
        self.assertEqual({item.contract for item in train}, {"train-1", "train-2"})
        self.assertEqual({item.contract for item in test}, {"test-1", "test-2"})
        self.assertEqual(len(train), 6)
        self.assertEqual(len(test), 6)

    def test_load_cuad_parses_category_and_spans(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = self._write(Path(tmp))
            items = load_cuad(data / "test.json", "test")
        governing = [item for item in items if item.category == "Governing Law"]
        self.assertEqual(len(governing), 2)
        self.assertTrue(all(item.gold_spans for item in governing))

    def test_detector_finds_governing_law_with_quote(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = self._write(Path(tmp))
            train, test = load_official_split(data)
            space, models = fit_models(train)
            item = next(
                item
                for item in test
                if item.contract == "test-1" and item.category == "Governing Law"
            )
            prediction = predict(
                item,
                models["Governing Law"],
                threshold=-1.0,
                vectors=contract_vectors(space, item),
            )
        self.assertTrue(prediction.present)
        self.assertIn("governed by", prediction.quote or "")
        self.assertEqual(prediction.verdict, "ENTAILED")
        self.assertEqual(prediction.receipt.hits, 1)

    def test_absence_is_closed_world_with_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = self._write(Path(tmp))
            train, test = load_official_split(data)
            space, models = fit_models(train)
            item = next(
                item
                for item in test
                if item.contract == "test-1" and item.category == "Non-Compete"
            )
            prediction = predict(
                item,
                models["Non-Compete"],
                threshold=-1.0,
                vectors=contract_vectors(space, item),
            )
        self.assertFalse(prediction.present)
        self.assertIsNone(prediction.quote)
        self.assertEqual(prediction.verdict, "ABSENT_CONFIRMED")
        self.assertEqual(prediction.receipt.hits, 0)
        self.assertTrue(prediction.receipt.complete)

    def test_quote_support_accepts_exact_and_overlap(self) -> None:
        gold = (CuadSpan("the laws of the State of Delaware", 0, 35),)
        self.assertTrue(
            quote_supports("governed by the laws of the State of Delaware", gold)
        )
        self.assertFalse(
            quote_supports("the Company shall maintain insurance", gold)
        )

    def test_evaluate_counts_every_claim(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = self._write(Path(tmp))
            train, test = load_official_split(data)
            space, models = fit_models(train)
            predictions = [
                predict(
                    item,
                    models.get(item.category),
                    threshold=-1.0,
                    vectors=contract_vectors(space, item),
                )
                for item in test
            ]
            overall, per_category = evaluate(predictions)
        self.assertEqual(overall.total, len(test))
        self.assertEqual(sum(counts.total for counts in per_category.values()), len(test))
        self.assertGreaterEqual(overall.tp, 1)
        self.assertGreaterEqual(overall.tn, 1)

    def test_sentences_keep_offsets(self) -> None:
        text = "First sentence here. Second sentence here."
        windows = sentences(text)
        self.assertEqual(len(windows), 2)
        for window in windows:
            self.assertEqual(text[window.start : window.end], window.text)

    def test_span_jaccard(self) -> None:
        self.assertEqual(
            span_jaccard("the laws of Delaware", "the laws of Delaware"), 1.0
        )
        self.assertEqual(
            span_jaccard("the laws of Delaware", "maintain insurance"), 0.0
        )

    def test_span_metrics_scores_matches_and_false_accepts(self) -> None:
        gold = CuadSpan("governed by the laws of Delaware", 0, 34)
        other = CuadSpan("governed by the laws of New York", 0, 33)
        wrong = CuadSpan("the Company shall maintain insurance", 0, 37)
        predictions = [
            SpanPrediction(
                contract="c1",
                category="Governing Law",
                gold_spans=(gold,),
                pred=gold,
                score=0.9,
            ),
            SpanPrediction(
                contract="c2",
                category="Governing Law",
                gold_spans=(other,),
                pred=wrong,
                score=0.8,
            ),
            SpanPrediction(
                contract="c3",
                category="Governing Law",
                gold_spans=(),
                pred=wrong,
                score=0.1,
            ),
        ]
        metrics = span_metrics(predictions)
        category = metrics["per_category"]["Governing Law"]
        self.assertEqual(category["claims"], 3)
        self.assertEqual(category["gold_spans"], 2)
        self.assertGreaterEqual(category["aupr"], 0.0)
        self.assertLessEqual(category["aupr"], 1.0)
        self.assertGreaterEqual(category["p_at_80"], 0.0)
        self.assertLessEqual(category["p_at_80"], 1.0)


if __name__ == "__main__":
    unittest.main()
