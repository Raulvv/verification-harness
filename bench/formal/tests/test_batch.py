"""Batch verification tests (no model calls)."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from formal.batch import BatchItem, load_batch, main, verify_batch
from formal.competitive import DEFAULT_CLAIMS
from formal.rows import build_dataset
from formal.z3check import Premises


class BatchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset = build_dataset()
        cls.premises = Premises(cls.dataset)
        cls.items = load_batch(DEFAULT_CLAIMS)

    def test_batch_verdicts_and_routes(self) -> None:
        results = verify_batch(self.items, self.dataset, self.premises)
        by_id = {r.id: r for r in results}
        self.assertEqual(len(results), 10)
        self.assertEqual(by_id["lookup-supported"].verdict, "ENTAILED")
        self.assertEqual(by_id["lookup-supported"].route, "show")
        self.assertEqual(by_id["lookup-contradicted"].verdict, "CONTRADICTION")
        self.assertEqual(by_id["lookup-contradicted"].route, "reject")
        self.assertEqual(by_id["absence-supported"].verdict, "ABSENT_CONFIRMED")
        self.assertEqual(by_id["absence-supported"].route, "show")
        self.assertTrue(by_id["lookup-supported"].citations)

    def test_cli_jsonl_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            inp = Path(tmp) / "in.jsonl"
            out = Path(tmp) / "out.jsonl"
            inp.write_text(
                json.dumps(
                    {
                        "id": "x",
                        "question": "What is the median annual wage for Writers and Authors?",
                        "answer": "The 2023 median annual wage for writers and authors is $73,690 per year.",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            code = main(["--input", str(inp), "--output", str(out)])
            self.assertEqual(code, 0)
            rows = [json.loads(line) for line in out.read_text().splitlines() if line.strip()]
            self.assertEqual(rows[0]["id"], "x")
            self.assertEqual(rows[0]["verdict"], "ENTAILED")
            self.assertEqual(rows[0]["route"]["action"], "show")

    def test_cli_json_array(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            inp = Path(tmp) / "in.jsonl"
            inp.write_text(
                json.dumps(
                    {
                        "id": "x",
                        "question": "What is the median annual wage for Writers and Authors?",
                        "answer": "The 2023 median annual wage for writers and authors is $73,690 per year.",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = main(["--input", str(inp), "--json"])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(buf.getvalue())[0]["id"], "x")

    def test_one_bad_item_does_not_kill_the_batch(self) -> None:
        # An empty question is still a typed, explicit result, not a crash.
        results = verify_batch(
            [
                BatchItem(id="ok", question="What is the median annual wage for Writers and Authors?", answer="$73,690"),
                BatchItem(id="bad", question="", answer=""),
            ],
            self.dataset,
            self.premises,
        )
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].id, "ok")
        self.assertEqual(results[1].id, "bad")
        self.assertIn(results[1].verdict, {"NOT_FORMALIZABLE", "INCOMPLETE", "ERROR"})


if __name__ == "__main__":
    unittest.main()
