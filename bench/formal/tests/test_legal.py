"""Synthetic legal playbook demo tests (no real client data, no legal advice)."""

from __future__ import annotations

import contextlib
import io
import json
import unittest
from pathlib import Path

from formal.legal import extract_facts, load_playbook, main, verify_contract


class LegalDemoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.root = Path(__file__).resolve().parents[1] / "legal"
        cls.contract = (cls.root / "contract.md").read_text(encoding="utf-8")
        cls.playbook = cls.root / "playbook.json"

    def test_extracts_the_six_fields(self) -> None:
        facts = extract_facts(self.contract)
        self.assertEqual(facts.governing_law.value, "Delaware")
        self.assertEqual(facts.liability_cap_months.value, 12)
        self.assertEqual(facts.notice_days.value, 30)
        self.assertEqual(facts.renewal_months.value, 12)
        self.assertTrue(facts.data_protection.value)
        self.assertTrue(facts.assignment_consent.value)

    def test_all_rules_entailed(self) -> None:
        _, findings, spec_id = verify_contract(self.contract, self.playbook)
        self.assertEqual(len(findings), 6)
        self.assertTrue(all(f.verdict == "ENTAILED" for f in findings))
        self.assertTrue(all(f.route == "show" for f in findings))
        self.assertTrue(all(f.receipt["spec_id"] == spec_id for f in findings))
        self.assertTrue(all(f.quote for f in findings))

    def test_bad_liability_is_contradiction(self) -> None:
        bad = self.contract.replace("fees paid in the 12 months", "fees paid in the 6 months")
        _, findings, _ = verify_contract(bad, self.playbook)
        by_id = {f.rule_id: f for f in findings}
        self.assertEqual(by_id["liability-cap"].verdict, "CONTRADICTION")
        self.assertEqual(by_id["liability-cap"].route, "reject")

    def test_missing_data_protection_is_incomplete(self) -> None:
        bad = self.contract.replace("applicable data protection laws", "applicable laws")
        _, findings, _ = verify_contract(bad, self.playbook)
        by_id = {f.rule_id: f for f in findings}
        self.assertEqual(by_id["data-protection"].verdict, "INCOMPLETE")
        self.assertEqual(by_id["data-protection"].route, "escalate_human")

    def test_cli_json(self) -> None:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = main(
                [
                    "--contract",
                    str(self.root / "contract.md"),
                    "--playbook",
                    str(self.playbook),
                    "--json",
                ]
            )
        self.assertEqual(code, 0)
        payload = json.loads(buf.getvalue())
        self.assertEqual(len(payload["findings"]), 6)
        self.assertEqual(payload["findings"][0]["verdict"], "ENTAILED")

    def test_playbook_loads_six_rules(self) -> None:
        rules = load_playbook(self.playbook)
        self.assertEqual(len(rules), 6)
        self.assertEqual({r.id for r in rules}, {
            "governing-law", "liability-cap", "notice-period",
            "renewal-term", "data-protection", "assignment-consent",
        })


if __name__ == "__main__":
    unittest.main()
