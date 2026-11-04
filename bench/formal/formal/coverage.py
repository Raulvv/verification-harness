"""Closed-corpus absence with a coverage receipt.

This is the only honest way to say “not found”: declare the corpus, search all
of it, and return a receipt. It never means “does not exist.”
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from .model import CoverageReceipt, Verification


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


@dataclass(frozen=True)
class CorpusIndex:
    corpus_id: str
    root: Path
    files: tuple[Path, ...]
    index_version: str
    exclusions: tuple[str, ...] = ()

    @classmethod
    def from_directory(
        cls,
        root: Path | str,
        corpus_id: str | None = None,
        *,
        pattern: str = "*.md",
        exclude: tuple[str, ...] = ("SOURCE.md",),
    ) -> "CorpusIndex":
        root = Path(root).resolve()
        all_files = sorted(p for p in root.rglob(pattern) if p.is_file())
        excluded = tuple(p.name for p in all_files if p.name in exclude)
        files = tuple(p for p in all_files if p.name not in exclude)
        digest = hashlib.sha256()
        for p in files:
            digest.update(str(p.relative_to(root)).encode("utf-8"))
            digest.update(str(p.stat().st_size).encode("ascii"))
        return cls(
            corpus_id=corpus_id or root.name,
            root=root,
            files=files,
            index_version=digest.hexdigest(),
            exclusions=excluded,
        )

    def search(self, query: str) -> CoverageReceipt:
        needle = _norm(query)
        hits = 0
        for path in self.files:
            try:
                if needle and needle in _norm(path.read_text(encoding="utf-8")):
                    hits += 1
            except (OSError, UnicodeDecodeError):
                continue
        digest = hashlib.sha256(
            f"{self.index_version}|{needle}|{hits}".encode("utf-8")
        ).hexdigest()
        return CoverageReceipt(
            corpus_id=self.corpus_id,
            files_searched=len(self.files),
            index_version=self.index_version,
            query=query,
            hits=hits,
            exclusions=self.exclusions,
            digest=digest,
            complete=True,
        )


def absence_from_receipt(receipt: CoverageReceipt) -> str:
    """Map a receipt to a verdict; never claims open-world absence."""
    if not receipt.complete:
        return "UNKNOWN"
    if receipt.hits == 0:
        return "NOT_FOUND_IN_CORPUS"
    return "CONTRADICTION"


def verify_corpus_absence(index: CorpusIndex, query: str) -> Verification:
    receipt = index.search(query)
    verdict = absence_from_receipt(receipt)
    if verdict == "NOT_FOUND_IN_CORPUS":
        reason = f"not found in {receipt.corpus_id} ({receipt.files_searched} files searched)"
    elif verdict == "CONTRADICTION":
        reason = f"found in {receipt.hits} file(s) in {receipt.corpus_id}"
    else:
        reason = "coverage receipt is incomplete"
    return Verification(
        verdict=verdict,
        reason=reason,
        coverage_receipts=(receipt,),
    )
