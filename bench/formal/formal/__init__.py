"""Deterministic formal verification spike for the OOH benchmark.

Python-only. No model calls, no Node, no default-reader/judge changes.
"""

from .model import (
    AnswerIR,
    AnswerPart,
    Assumption,
    CandidateSet,
    Citation,
    Claim,
    ClaimCheck,
    CoverageReceipt,
    Filter,
    Metric,
    QIR,
    Scope,
    Spec,
    SpecEntry,
    Term,
    Unresolved,
    Verification,
    VERDICTS,
)
from .coverage import CorpusIndex, absence_from_receipt, verify_corpus_absence
from .extract import ExtractedClaim, ExtractionResult, RuleBasedExtractor, verify_reader_answer
from .nli import CommandNLI, FallbackDecision, NLIResult, StubNLI, route_with_fallback
from .router import Route, route_verification
from .spec import QuantifierPolicy, SpecRegistry, SpecResolution, UtilityPolicy, close_qir
from .z3check import check_answer, verify_question

__all__ = [
    "AnswerIR",
    "AnswerPart",
    "Assumption",
    "CandidateSet",
    "Citation",
    "Claim",
    "ClaimCheck",
    "CorpusIndex",
    "CommandNLI",
    "CoverageReceipt",
    "ExtractedClaim",
    "ExtractionResult",
    "Filter",
    "FallbackDecision",
    "Metric",
    "NLIResult",
    "QIR",
    "QuantifierPolicy",
    "Route",
    "RuleBasedExtractor",
    "Scope",
    "Spec",
    "SpecEntry",
    "SpecRegistry",
    "SpecResolution",
    "StubNLI",
    "Term",
    "Unresolved",
    "UtilityPolicy",
    "Verification",
    "VERDICTS",
    "absence_from_receipt",
    "check_answer",
    "close_qir",
    "route_verification",
    "route_with_fallback",
    "verify_corpus_absence",
    "verify_question",
    "verify_reader_answer",
]
