"""Tests for the specification layer (EPIC-FORMAL-002 Phase 0/1)."""

from __future__ import annotations

import contextlib
import io
import json
import unittest

from formal.cli import human_answer, humanize_assumption, main
from formal.compile import derive_answer
from formal.rows import build_dataset
from formal.spec import SpecRegistry, close_qir
from formal.spec_examples import (
    best_stability,
    causal_question,
    difference_direction,
    most_bachelors_pay_over_60k,
    normative_question,
    open_world_absence,
    pay_unit,
)
from formal.z3check import Premises, check_answer, verify_question


class SpecLayerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset = build_dataset()
        cls.premises = Premises(cls.dataset)
        cls.registry = SpecRegistry()

    def _verify(self, qir, overrides=None, allow_defaults=True):
        resolution = close_qir(
            qir,
            registry=self.registry,
            overrides=overrides,
            allow_defaults=allow_defaults,
        )
        answer = derive_answer(resolution.qir, self.dataset)
        verification = check_answer(resolution.qir, answer, self.premises)
        return resolution, answer, verification

    # ------------------------------------------------------------------
    # Quantifier: "most"
    # ------------------------------------------------------------------
    def test_most_needs_specification_without_defaults(self) -> None:
        qir = most_bachelors_pay_over_60k()
        _, _, verification = verify_question(
            qir,
            self.dataset,
            premises=self.premises,
            registry=self.registry,
            allow_defaults=False,
        )
        self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
        self.assertTrue(any(u.kind == "quantifier" for u in verification.unresolved))

    def test_most_default_majority_is_entailed_under_assumptions(self) -> None:
        resolution, answer, verification = self._verify(most_bachelors_pay_over_60k())
        self.assertTrue(resolution.closed)
        self.assertEqual(resolution.qir.threshold_num, 1)
        self.assertEqual(resolution.qir.threshold_den, 2)
        self.assertEqual(verification.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertTrue(verification.assumptions)
        self.assertIsNotNone(verification.spec_id)
        self.assertEqual(answer.parts[0].status, "stated")

    def test_most_user_threshold_changes_verdict(self) -> None:
        # 16 of 17 bachelor's-degree occupations pay > $60k; 99% fails.
        _, _, verification = self._verify(
            most_bachelors_pay_over_60k(),
            overrides={
                "quantifier:most": {
                    "name": "custom",
                    "threshold_num": 99,
                    "threshold_den": 100,
                }
            },
        )
        self.assertEqual(verification.verdict, "CONTRADICTION")
        self.assertEqual(verification.assumptions[0].source, "user")

    # ------------------------------------------------------------------
    # Metric / utility: "best career for stability"
    # ------------------------------------------------------------------
    def test_stability_needs_specification_without_defaults(self) -> None:
        qir = best_stability()
        _, _, verification = verify_question(
            qir,
            self.dataset,
            premises=self.premises,
            registry=self.registry,
            allow_defaults=False,
        )
        self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
        kinds = {u.kind for u in verification.unresolved}
        self.assertIn("metric", kinds)
        self.assertIn("utility", kinds)

    def test_stability_default_metric_is_entailed_under_assumptions(self) -> None:
        resolution, answer, verification = self._verify(best_stability())
        self.assertTrue(resolution.closed)
        self.assertEqual(resolution.qir.metric.name, "stability")
        self.assertEqual(verification.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertTrue(any(a.key == "metric:stability" for a in verification.assumptions))

    def test_custom_metric_changes_winner(self) -> None:
        default_res, default_answer, default_v = self._verify(best_stability())
        custom_res, custom_answer, custom_v = self._verify(
            best_stability(),
            overrides={
                "metric:stability": {
                    "name": "pay_only",
                    "weights": [["annual", 1.0]],
                }
            },
        )
        self.assertTrue(default_res.closed)
        self.assertTrue(custom_res.closed)
        self.assertNotEqual(
            default_res.qir.metric.weights,
            custom_res.qir.metric.weights,
        )
        # The default stability metric and a pay-only metric select different
        # winners; the receipt records which definition was used.
        self.assertNotEqual(
            default_answer.parts[0].claim.rhs.value,
            custom_answer.parts[0].claim.rhs.value,
        )
        self.assertIn(default_v.verdict, {"ENTAILED_UNDER_ASSUMPTIONS", "UNKNOWN"})
        self.assertIn(custom_v.verdict, {"ENTAILED_UNDER_ASSUMPTIONS", "UNKNOWN"})

    # ------------------------------------------------------------------
    # Direction and units
    # ------------------------------------------------------------------
    def test_direction_needs_specification_without_defaults(self) -> None:
        qir = difference_direction()
        _, _, verification = verify_question(
            qir,
            self.dataset,
            premises=self.premises,
            registry=self.registry,
            allow_defaults=False,
        )
        self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
        self.assertTrue(any(u.kind == "direction" for u in verification.unresolved))

    def test_direction_symmetric_vs_signed(self) -> None:
        sym_res, sym_answer, sym_v = self._verify(difference_direction())
        signed_res, signed_answer, signed_v = self._verify(
            difference_direction(),
            overrides={"direction:difference": "signed"},
        )
        self.assertTrue(sym_res.closed)
        self.assertTrue(signed_res.closed)
        self.assertEqual(sym_v.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertEqual(signed_v.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertEqual(sym_answer.parts[0].claim.lhs.kind, "absdiff")
        self.assertEqual(signed_answer.parts[0].claim.lhs.kind, "diff")
        self.assertNotEqual(
            sym_answer.parts[0].claim.rhs.value,
            signed_answer.parts[0].claim.rhs.value,
        )

    def test_unit_needs_specification_without_defaults(self) -> None:
        qir = pay_unit()
        _, _, verification = verify_question(
            qir,
            self.dataset,
            premises=self.premises,
            registry=self.registry,
            allow_defaults=False,
        )
        self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
        self.assertTrue(any(u.kind == "unit" for u in verification.unresolved))

    def test_unit_annual_vs_hourly(self) -> None:
        annual_res, annual_answer, annual_v = self._verify(pay_unit())
        hourly_res, hourly_answer, hourly_v = self._verify(
            pay_unit(),
            overrides={"unit:pay": "hourly"},
        )
        self.assertTrue(annual_res.closed)
        self.assertTrue(hourly_res.closed)
        self.assertEqual(annual_v.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertEqual(hourly_v.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertIn("annual", str(annual_answer.parts[0].claim))
        self.assertIn("hourly", str(hourly_answer.parts[0].claim))

    # ------------------------------------------------------------------
    # Claims outside the formal theory
    # ------------------------------------------------------------------
    def test_causal_and_normative_need_specification(self) -> None:
        for qir in (causal_question(), normative_question()):
            _, _, verification = verify_question(
                qir,
                self.dataset,
                premises=self.premises,
                registry=self.registry,
            )
            self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
            self.assertTrue(verification.unresolved)

    def test_open_world_absence_never_absent_confirmed(self) -> None:
        qir = open_world_absence()
        _, _, verification = verify_question(
            qir,
            self.dataset,
            premises=self.premises,
            registry=self.registry,
        )
        self.assertEqual(verification.verdict, "NEEDS_SPECIFICATION")
        self.assertNotEqual(verification.verdict, "ABSENT_CONFIRMED")

    # ------------------------------------------------------------------
    # Receipts and determinism
    # ------------------------------------------------------------------
    def test_receipts_are_deterministic(self) -> None:
        _, _, first = self._verify(most_bachelors_pay_over_60k())
        _, _, second = self._verify(most_bachelors_pay_over_60k())
        self.assertEqual(first.verdict, second.verdict)
        self.assertEqual(first.spec_id, second.spec_id)
        self.assertEqual(
            [a.to_dict() for a in first.assumptions],
            [a.to_dict() for a in second.assumptions],
        )

    def test_defaults_are_disclosed(self) -> None:
        _, _, verification = self._verify(most_bachelors_pay_over_60k())
        self.assertTrue(verification.assumptions)
        self.assertEqual(verification.assumptions[0].source, "default")
        self.assertEqual(verification.assumptions[0].key, "quantifier:most")

    def test_spec_digest_changes_with_value(self) -> None:
        default_res, _, _ = self._verify(most_bachelors_pay_over_60k())
        custom_res, _, _ = self._verify(
            most_bachelors_pay_over_60k(),
            overrides={
                "quantifier:most": {
                    "name": "custom",
                    "threshold_num": 9,
                    "threshold_den": 10,
                }
            },
        )
        self.assertNotEqual(default_res.qir.spec.digest(), custom_res.qir.spec.digest())

    def test_verify_question_convenience(self) -> None:
        from formal.z3check import verify_question

        resolution, answer, verification = verify_question(
            most_bachelors_pay_over_60k(),
            self.dataset,
            premises=self.premises,
            registry=self.registry,
        )
        self.assertTrue(resolution.closed)
        self.assertEqual(verification.verdict, "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertEqual(answer.parts[0].status, "stated")

    def test_humanized_most_is_majority(self) -> None:
        resolution, answer, verification = self._verify(most_bachelors_pay_over_60k())
        self.assertTrue(resolution.closed)
        assumption = next(a for a in verification.assumptions if a.key == "quantifier:most")
        self.assertEqual(humanize_assumption(assumption), "most = majority (>50%)")
        self.assertIn("majority (>50%)", human_answer(resolution.qir, answer, verification))

    def test_humanized_custom_threshold_is_readable(self) -> None:
        resolution, _, verification = self._verify(
            most_bachelors_pay_over_60k(),
            overrides={
                "quantifier:most": {
                    "name": "custom",
                    "threshold_num": 99,
                    "threshold_den": 100,
                }
            },
        )
        assumption = next(a for a in verification.assumptions if a.key == "quantifier:most")
        self.assertEqual(humanize_assumption(assumption), "most = at least 99%")

    def test_humanized_metric_is_a_formula(self) -> None:
        resolution, _, verification = self._verify(best_stability())
        assumption = next(a for a in verification.assumptions if a.key == "metric:stability")
        human = humanize_assumption(assumption)
        self.assertIn("stability =", human)
        self.assertIn("projected growth", human)
        self.assertIn("annual openings", human)

    def test_cli_json_includes_human_assumptions_and_citations(self) -> None:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = main(["--json", "This is the best career for someone who wants stability."])
        self.assertEqual(code, 0)
        payload = json.loads(buf.getvalue())
        self.assertEqual(payload["verdict"], "ENTAILED_UNDER_ASSUMPTIONS")
        self.assertTrue(payload["assumptions"])
        self.assertTrue(payload["assumptions"][0]["human"].startswith("stability ="))
        self.assertGreater(len(payload["citations"]), 0)
        self.assertIn("quote", payload["citations"][0])

    def test_unclosed_claim_is_never_entailed(self) -> None:
        qir = most_bachelors_pay_over_60k()
        _, _, verification = verify_question(
            qir,
            self.dataset,
            premises=self.premises,
            registry=self.registry,
            allow_defaults=False,
        )
        self.assertNotEqual(verification.verdict, "ENTAILED")
        self.assertNotEqual(verification.verdict, "ENTAILED_UNDER_ASSUMPTIONS")


if __name__ == "__main__":
    unittest.main()
