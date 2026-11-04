"""CUAD clause-presence adapter.

This is a deterministic, local baseline for the CUAD legal-contract benchmark.
It is not legal advice and it is not a SOTA clause extractor. It tests the
assurance layer on a public legal corpus:

  contract text
    -> per-category TF-IDF clause detector (train split only)
    -> supporting sentence (quote + offsets)
    -> ENTAILED or ABSENT_CONFIRMED with a coverage receipt

The detector is deliberately simple and dependency-free. The point is a
reproducible claim-level benchmark with receipts, not a leaderboard win.

CUAD: https://www.atticusprojectai.org/cuad
Paper: https://arxiv.org/abs/2103.06268
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Iterable

from .model import CoverageReceipt

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE.parent / "legal" / "cuad" / "data"
DEFAULT_OUT = HERE.parent / "legal" / "cuad" / "out" / "cuad-results.json"
DEFAULT_SPAN_OUT = HERE.parent / "legal" / "cuad" / "out" / "cuad-span-results.json"

_CATEGORY_RE = re.compile(r'related to "([^"]+)"')
_WORD_RE = re.compile(r"[a-z0-9]+")
_SENTENCE_RE = re.compile(r"[^.!?\n]+(?:[.!?]+|$)")

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
    "have", "in", "is", "it", "its", "of", "on", "or", "that", "the", "their",
    "this", "to", "was", "were", "will", "with", "shall", "may", "any", "all",
    "such", "other", "than", "hereof", "herein", "hereunder", "pursuant",
    "provided", "including", "without", "within", "upon", "party", "parties",
    "agreement", "contract", "section", "company", "date", "term",
}

# Broad lexical guards. They are not the classifier; they stop a generic legal
# sentence from being accepted for an unrelated clause category.
CATEGORY_PATTERNS: dict[str, tuple[str, ...]] = {
    "Document Name": (r"agreement|contract|exhibit|schedule|addendum",),
    "Parties": (r"by and between|party|parties|corporation|llc|inc\.|ltd\.",),
    "Agreement Date": (r"dated|as of|day of|entered into",),
    "Effective Date": (r"effective|commence|commencement",),
    "Expiration Date": (r"expire|expiration|end of the term|until",),
    "Renewal Term": (r"renew|renewal|extension",),
    "Notice Period To Terminate Renewal": (r"notice.{0,80}renew|renew.{0,80}notice",),
    "Governing Law": (r"governed by|governing law|laws of|jurisdiction",),
    "Most Favored Nation": (r"most favored|mfn|better terms",),
    "Non-Compete": (r"compete|competitive|competition",),
    "Exclusivity": (r"exclusive|exclusively",),
    "No-Solicit Of Customers": (r"solicit.{0,80}customer|interfere.{0,80}customer|business relationship",),
    "Competitive Restriction Exception": (r"exception|carve.?out|notwithstanding",),
    "No-Solicit Of Employees": (r"solicit.{0,80}employee|hire.{0,80}employee|personnel",),
    "Non-Disparagement": (r"disparage|disparagement",),
    "Termination For Convenience": (r"terminate.{0,80}convenience|without cause|for convenience",),
    "Rofr/Rofo/Rofn": (r"right of first|first refusal|first offer|first negotiation",),
    "Change Of Control": (r"change of control|merger|consolidation|sale of.{0,40}assets",),
    "Anti-Assignment": (r"assign|assignment|transfer.{0,40}rights",),
    "Revenue/Profit Sharing": (r"revenue|profit|share",),
    "Price Restrictions": (r"price|pricing|increase.{0,40}price|decrease.{0,40}price",),
    "Minimum Commitment": (r"minimum|commitment|purchase.{0,40}minimum",),
    "Volume Restriction": (r"volume|units|quantity",),
    "Ip Ownership Assignment": (r"intellectual property|ownership|assign.{0,40}ip",),
    "Joint Ip Ownership": (r"joint.{0,40}ownership|jointly.{0,40}own",),
    "License Grant": (r"license|grant.{0,40}right|sublicense",),
    "Non-Transferable License": (r"non-transferable|not transferable|transfer.{0,40}license",),
    "Affiliate License-Licensor": (r"affiliate.{0,80}licens|licens.{0,80}affiliate",),
    "Affiliate License-Licensee": (r"affiliate.{0,80}licens|licens.{0,80}affiliate",),
    "Unlimited/All-You-Can-Eat-License": (r"unlimited|all you can eat|enterprise",),
    "Irrevocable Or Perpetual License": (r"irrevocable|perpetual",),
    "Source Code Escrow": (r"source code|escrow",),
    "Post-Termination Services": (r"termination|expiration|survive|post-termination",),
    "Audit Rights": (r"audit|inspect|records|books",),
    "Uncapped Liability": (r"uncapped|unlimited liability|no limit.{0,40}liability",),
    "Cap On Liability": (r"cap.{0,60}liability|limitation.{0,60}liability|liable.{0,60}amount",),
    "Liquidated Damages": (r"liquidated damages|termination fee|penalty",),
    "Warranty Duration": (r"warrant|warranty|defect",),
    "Insurance": (r"insurance|insured|coverage",),
    "Covenant Not To Sue": (r"not to sue|covenant not to sue|waive.{0,40}claim",),
    "Third Party Beneficiary": (r"third party beneficiary|beneficiary|enforce.{0,40}right",),
}

_CATEGORY_PATTERN_CACHE: dict[str, re.Pattern[str] | None] = {}


def category_pattern(category: str) -> re.Pattern[str] | None:
    if category not in _CATEGORY_PATTERN_CACHE:
        patterns = CATEGORY_PATTERNS.get(category)
        _CATEGORY_PATTERN_CACHE[category] = (
            re.compile("|".join(patterns), re.I) if patterns else None
        )
    return _CATEGORY_PATTERN_CACHE[category]


@dataclass(frozen=True)
class CuadSpan:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class CuadItem:
    contract: str
    category: str
    question: str
    context: str
    gold_spans: tuple[CuadSpan, ...]
    is_impossible: bool
    split: str


@dataclass(frozen=True)
class Sentence:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class Prediction:
    contract: str
    category: str
    present: bool
    quote: str | None
    start: int | None
    end: int | None
    score: float
    verdict: str
    receipt: CoverageReceipt
    gold_present: bool
    gold_spans: tuple[CuadSpan, ...]


@dataclass(frozen=True)
class Counts:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0
    quote_supported: int = 0
    positive_predictions: int = 0

    @property
    def total(self) -> int:
        return self.tp + self.fp + self.fn + self.tn

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.tp + self.fn
        return self.tp / denom if denom else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0

    @property
    def false_accepts(self) -> int:
        return self.fp

    @property
    def false_rejects(self) -> int:
        return self.fn

    @property
    def quote_support(self) -> float:
        return self.quote_supported / self.positive_predictions if self.positive_predictions else 0.0

    def to_dict(self) -> dict[str, float | int]:
        return {
            "tp": self.tp,
            "fp": self.fp,
            "fn": self.fn,
            "tn": self.tn,
            "total": self.total,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "false_accepts": self.false_accepts,
            "false_rejects": self.false_rejects,
            "quote_supported": self.quote_supported,
            "positive_predictions": self.positive_predictions,
            "quote_support": self.quote_support,
        }


def _category(question: str) -> str:
    match = _CATEGORY_RE.search(question)
    if not match:
        raise ValueError(f"cannot parse CUAD category: {question!r}")
    return match.group(1).strip()


def load_cuad(path: Path | str, split: str) -> list[CuadItem]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    items: list[CuadItem] = []
    for contract in payload.get("data", []):
        title = str(contract.get("title", ""))
        for paragraph in contract.get("paragraphs", []):
            context = str(paragraph.get("context", ""))
            for qa in paragraph.get("qas", []):
                spans = tuple(
                    CuadSpan(
                        text=str(answer["text"]),
                        start=int(answer["answer_start"]),
                        end=int(answer["answer_start"]) + len(str(answer["text"])),
                    )
                    for answer in qa.get("answers", [])
                    if answer.get("text")
                )
                items.append(
                    CuadItem(
                        contract=title,
                        category=_category(str(qa["question"])),
                        question=str(qa["question"]),
                        context=context,
                        gold_spans=spans,
                        is_impossible=bool(qa.get("is_impossible", not spans)),
                        split=split,
                    )
                )
    return items


def load_official_split(data_dir: Path | str = DEFAULT_DATA) -> tuple[list[CuadItem], list[CuadItem]]:
    data_dir = Path(data_dir)
    test_path = data_dir / "test.json"
    train_path = data_dir / "CUADv1.json"
    if not test_path.exists() or not train_path.exists():
        raise SystemExit(
            f"missing CUAD data in {data_dir}; run legal/cuad/download_cuad.py"
        )
    test = load_cuad(test_path, "test")
    test_titles = {item.contract for item in test}
    train = [
        item
        for item in load_cuad(train_path, "train")
        if item.contract not in test_titles
    ]
    return train, test


def tokens(text: str) -> list[str]:
    return [
        word
        for word in _WORD_RE.findall(str(text or "").lower())
        if len(word) > 1 and word not in _STOPWORDS
    ]


def sentences(text: str, max_sentences: int = 1) -> list[Sentence]:
    """Sentence windows with offsets into the original contract text."""
    single: list[Sentence] = []
    for match in _SENTENCE_RE.finditer(str(text or "")):
        raw = match.group(0)
        stripped = raw.strip()
        if len(stripped) < 20:
            continue
        start = match.start() + raw.find(stripped)
        single.append(Sentence(stripped, start, start + len(stripped)))
    windows: list[Sentence] = []
    for i in range(len(single)):
        current = single[i]
        if i + max_sentences <= len(single):
            end = single[i + max_sentences - 1].end
            text_window = text[current.start:end].strip()
            windows.append(Sentence(text_window, current.start, current.start + len(text_window)))
        windows.append(current)
    # de-duplicate while preserving order
    seen: set[tuple[int, int]] = set()
    out: list[Sentence] = []
    for sentence in windows:
        key = (sentence.start, sentence.end)
        if key not in seen:
            seen.add(key)
            out.append(sentence)
    return out


Vector = dict[Any, float]


class TfidfSpace:
    """A small stdlib TF-IDF space with cosine scoring."""

    def __init__(self, documents: Iterable[str]):
        tokenized = [tokens(document) for document in documents]
        self.n_docs = len(tokenized)
        df: Counter[str] = Counter()
        for doc in tokenized:
            df.update(set(doc))
        self.idf = {
            term: math.log((1 + self.n_docs) / (1 + count)) + 1.0
            for term, count in df.items()
        }

    def vector(self, text: str) -> Vector:
        counts = Counter(tokens(text))
        raw = {
            term: (1.0 + math.log(count)) * self.idf[term]
            for term, count in counts.items()
            if term in self.idf
        }
        norm = math.sqrt(sum(value * value for value in raw.values()))
        if not norm:
            return {}
        return {term: value / norm for term, value in raw.items()}

    def embed_many(self, texts: Iterable[str]) -> list[Vector]:
        return [self.vector(text) for text in texts]

    def centroid(self, documents: Iterable[str]) -> Vector:
        acc: Counter[str] = Counter()
        for vector in self.embed_many(documents):
            for term, value in vector.items():
                acc[term] += value
        norm = math.sqrt(sum(value * value for value in acc.values()))
        if not norm:
            return {}
        return {term: value / norm for term, value in acc.items()}


class LegalBertSpace:
    """Optional Legal-BERT sentence embeddings, loaded lazily.

    Requires `torch` and `transformers`. Run it from a venv that also has the
    package's normal dependencies (or install z3-solver there).
    """

    def __init__(
        self,
        model_name: str = "nlpaueb/legal-bert-base-uncased",
        batch_size: int = 16,
        max_length: int = 256,
    ):
        self.model_name = model_name
        self.batch_size = batch_size
        self.max_length = max_length
        self._tokenizer: Any = None
        self._model: Any = None
        self._torch: Any = None
        self._device = "cpu"

    def _load(self) -> None:
        if self._model is not None:
            return
        try:
            import torch
            from transformers import AutoModel, AutoTokenizer
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise SystemExit(
                "the legal-bert encoder needs torch and transformers; "
                "install legal/cuad/requirements-legal.txt in a separate venv"
            ) from exc
        self._torch = torch
        requested = os.environ.get("LEGAL_BERT_DEVICE", "auto").lower()
        if requested == "auto":
            self._device = "mps" if torch.backends.mps.is_available() else "cpu"
        else:
            self._device = requested
        self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self._model = AutoModel.from_pretrained(self.model_name).to(self._device)
        self._model.eval()

    def embed_many(self, texts: Iterable[str]) -> list[Vector]:
        items = list(texts)
        if not items:
            return []
        self._load()
        torch = self._torch
        vectors: list[Vector] = []
        for start in range(0, len(items), self.batch_size):
            batch = items[start : start + self.batch_size]
            encoded = self._tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=self.max_length,
                return_tensors="pt",
            ).to(self._device)
            with torch.no_grad():
                hidden = self._model(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1)
            summed = (hidden * mask).sum(dim=1)
            counts = mask.sum(dim=1).clamp(min=1)
            pooled = summed / counts
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
            for row in pooled.cpu().tolist():
                vectors.append({index: value for index, value in enumerate(row)})
        return vectors

    def vector(self, text: str) -> Vector:
        return self.embed_many([text])[0]

    def centroid(self, documents: Iterable[str]) -> Vector:
        vectors = self.embed_many(documents)
        if not vectors:
            return {}
        acc: Counter[int] = Counter()
        for vector in vectors:
            for index, value in vector.items():
                acc[index] += value
        norm = math.sqrt(sum(value * value for value in acc.values()))
        if not norm:
            return {}
        return {index: value / norm for index, value in acc.items()}


def make_space(
    encoder: str,
    documents: Iterable[str],
    encoder_model: str | None = None,
) -> TfidfSpace | LegalBertSpace:
    if encoder == "tfidf":
        return TfidfSpace(documents)
    if encoder == "legal-bert":
        return LegalBertSpace(encoder_model or "nlpaueb/legal-bert-base-uncased")
    raise ValueError(f"unknown encoder {encoder!r}; use tfidf or legal-bert")


@dataclass(frozen=True)
class CategoryModel:
    category: str
    positive: Vector
    negative: Vector
    seed_count: int
    threshold: float = 0.0

    def score(self, vector: Vector) -> float:
        return score_vector(self.positive, vector) - score_vector(self.negative, vector)


@dataclass(frozen=True)
class SentenceVector:
    sentence: Sentence
    vector: Vector


def contract_vectors(
    space: TfidfSpace | LegalBertSpace,
    item: CuadItem,
) -> list[SentenceVector]:
    sentence_list = sentences(item.context)
    vectors = space.embed_many([sentence.text for sentence in sentence_list])
    return [
        SentenceVector(sentence, vector)
        for sentence, vector in zip(sentence_list, vectors)
    ]


def fit_models(
    train: list[CuadItem],
    categories: set[str] | None = None,
    *,
    encoder: str = "tfidf",
    encoder_model: str | None = None,
    negative_per_category: int = 20,
    negative_sentences: int = 5,
) -> tuple[TfidfSpace | LegalBertSpace, dict[str, CategoryModel]]:
    selected = [item for item in train if not categories or item.category in categories]
    positives: dict[str, list[str]] = {}
    negatives: dict[str, list[str]] = {}
    for item in selected:
        if item.is_impossible:
            continue
        positives.setdefault(item.category, []).extend(
            span.text for span in item.gold_spans
        )
    # A small deterministic negative sample per category: contracts where the
    # clause is absent. This is a Rocchio-style contrast, not a trained model.
    by_category: dict[str, list[CuadItem]] = {}
    for item in selected:
        by_category.setdefault(item.category, []).append(item)
    for category, items in by_category.items():
        absent = sorted(
            (item for item in items if item.is_impossible),
            key=lambda item: item.contract,
        )[:negative_per_category]
        docs: list[str] = []
        for item in absent:
            for sentence in sentences(item.context)[:negative_sentences]:
                docs.append(sentence.text)
        negatives[category] = docs

    all_docs = [doc for docs in positives.values() for doc in docs]
    all_docs.extend(doc for docs in negatives.values() for doc in docs)
    space = make_space(encoder, all_docs, encoder_model)
    models: dict[str, CategoryModel] = {}
    for category, spans in sorted(positives.items()):
        models[category] = CategoryModel(
            category=category,
            positive=space.centroid(spans),
            negative=space.centroid(negatives.get(category, [])),
            seed_count=len(spans),
        )
    return space, models


def score_vector(centroid: Vector, vector: Vector) -> float:
    if not vector or not centroid:
        return 0.0
    return sum(value * centroid.get(term, 0.0) for term, value in vector.items())


def predict(
    item: CuadItem,
    model: CategoryModel | None,
    threshold: float,
    vectors: list[SentenceVector],
) -> Prediction:
    best: Sentence | None = None
    best_score = 0.0
    if model is not None:
        guard = category_pattern(item.category)
        for entry in vectors:
            if guard is not None and not guard.search(entry.sentence.text):
                continue
            score = model.score(entry.vector)
            if score > best_score:
                best = entry.sentence
                best_score = score
    effective_threshold = model.threshold if model is not None else threshold
    present = best is not None and best_score >= effective_threshold
    digest = hashlib.sha256(
        f"{item.contract}|{item.category}|{best_score:.6f}|{present}".encode("utf-8")
    ).hexdigest()
    receipt = CoverageReceipt(
        corpus_id=item.contract,
        files_searched=1,
        index_version=digest,
        query=item.category,
        hits=1 if present else 0,
        complete=True,
    )
    return Prediction(
        contract=item.contract,
        category=item.category,
        present=present,
        quote=best.text if present and best else None,
        start=best.start if present and best else None,
        end=best.end if present and best else None,
        score=best_score,
        verdict="ENTAILED" if present else "ABSENT_CONFIRMED",
        receipt=receipt,
        gold_present=not item.is_impossible,
        gold_spans=item.gold_spans,
    )


def _jaccard(left: str, right: str) -> float:
    a = set(tokens(left))
    b = set(tokens(right))
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def quote_supports(quote: str | None, gold_spans: tuple[CuadSpan, ...]) -> bool:
    if not quote:
        return False
    normalized = re.sub(r"\s+", " ", quote).strip().lower()
    for span in gold_spans:
        gold = re.sub(r"\s+", " ", span.text).strip().lower()
        if not gold:
            continue
        if gold in normalized or normalized in gold:
            return True
        if _jaccard(normalized, gold) >= 0.5:
            return True
    return False


def evaluate(predictions: list[Prediction]) -> tuple[Counts, dict[str, Counts]]:
    overall = Counts()
    per_category: dict[str, Counts] = {}
    for pred in predictions:
        counts = per_category.setdefault(pred.category, Counts())
        updates: dict[str, int] = {}
        if pred.present and pred.gold_present:
            updates = {"tp": 1}
            if quote_supports(pred.quote, pred.gold_spans):
                updates["quote_supported"] = 1
        elif pred.present and not pred.gold_present:
            updates = {"fp": 1}
        elif not pred.present and pred.gold_present:
            updates = {"fn": 1}
        else:
            updates = {"tn": 1}
        if pred.present:
            updates["positive_predictions"] = 1
        overall = _add(overall, updates)
        per_category[pred.category] = _add(counts, updates)
    return overall, per_category


def _add(counts: Counts, updates: dict[str, int]) -> Counts:
    data = {
        "tp": counts.tp,
        "fp": counts.fp,
        "fn": counts.fn,
        "tn": counts.tn,
        "quote_supported": counts.quote_supported,
        "positive_predictions": counts.positive_predictions,
    }
    for key, value in updates.items():
        data[key] = data.get(key, 0) + value
    return Counts(**data)


@dataclass(frozen=True)
class SpanPrediction:
    contract: str
    category: str
    gold_spans: tuple[CuadSpan, ...]
    pred: CuadSpan | None
    score: float


@dataclass(frozen=True)
class SpanCounts:
    tp: int = 0
    fp: int = 0
    fn: int = 0

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.tp + self.fn
        return self.tp / denom if denom else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0


def top_span(
    item: CuadItem,
    model: CategoryModel | None,
    vectors: list[SentenceVector],
) -> tuple[CuadSpan | None, float]:
    best: CuadSpan | None = None
    best_score = 0.0
    if model is not None:
        guard = category_pattern(item.category)
        for entry in vectors:
            if guard is not None and not guard.search(entry.sentence.text):
                continue
            score = model.score(entry.vector)
            if score > best_score:
                best = CuadSpan(
                    entry.sentence.text,
                    entry.sentence.start,
                    entry.sentence.end,
                )
                best_score = score
    return best, best_score


def span_predictions(
    test: list[CuadItem],
    models: dict[str, CategoryModel],
    vectors_by_contract: dict[str, list[SentenceVector]],
) -> list[SpanPrediction]:
    out: list[SpanPrediction] = []
    for item in test:
        pred, score = top_span(
            item,
            models.get(item.category),
            vectors_by_contract[item.contract],
        )
        out.append(
            SpanPrediction(
                contract=item.contract,
                category=item.category,
                gold_spans=item.gold_spans,
                pred=pred,
                score=score,
            )
        )
    return out


def span_jaccard(gold: str, pred: str) -> float:
    def normalize(value: str) -> set[str]:
        value = str(value or "").lower()
        for token in (".", ",", ";", ":"):
            value = value.replace(token, "")
        value = value.replace("/", " ")
        return set(value.split())

    left = normalize(gold)
    right = normalize(pred)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def span_matches(category: str, gold: CuadSpan, pred: CuadSpan) -> bool:
    if "Parties" in category:
        return (
            span_jaccard(gold.text, pred.text) >= 0.5
            or gold.text in pred.text
        )
    return span_jaccard(gold.text, pred.text) >= 0.5


def _span_counts_at(predictions: list[SpanPrediction], threshold: float) -> SpanCounts:
    tp = fp = fn = 0
    for row in predictions:
        preds = [row.pred] if row.pred is not None and row.score >= threshold else []
        golds = list(row.gold_spans)
        if not golds:
            fp += len(preds)
            continue
        for gold in golds:
            if any(span_matches(row.category, gold, pred) for pred in preds):
                tp += 1
            else:
                fn += 1
        for pred in preds:
            if not any(span_matches(row.category, gold, pred) for gold in golds):
                fp += 1
    return SpanCounts(tp=tp, fp=fp, fn=fn)


def _process_precisions(precisions: list[float]) -> list[float]:
    best = precisions[::-1]
    for index in range(1, len(best)):
        best[index] = max(best[index - 1], best[index])
    return best[::-1]


def _auc(recalls: list[float], precisions: list[float]) -> float:
    area = 0.0
    for index in range(1, len(recalls)):
        area += (recalls[index] - recalls[index - 1]) * (
            precisions[index] + precisions[index - 1]
        ) / 2.0
    return area


def _precision_at_recall(
    precisions: list[float],
    recalls: list[float],
    target: float,
) -> float:
    for precision, recall in zip(precisions, recalls):
        if recall >= target:
            return precision
    return 0.0


def span_metrics(predictions: list[SpanPrediction]) -> dict[str, Any]:
    by_category: dict[str, list[SpanPrediction]] = {}
    for row in predictions:
        by_category.setdefault(row.category, []).append(row)
    per_category: dict[str, dict[str, float | int]] = {}
    for category, rows in sorted(by_category.items()):
        thresholds = sorted({row.score for row in rows} | {0.0}, reverse=True)
        precisions: list[float] = []
        recalls: list[float] = []
        for threshold in thresholds:
            counts = _span_counts_at(rows, threshold)
            precisions.append(counts.precision)
            recalls.append(counts.recall)
        processed = _process_precisions(precisions)
        per_category[category] = {
            "aupr": _auc(recalls, processed),
            "p_at_80": _precision_at_recall(processed, recalls, 0.80),
            "p_at_90": _precision_at_recall(processed, recalls, 0.90),
            "claims": len(rows),
            "gold_spans": sum(len(row.gold_spans) for row in rows),
        }
    macro = {
        key: (
            sum(float(values[key]) for values in per_category.values())
            / len(per_category)
            if per_category
            else 0.0
        )
        for key in ("aupr", "p_at_80", "p_at_90")
    }
    return {
        "macro": macro,
        "per_category": per_category,
        "claims": len(predictions),
        "categories": len(per_category),
    }


def run_span(
    data_dir: Path | str = DEFAULT_DATA,
    *,
    categories: set[str] | None = None,
    max_contracts: int | None = None,
    encoder: str = "tfidf",
    encoder_model: str | None = None,
) -> dict:
    train, test = load_official_split(data_dir)
    if categories:
        train = [item for item in train if item.category in categories]
        test = [item for item in test if item.category in categories]
    if max_contracts:
        titles = sorted({item.contract for item in test})[:max_contracts]
        keep = set(titles)
        test = [item for item in test if item.contract in keep]
    space, models = fit_models(
        train, categories, encoder=encoder, encoder_model=encoder_model
    )
    vectors_by_contract = {
        title: contract_vectors(
            space, next(item for item in test if item.contract == title)
        )
        for title in sorted({item.contract for item in test})
    }
    predictions = span_predictions(test, models, vectors_by_contract)
    metrics = span_metrics(predictions)
    return {
        "benchmark": "CUAD",
        "mode": "span",
        "version": "aok_v1.0",
        "split": "official test (102 contracts)",
        "train_contracts": len({item.contract for item in train}),
        "test_contracts": len({item.contract for item in test}),
        "encoder": encoder,
        "encoder_model": encoder_model,
        **metrics,
        "notes": [
            "Official CUAD-style span matching: Jaccard >= 0.5.",
            "Predictions are sentence windows, not minimal clause spans; this is a floor.",
            "AUPR and precision-at-recall are macro-averaged across categories.",
            "Not legal advice.",
        ],
    }


def _macro_f1(per_category: dict[str, Counts]) -> float:
    values = [counts.f1 for counts in per_category.values() if counts.total]
    return sum(values) / len(values) if values else 0.0


def _counts_at(observations: list[tuple[float, bool]], threshold: float) -> Counts:
    counts = Counts()
    for score, gold_present in observations:
        predicted = score >= threshold
        if predicted and gold_present:
            counts = _add(counts, {"tp": 1, "positive_predictions": 1})
        elif predicted:
            counts = _add(counts, {"fp": 1, "positive_predictions": 1})
        elif gold_present:
            counts = _add(counts, {"fn": 1})
        else:
            counts = _add(counts, {"tn": 1})
    return counts


def tune_thresholds(
    train: list[CuadItem],
    categories: set[str] | None = None,
    seed: int = 0,
    max_dev_contracts: int = 20,
    min_precision: float = 0.85,
    encoder: str = "tfidf",
    encoder_model: str | None = None,
) -> tuple[dict[str, float], float, int, int]:
    """Tune per-category thresholds on a held-out slice of the training split."""
    titles = sorted({item.contract for item in train})
    if len(titles) < 10:
        return {}, 0.0, len(titles), 0
    rng = random.Random(seed)
    shuffled = titles[:]
    rng.shuffle(shuffled)
    cut = max(1, int(len(shuffled) * 0.2))
    dev_title_order = shuffled[:cut]
    dev_titles = set(dev_title_order)
    fit = [item for item in train if item.contract not in dev_titles]
    dev = [item for item in train if item.contract in dev_titles]
    kept_dev_titles = set(dev_title_order[:max_dev_contracts])
    dev = [item for item in dev if item.contract in kept_dev_titles]
    space, models = fit_models(
        fit, categories, encoder=encoder, encoder_model=encoder_model
    )
    vectors_by_contract = {
        item.contract: contract_vectors(space, item)
        for item in dev
    }
    observations: dict[str, list[tuple[float, bool]]] = {}
    for item in dev:
        model = models.get(item.category)
        score = 0.0
        if model is not None:
            score = max(
                (model.score(entry.vector) for entry in vectors_by_contract[item.contract]),
                default=0.0,
            )
        observations.setdefault(item.category, []).append(
            (score, not item.is_impossible)
        )
    candidates = [-0.20 + 0.02 * i for i in range(36)]
    all_observations = [row for rows in observations.values() for row in rows]
    global_threshold, global_f1 = 0.0, -1.0
    best_recall, best_precision = -1.0, -1.0
    for threshold in candidates:
        counts = _counts_at(all_observations, threshold)
        if counts.precision >= min_precision and counts.recall > best_recall:
            global_threshold, best_recall, best_precision = (
                threshold,
                counts.recall,
                counts.precision,
            )
        elif best_recall < 0 and counts.precision > best_precision:
            global_threshold, best_precision = threshold, counts.precision
    global_counts = _counts_at(all_observations, global_threshold)
    global_f1 = global_counts.f1
    thresholds: dict[str, float] = {}
    for category, rows in observations.items():
        positives = sum(1 for _, gold in rows if gold)
        if positives < 5:
            thresholds[category] = global_threshold
            continue
        best_threshold = global_threshold
        best_recall, best_precision = -1.0, -1.0
        for threshold in candidates:
            counts = _counts_at(rows, threshold)
            if counts.precision >= min_precision and counts.recall > best_recall:
                best_threshold, best_recall, best_precision = (
                    threshold,
                    counts.recall,
                    counts.precision,
                )
            elif best_recall < 0 and counts.precision > best_precision:
                best_threshold, best_precision = threshold, counts.precision
        thresholds[category] = best_threshold
    return thresholds, global_f1, len(fit), len(dev)


def run(
    data_dir: Path | str = DEFAULT_DATA,
    *,
    threshold: float | None = None,
    categories: set[str] | None = None,
    max_contracts: int | None = None,
    seed: int = 0,
    min_precision: float = 0.85,
    encoder: str = "tfidf",
    encoder_model: str | None = None,
) -> dict:
    train, test = load_official_split(data_dir)
    if categories:
        train = [item for item in train if item.category in categories]
        test = [item for item in test if item.category in categories]
    if max_contracts:
        titles = sorted({item.contract for item in test})[:max_contracts]
        keep = set(titles)
        test = [item for item in test if item.contract in keep]
    tuned = threshold is None
    thresholds: dict[str, float] = {}
    if tuned:
        thresholds, dev_f1, fit_n, dev_n = tune_thresholds(
            train,
            categories,
            seed,
            min_precision=min_precision,
            encoder=encoder,
            encoder_model=encoder_model,
        )
    else:
        dev_f1, fit_n, dev_n = 0.0, 0, 0
    space, models = fit_models(
        train, categories, encoder=encoder, encoder_model=encoder_model
    )
    if tuned:
        models = {
            category: replace(model, threshold=thresholds.get(category, 0.0))
            for category, model in models.items()
        }
    else:
        models = {
            category: replace(model, threshold=threshold)
            for category, model in models.items()
        }
    vectors_by_contract = {
        title: contract_vectors(space, next(item for item in test if item.contract == title))
        for title in sorted({item.contract for item in test})
    }
    predictions = [
        predict(
            item,
            models.get(item.category),
            threshold if threshold is not None else 0.0,
            vectors_by_contract[item.contract],
        )
        for item in test
    ]
    overall, per_category = evaluate(predictions)
    return {
        "benchmark": "CUAD",
        "version": "aok_v1.0",
        "split": "official test (102 contracts)",
        "train_contracts": len({item.contract for item in train}),
        "test_contracts": len({item.contract for item in test}),
        "claims": len(predictions),
        "categories": len(per_category),
        "threshold": threshold,
        "threshold_source": "per-category tuned" if tuned else "manual",
        "min_precision": min_precision,
        "encoder": encoder,
        "encoder_model": encoder_model,
        "thresholds": thresholds,
        "dev_macro_f1": dev_f1,
        "dev_contracts": dev_n,
        "fit_contracts": fit_n,
        "overall": overall.to_dict(),
        "per_category": {
            category: counts.to_dict()
            for category, counts in sorted(per_category.items())
        },
        "notes": [
            "Deterministic TF-IDF clause-presence baseline; not legal advice.",
            "Absence is closed-world over the supplied contract text.",
            "Quote support uses exact containment or token Jaccard >= 0.5.",
            "The detector is trained on CUAD train contracts only; test contracts are held out.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the CUAD adapter")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--mode", choices=("presence", "span"), default="presence")
    parser.add_argument("--encoder", choices=("tfidf", "legal-bert"), default="tfidf")
    parser.add_argument("--encoder-model")
    parser.add_argument("--threshold", type=float)
    parser.add_argument("--categories", help="comma-separated category names")
    parser.add_argument("--max-contracts", type=int)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--min-precision", type=float, default=0.85)
    args = parser.parse_args(argv)

    categories = (
        {value.strip() for value in args.categories.split(",") if value.strip()}
        if args.categories
        else None
    )
    out = args.out or (DEFAULT_SPAN_OUT if args.mode == "span" else DEFAULT_OUT)
    if args.mode == "span":
        result = run_span(
            args.data,
            categories=categories,
            max_contracts=args.max_contracts,
            encoder=args.encoder,
            encoder_model=args.encoder_model,
        )
    else:
        result = run(
            args.data,
            threshold=args.threshold,
            categories=categories,
            max_contracts=args.max_contracts,
            seed=args.seed,
            min_precision=args.min_precision,
            encoder=args.encoder,
            encoder_model=args.encoder_model,
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if args.mode == "span":
        macro = result["macro"]
        print(
            f"CUAD span: {result['claims']} claims, {result['test_contracts']} test contracts, "
            f"encoder={result['encoder']}"
        )
        print(
            f"macro AUPR={macro['aupr']:.3f} P@80={macro['p_at_80']:.3f} "
            f"P@90={macro['p_at_90']:.3f}"
        )
    else:
        overall = result["overall"]
        threshold = result["threshold"]
        threshold_text = f"{threshold:.2f}" if threshold is not None else "per-category"
        print(
            f"CUAD: {result['claims']} claims, {result['test_contracts']} test contracts, "
            f"threshold={threshold_text}, encoder={result['encoder']}"
        )
        print(
            f"presence: precision={overall['precision']:.3f} recall={overall['recall']:.3f} "
            f"f1={overall['f1']:.3f} false_accepts={overall['false_accepts']} "
            f"false_rejects={overall['false_rejects']} quote_support={overall['quote_support']:.3f}"
        )
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
