"""CUAD fine-tuned span extractor.

Runs a CUAD-trained extractive QA checkpoint on the official 102-contract test
split, writes n-best span predictions, and computes the official CUAD-style
metrics: Jaccard >= 0.5, AUPR, P@80, P@90.

This is the reader layer. The verifier layer is separate: it checks the quote
and the closed-corpus absence receipt.

    .venv-detectors/bin/python -m formal.cuad_qa \
      --model akdeniz27/roberta-base-cuad

The model card and CUAD data have their own licenses. This is not legal advice.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .cuad import (
    DEFAULT_DATA,
    CuadItem,
    CuadSpan,
    load_cuad,
    span_matches,
)

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent / "legal" / "cuad" / "out" / "cuad-qa-nbest.jsonl"
DEFAULT_METRICS = HERE.parent / "legal" / "cuad" / "out" / "cuad-qa-metrics.json"


@dataclass(frozen=True)
class QASpan:
    text: str
    start: int
    end: int
    score: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "start": self.start,
            "end": self.end,
            "score": self.score,
        }


@dataclass(frozen=True)
class QAResult:
    id: str
    contract: str
    category: str
    question: str
    context: str
    gold_spans: tuple[CuadSpan, ...]
    is_impossible: bool
    preds: tuple[QASpan, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "contract": self.contract,
            "category": self.category,
            "question": self.question,
            "gold_spans": [
                {"text": span.text, "start": span.start, "end": span.end}
                for span in self.gold_spans
            ],
            "is_impossible": self.is_impossible,
            "preds": [pred.to_dict() for pred in self.preds],
        }


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


def _device(torch: Any, requested: str = "auto") -> str:
    requested = (requested or os.environ.get("CUAD_QA_DEVICE", "auto")).lower()
    if requested != "auto":
        return requested
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _load_model(model_name: str, device: str):
    try:
        import torch
        from transformers import AutoModelForQuestionAnswering, AutoTokenizer
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise SystemExit(
            "the CUAD QA model needs torch and transformers; "
            "run it from .venv-detectors or a dedicated legal venv"
        ) from exc
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForQuestionAnswering.from_pretrained(model_name)
    model.to(device)
    model.eval()
    return torch, tokenizer, model


def _top_positions(logits: Any, positions: list[int], k: int) -> list[int]:
    ordered = sorted(positions, key=lambda index: float(logits[index]), reverse=True)
    return ordered[:k]


def predict_item(
    item: CuadItem,
    tokenizer: Any,
    model: Any,
    torch: Any,
    device: str,
    *,
    max_length: int = 512,
    stride: int = 128,
    top_k: int = 20,
    max_answer_length: int = 512,
) -> tuple[QASpan, ...]:
    encoded = tokenizer(
        item.question,
        item.context,
        truncation="only_second",
        stride=stride,
        max_length=max_length,
        return_overflowing_tokens=True,
        return_offsets_mapping=True,
        padding=True,
        return_tensors="pt",
    )
    offsets = encoded["offset_mapping"].cpu()
    input_ids = encoded["input_ids"].to(device)
    attention_mask = encoded["attention_mask"].to(device)
    model_inputs: dict[str, Any] = {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
    }
    if "token_type_ids" in encoded:
        model_inputs["token_type_ids"] = encoded["token_type_ids"].to(device)
    with torch.no_grad():
        outputs = model(**model_inputs)
    start_logits = outputs.start_logits.cpu()
    end_logits = outputs.end_logits.cpu()

    candidates: list[tuple[float, int, int, str]] = []
    null_scores: list[float] = []
    for window in range(start_logits.shape[0]):
        sequence_ids = encoded.sequence_ids(window)
        context_positions = [
            index for index, sequence_id in enumerate(sequence_ids) if sequence_id == 1
        ]
        if not context_positions:
            continue
        null_scores.append(
            float(start_logits[window, 0] + end_logits[window, 0])
        )
        starts = _top_positions(start_logits[window], context_positions, top_k)
        ends = _top_positions(end_logits[window], context_positions, top_k)
        for start in starts:
            for end in ends:
                if end < start:
                    continue
                if end - start + 1 > max_answer_length:
                    continue
                char_start = int(offsets[window, start, 0])
                char_end = int(offsets[window, end, 1])
                if char_end <= char_start:
                    continue
                text = item.context[char_start:char_end].strip()
                if not text:
                    continue
                score = float(start_logits[window, start] + end_logits[window, end])
                candidates.append((score, char_start, char_end, text))

    if not candidates:
        return ()
    min_null = min(null_scores) if null_scores else 0.0
    best: dict[str, tuple[float, int, int, str]] = {}
    for score, start, end, text in candidates:
        normalized = score - min_null
        if text not in best or normalized > best[text][0]:
            best[text] = (normalized, start, end, text)
    ordered = sorted(best.values(), key=lambda row: row[0], reverse=True)[:top_k]
    return tuple(
        QASpan(text=text, start=start, end=end, score=score)
        for score, start, end, text in ordered
    )


def _counts_at(results: list[QAResult], threshold: float) -> SpanCounts:
    tp = fp = fn = 0
    for result in results:
        preds = [pred for pred in result.preds if pred.score >= threshold]
        golds = list(result.gold_spans)
        if not golds:
            fp += len(preds)
            continue
        for gold in golds:
            if any(
                span_matches(result.category, gold, CuadSpan(pred.text, pred.start, pred.end))
                for pred in preds
            ):
                tp += 1
            else:
                fn += 1
        for pred in preds:
            pred_span = CuadSpan(pred.text, pred.start, pred.end)
            if not any(
                span_matches(result.category, gold, pred_span) for gold in golds
            ):
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
    precisions: list[float], recalls: list[float], target: float
) -> float:
    for precision, recall in zip(precisions, recalls):
        if recall >= target:
            return precision
    return 0.0


def _presence_counts(results: list[QAResult], threshold: float) -> dict[str, float | int]:
    tp = fp = fn = tn = 0
    for result in results:
        present = any(pred.score >= threshold for pred in result.preds)
        gold_present = bool(result.gold_spans)
        if present and gold_present:
            tp += 1
        elif present:
            fp += 1
        elif gold_present:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "threshold": threshold,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "coverage": (tp + fp) / len(results) if results else 0.0,
        "false_accept_rate": fp / (fp + tn) if fp + tn else 0.0,
    }


def presence_metrics(results: list[QAResult]) -> dict[str, Any]:
    thresholds = sorted(
        {pred.score for row in results for pred in row.preds} | {0.0},
        reverse=True,
    )
    rows = [_presence_counts(results, threshold) for threshold in thresholds]
    best_f1 = max(rows, key=lambda row: (row["f1"], row["recall"]))
    precision_first = [
        row for row in rows if row["precision"] >= 0.90
    ]
    best_precision = (
        max(precision_first, key=lambda row: (row["recall"], row["f1"]))
        if precision_first
        else best_f1
    )
    at_zero = _presence_counts(results, 0.0)
    return {
        "at_zero": at_zero,
        "best_f1": best_f1,
        "precision_first": best_precision,
    }


def metrics(results: list[QAResult]) -> dict[str, Any]:
    by_category: dict[str, list[QAResult]] = {}
    for result in results:
        by_category.setdefault(result.category, []).append(result)
    per_category: dict[str, dict[str, float | int]] = {}
    for category, rows in sorted(by_category.items()):
        thresholds = sorted(
            {pred.score for row in rows for pred in row.preds} | {0.0},
            reverse=True,
        )
        precisions: list[float] = [1.0]
        recalls: list[float] = [0.0]
        for threshold in thresholds:
            counts = _counts_at(rows, threshold)
            precisions.append(counts.precision)
            recalls.append(counts.recall)
        processed = _process_precisions(precisions)
        per_category[category] = {
            "aupr": _auc(recalls, processed),
            "p_at_80": _precision_at_recall(processed, recalls, 0.80),
            "p_at_90": _precision_at_recall(processed, recalls, 0.90),
            "questions": len(rows),
            "gold_spans": sum(len(row.gold_spans) for row in rows),
            "positive_questions": sum(1 for row in rows if row.gold_spans),
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
        "questions": len(results),
        "categories": len(per_category),
        "presence": presence_metrics(results),
    }


def run(
    data_dir: Path | str = DEFAULT_DATA,
    *,
    model_name: str = "akdeniz27/roberta-base-cuad",
    device: str = "auto",
    max_contracts: int | None = None,
    max_questions: int | None = None,
    contracts_file: Path | str | None = None,
    max_length: int = 512,
    stride: int = 128,
    top_k: int = 20,
) -> tuple[list[QAResult], dict[str, Any], str]:
    test = load_cuad(Path(data_dir) / "test.json", "test")
    if contracts_file:
        keep = {
            line.strip()
            for line in Path(contracts_file).read_text(encoding="utf-8").splitlines()
            if line.strip()
        }
        test = [item for item in test if item.contract in keep]
    if max_contracts:
        keep = set(sorted({item.contract for item in test})[:max_contracts])
        test = [item for item in test if item.contract in keep]
    if max_questions:
        test = test[:max_questions]
    torch, tokenizer, model = _load_model(model_name, _device(_load_torch(), device))
    results: list[QAResult] = []
    started = time.perf_counter()
    for index, item in enumerate(test, 1):
        preds = predict_item(
            item,
            tokenizer,
            model,
            torch,
            _device(torch, device),
            max_length=max_length,
            stride=stride,
            top_k=top_k,
        )
        results.append(
            QAResult(
                id=f"{item.contract}__{item.category}",
                contract=item.contract,
                category=item.category,
                question=item.question,
                context=item.context,
                gold_spans=item.gold_spans,
                is_impossible=item.is_impossible,
                preds=preds,
            )
        )
        if index % 50 == 0:
            elapsed = time.perf_counter() - started
            print(f"[{index}/{len(test)}] {elapsed:.1f}s", flush=True)
    return results, metrics(results), _device(torch, device)


def load_results(
    path: Path | str,
    contracts: set[str] | None = None,
) -> list[QAResult]:
    results: list[QAResult] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if contracts and str(row.get("contract", "")) not in contracts:
            continue
        results.append(
            QAResult(
                id=str(row["id"]),
                contract=str(row.get("contract", "")),
                category=str(row["category"]),
                question=str(row.get("question", "")),
                context=str(row.get("context", "")),
                gold_spans=tuple(
                    CuadSpan(
                        text=str(span["text"]),
                        start=int(span.get("start", 0)),
                        end=int(span.get("end", 0)),
                    )
                    for span in row.get("gold_spans", [])
                ),
                is_impossible=bool(row.get("is_impossible", not row.get("gold_spans"))),
                preds=tuple(
                    QASpan(
                        text=str(pred["text"]),
                        start=int(pred.get("start", 0)),
                        end=int(pred.get("end", 0)),
                        score=float(pred.get("score", 0.0)),
                    )
                    for pred in row.get("preds", [])
                ),
            )
        )
    return results


def _load_torch() -> Any:
    try:
        import torch
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "the CUAD QA model needs torch; run it from .venv-detectors "
            "or a dedicated legal venv"
        ) from exc
    return torch


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a CUAD fine-tuned span model")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--model", default="akdeniz27/roberta-base-cuad")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--metrics-out", type=Path, default=DEFAULT_METRICS)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--max-contracts", type=int)
    parser.add_argument("--max-questions", type=int)
    parser.add_argument("--contracts-file", type=Path)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--stride", type=int, default=128)
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--from-jsonl", type=Path, help="recompute metrics only")
    args = parser.parse_args(argv)

    contracts = None
    if args.contracts_file:
        contracts = {
            line.strip()
            for line in args.contracts_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        }
    if args.from_jsonl:
        results = load_results(args.from_jsonl, contracts=contracts)
        metrics_data = metrics(results)
        device = "recomputed"
    else:
        results, metrics_data, device = run(
            args.data,
            model_name=args.model,
            device=args.device,
            max_contracts=args.max_contracts,
            max_questions=args.max_questions,
            contracts_file=args.contracts_file,
            max_length=args.max_length,
            stride=args.stride,
            top_k=args.top_k,
        )
    if not args.from_jsonl:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            "".join(json.dumps(result.to_dict()) + "\n" for result in results),
            encoding="utf-8",
        )
    metrics_data.update(
        {
            "benchmark": "CUAD",
            "mode": "span-qa",
            "version": "aok_v1.0",
            "model": args.model,
            "device": device,
            "max_length": args.max_length,
            "stride": args.stride,
            "top_k": args.top_k,
            "split": "official test (102 contracts)",
            "notes": [
                "CUAD fine-tuned extractive QA checkpoint.",
                "Official-style Jaccard >= 0.5 matching.",
                "AUPR / P@80 / P@90 are macro-averaged across categories.",
                "The verifier layer is separate; this is reader capability.",
                "Not legal advice.",
            ],
        }
    )
    args.metrics_out.parent.mkdir(parents=True, exist_ok=True)
    args.metrics_out.write_text(
        json.dumps(metrics_data, indent=2) + "\n", encoding="utf-8"
    )
    macro = metrics_data["macro"]
    print(
        f"CUAD QA: {metrics_data['questions']} questions, {metrics_data['categories']} categories, "
        f"model={args.model}, device={device}"
    )
    print(
        f"macro AUPR={macro['aupr']:.3f} P@80={macro['p_at_80']:.3f} "
        f"P@90={macro['p_at_90']:.3f}"
    )
    print(f"wrote {args.out}")
    print(f"wrote {args.metrics_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
