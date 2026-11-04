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
from .extract import ExtractedClaim, ExtractionResult, RuleBasedExtractor, verify_reader_answer
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
    "CoverageReceipt",
    "ExtractedClaim",
    "ExtractionResult",
    "Filter",
    "Metric",
    "QIR",
    "QuantifierPolicy",
    "RuleBasedExtractor",
    "Scope",
    "Spec",
    "SpecEntry",
    "SpecRegistry",
    "SpecResolution",
    "Term",
    "Unresolved",
    "UtilityPolicy",
    "Verification",
    "VERDICTS",
    "check_answer",
    "close_qir",
    "verify_question",
    "verify_reader_answer",
]
