"""NLI fallback adapter.

The router says `fallback_nli` for claims outside the formal theory. This module
executes that fallback through any command that reads JSON on stdin and writes
JSON on stdout. It does not bundle a model; HHEM, MiniCheck, LettuceDetect, or a
hosted judge can be plugged in.

Protocol:
  stdin  {"question": "...", "answer": "...", "evidence": "..."}
  stdout {"label": "supported"|"contradicted"|"unknown", "score": 0.0,
          "model": "...", "rationale": "..."}
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from typing import Any, Protocol

from .model import Verification
from .router import Route, route_verification


@dataclass(frozen=True)
class NLIResult:
    verdict: str  # supported | contradicted | unknown
    score: float | None = None
    model: str | None = None
    rationale: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "score": self.score,
            "model": self.model,
            "rationale": self.rationale,
            "raw": self.raw,
        }


class NLIVerifier(Protocol):
    def check(self, question: str, answer: str, evidence: str) -> NLIResult: ...


def _normalise_label(value: Any) -> str:
    label = str(value or "").strip().lower()
    if label in ("supported", "entailed", "yes", "true", "1", "sufficient"):
        return "supported"
    if label in ("contradicted", "not_supported", "no", "false", "0", "insufficient"):
        return "contradicted"
    return "unknown"


@dataclass(frozen=True)
class StubNLI:
    result: NLIResult

    def check(self, question: str, answer: str, evidence: str) -> NLIResult:
        return self.result


@dataclass(frozen=True)
class CommandNLI:
    cmd: str
    cwd: str | None = None

    def check(self, question: str, answer: str, evidence: str) -> NLIResult:
        payload = json.dumps(
            {"question": question, "answer": answer, "evidence": evidence}
        )
        result = subprocess.run(
            ["sh", "-c", self.cmd],
            input=payload,
            text=True,
            capture_output=True,
            cwd=self.cwd,
        )
        if result.returncode != 0:
            return NLIResult(
                verdict="unknown",
                model=self.cmd,
                rationale=f"nli command exited {result.returncode}: {result.stderr.strip()}",
            )
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return NLIResult(
                verdict="unknown",
                model=self.cmd,
                rationale="nli command did not emit JSON",
            )
        return NLIResult(
            verdict=_normalise_label(data.get("label", data.get("verdict"))),
            score=float(data["score"]) if data.get("score") is not None else None,
            model=data.get("model") or self.cmd,
            rationale=data.get("rationale"),
            raw=data,
        )


@dataclass(frozen=True)
class FallbackDecision:
    route: Route
    nli: NLIResult | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "route": self.route.to_dict(),
            "nli": self.nli.to_dict() if self.nli else None,
        }


def route_with_fallback(
    verification: Verification,
    question: str,
    answer: str,
    evidence: str,
    nli: NLIVerifier | None = None,
) -> FallbackDecision:
    route = route_verification(verification)
    if route.action != "fallback_nli" or nli is None:
        return FallbackDecision(route=route)
    return FallbackDecision(route=route, nli=nli.check(question, answer, evidence))
