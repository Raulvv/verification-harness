"""NLI fallback adapter tests (no model calls; command adapter uses a local stub)."""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

from formal.cli import main
from formal.model import Verification
from formal.nli import CommandNLI, NLIResult, StubNLI, route_with_fallback


class NLITest(unittest.TestCase):
    def test_fallback_only_runs_for_not_formalizable(self) -> None:
        nli = StubNLI(NLIResult(verdict="supported", score=0.9, model="stub"))
        decision = route_with_fallback(
            Verification(verdict="NOT_FORMALIZABLE"),
            "q", "a", "evidence", nli,
        )
        self.assertEqual(decision.route.action, "fallback_nli")
        self.assertIsNotNone(decision.nli)
        self.assertEqual(decision.nli.verdict, "supported")

    def test_fallback_does_not_run_for_entailed_or_contradiction(self) -> None:
        nli = StubNLI(NLIResult(verdict="supported", score=0.9, model="stub"))
        for verdict in ("ENTAILED", "CONTRADICTION", "NEEDS_SPECIFICATION"):
            decision = route_with_fallback(
                Verification(verdict=verdict), "q", "a", "evidence", nli
            )
            self.assertIsNone(decision.nli)
            self.assertNotEqual(decision.route.action, "fallback_nli")

    def test_command_nli_parses_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "stub.py"
            script.write_text(
                "import json,sys\n"
                "data=json.load(sys.stdin)\n"
                "print(json.dumps({'label':'supported','score':0.88,'model':'stub'}))\n",
                encoding="utf-8",
            )
            nli = CommandNLI(f"{sys.executable} {script}")
            result = nli.check("q", "a", "evidence")
            self.assertEqual(result.verdict, "supported")
            self.assertEqual(result.score, 0.88)
            self.assertEqual(result.model, "stub")

    def test_command_nli_failure_is_unknown(self) -> None:
        nli = CommandNLI("exit 3")
        result = nli.check("q", "a", "evidence")
        self.assertEqual(result.verdict, "unknown")
        self.assertIn("exited 3", result.rationale or "")

    def test_cli_runs_fallback_for_not_formalizable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "stub.py"
            script.write_text(
                "import json,sys\n"
                "json.load(sys.stdin)\n"
                "print(json.dumps({'label':'supported','score':0.7,'model':'stub'}))\n",
                encoding="utf-8",
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = main(
                    [
                        "--json",
                        "--nli-cmd",
                        f"{sys.executable} {script}",
                        "Why do electricians earn more than carpenters?",
                    ]
                )
            self.assertEqual(code, 0)
            payload = json.loads(buf.getvalue())
            self.assertEqual(payload["route"]["action"], "fallback_nli")
            self.assertEqual(payload["nli"]["verdict"], "supported")

    def test_result_serialization(self) -> None:
        result = NLIResult(verdict="contradicted", score=0.1, model="stub")
        self.assertEqual(result.to_dict()["verdict"], "contradicted")


if __name__ == "__main__":
    unittest.main()
