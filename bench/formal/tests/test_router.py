"""Deterministic router tests."""

from __future__ import annotations

import unittest

from formal.model import Verification
from formal.router import route_verification


class RouterTest(unittest.TestCase):
    def test_show_verdicts(self) -> None:
        for verdict in (
            "ENTAILED",
            "ENTAILED_UNDER_ASSUMPTIONS",
            "ABSENT_CONFIRMED",
            "NOT_FOUND_IN_CORPUS",
        ):
            self.assertEqual(route_verification(Verification(verdict=verdict)).action, "show")

    def test_reject(self) -> None:
        self.assertEqual(route_verification(Verification(verdict="CONTRADICTION")).action, "reject")

    def test_ask_specification(self) -> None:
        self.assertEqual(
            route_verification(Verification(verdict="NEEDS_SPECIFICATION")).action,
            "ask_specification",
        )

    def test_fallback_nli(self) -> None:
        self.assertEqual(
            route_verification(Verification(verdict="NOT_FORMALIZABLE")).action,
            "fallback_nli",
        )

    def test_escalate_and_abstain(self) -> None:
        self.assertEqual(
            route_verification(Verification(verdict="INCOMPLETE")).action,
            "escalate_human",
        )
        self.assertEqual(route_verification(Verification(verdict="UNKNOWN")).action, "abstain")

    def test_route_is_serializable(self) -> None:
        route = route_verification(Verification(verdict="ENTAILED"))
        self.assertEqual(route.to_dict(), {"action": "show", "reason": "the claim follows from the premises"})


if __name__ == "__main__":
    unittest.main()
