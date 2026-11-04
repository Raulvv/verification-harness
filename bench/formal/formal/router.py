"""Deterministic router for verification verdicts.

The router decides what the product should do next. It never upgrades a
verification result; it only maps the verdict to an action.
"""

from __future__ import annotations

from dataclasses import dataclass

from .model import Verification


@dataclass(frozen=True)
class Route:
    action: str  # show | reject | ask_specification | fallback_nli | escalate_human | abstain
    reason: str

    def to_dict(self) -> dict[str, str]:
        return {"action": self.action, "reason": self.reason}


def route_verification(verification: Verification) -> Route:
    verdict = verification.verdict
    if verdict in ("ENTAILED", "ENTAILED_UNDER_ASSUMPTIONS"):
        return Route("show", "the claim follows from the premises")
    if verdict in ("ABSENT_CONFIRMED", "NOT_FOUND_IN_CORPUS"):
        return Route("show", "the absence is confirmed within the declared scope")
    if verdict == "CONTRADICTION":
        return Route("reject", "the claim contradicts the premises")
    if verdict == "NEEDS_SPECIFICATION":
        return Route(
            "ask_specification",
            "the claim is not closed; a definition or scope is required",
        )
    if verdict == "NOT_FORMALIZABLE":
        return Route(
            "fallback_nli",
            "the claim is outside the formal theory; route to NLI or human review",
        )
    if verdict == "INCOMPLETE":
        return Route(
            "escalate_human",
            "the answer is missing a part, overclaims, or does not answer the question",
        )
    if verdict == "UNKNOWN":
        return Route("abstain", "the premises neither entail nor contradict the claim")
    return Route("escalate_human", f"unrecognised verdict: {verdict}")
