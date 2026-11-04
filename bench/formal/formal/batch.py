"""Batch verification: JSONL in, JSONL out.

This is the non-CLI boundary for the reader-first verifier. One bad item does
not abort the batch; it returns an explicit error result and routes to a human.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .extract import verify_reader_answer
from .model import Verification
from .router import route_verification
from .rows import Dataset, build_dataset
from .spec import SpecRegistry
from .z3check import Premises


@dataclass(frozen=True)
class BatchItem:
    id: str
    question: str
    answer: str


@dataclass(frozen=True)
class BatchResult:
    id: str
    question: str
    verdict: str
    route: str
    route_reason: str
    notes: tuple[str, ...] = ()
    claims: tuple[str, ...] = ()
    assumptions: tuple[dict[str, Any], ...] = ()
    spec_id: str | None = None
    citations: tuple[dict[str, Any], ...] = ()
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "question": self.question,
            "verdict": self.verdict,
            "route": {"action": self.route, "reason": self.route_reason},
            "notes": list(self.notes),
            "claims": list(self.claims),
            "assumptions": list(self.assumptions),
            "spec_id": self.spec_id,
            "citations": list(self.citations),
            "error": self.error,
        }


def load_batch(path: Path | str) -> list[BatchItem]:
    items: list[BatchItem] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        items.append(
            BatchItem(
                id=str(row["id"]),
                question=str(row["question"]),
                answer=str(row.get("answer", "")),
            )
        )
    return items


def _claims(verification: Verification) -> tuple[str, ...]:
    out: list[str] = []
    for check in verification.checks:
        if check.claim is not None:
            out.append(str(check.claim))
    return tuple(out)


def _citations(extraction) -> tuple[dict[str, Any], ...]:
    if extraction.answer is None:
        return ()
    out: list[dict[str, Any]] = []
    for part in extraction.answer.parts:
        for citation in part.citations:
            item = citation.to_dict()
            if item not in out:
                out.append(item)
    return tuple(out)


def verify_one(
    item: BatchItem,
    dataset: Dataset,
    premises: Premises,
    registry: SpecRegistry | None = None,
) -> BatchResult:
    try:
        extraction, verification = verify_reader_answer(
            item.question,
            item.answer,
            dataset,
            premises,
            registry=registry,
        )
        route = route_verification(verification)
        return BatchResult(
            id=item.id,
            question=item.question,
            verdict=verification.verdict,
            route=route.action,
            route_reason=route.reason,
            notes=extraction.notes,
            claims=_claims(verification),
            assumptions=tuple(a.to_dict() for a in verification.assumptions),
            spec_id=verification.spec_id,
            citations=_citations(extraction),
        )
    except Exception as exc:  # one bad item must not kill the batch
        return BatchResult(
            id=item.id,
            question=item.question,
            verdict="ERROR",
            route="escalate_human",
            route_reason="verification failed",
            error=str(exc),
        )


def verify_batch(
    items: list[BatchItem],
    dataset: Dataset | None = None,
    premises: Premises | None = None,
    registry: SpecRegistry | None = None,
) -> list[BatchResult]:
    dataset = dataset or build_dataset()
    premises = premises or Premises(dataset)
    return [verify_one(item, dataset, premises, registry) for item in items]


def write_batch(path: Path | str, results: list[BatchResult]) -> None:
    with Path(path).open("w", encoding="utf-8") as fh:
        for result in results:
            fh.write(json.dumps(result.to_dict(), sort_keys=True) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Batch reader-first verification")
    parser.add_argument("--input", type=Path, help="JSONL input (default: stdin)")
    parser.add_argument("--output", type=Path, help="JSONL output (default: stdout)")
    parser.add_argument("--json", action="store_true", help="emit a JSON array, not JSONL")
    args = parser.parse_args(argv)

    if args.input:
        items = load_batch(args.input)
    else:
        items = [
            BatchItem(
                id=str(row.get("id", i)),
                question=str(row["question"]),
                answer=str(row.get("answer", "")),
            )
            for i, row in enumerate(
                json.loads(line)
                for line in sys.stdin.read().splitlines()
                if line.strip()
            )
        ]
    results = verify_batch(items)
    if args.json:
        text = json.dumps([r.to_dict() for r in results], indent=2, sort_keys=True) + "\n"
    else:
        text = "".join(json.dumps(r.to_dict(), sort_keys=True) + "\n" for r in results)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
