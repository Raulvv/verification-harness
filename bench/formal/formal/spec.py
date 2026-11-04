"""Specification layer: close typed holes, record assumptions, never guess.

A QIR is *closed* when every quantifier, metric, utility, scope, unit,
direction and model slot is filled.  ``close_qir`` either returns a closed QIR
with a ``Spec`` receipt, or reports the remaining ``Unresolved`` slots.  The
formal verifier refuses to check an unclosed QIR.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from .model import (
    Assumption,
    Metric,
    QIR,
    Scope,
    Spec,
    SpecEntry,
    Unresolved,
)


@dataclass(frozen=True)
class QuantifierPolicy:
    name: str
    threshold_num: int
    threshold_den: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "threshold_num": self.threshold_num,
            "threshold_den": self.threshold_den,
        }


@dataclass(frozen=True)
class UtilityPolicy:
    name: str  # max | min
    metric: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "metric": self.metric}


@dataclass(frozen=True)
class SpecResolution:
    qir: QIR
    entries: tuple[SpecEntry, ...] = ()
    unresolved: tuple[Unresolved, ...] = ()
    assumptions: tuple[Assumption, ...] = ()

    @property
    def closed(self) -> bool:
        return not self.unresolved

    def to_dict(self) -> dict[str, Any]:
        return {
            "closed": self.closed,
            "qir": self.qir.to_dict(),
            "entries": [e.to_dict() for e in self.entries],
            "unresolved": [u.to_dict() for u in self.unresolved],
            "assumptions": [a.to_dict() for a in self.assumptions],
        }


class SpecRegistry:
    """Versioned defaults.  Every use is recorded as an assumption."""

    def __init__(self, version: str = "spec-v1"):
        self.version = version
        self.quantifiers: dict[str, QuantifierPolicy] = {
            # Default only.  A caller may require an explicit policy instead.
            "most": QuantifierPolicy("majority", threshold_num=1, threshold_den=2),
        }
        self.metrics: dict[str, Metric] = {
            # Illustrative default.  Users should supply weights for a real
            # decision; the receipt says the default was used.
            "stability": Metric(
                name="stability",
                weights=(
                    ("outlook_pct", 1.0),
                    ("change", 0.0001),
                    ("annual_openings", 0.0001),
                ),
                description="illustrative default; override with user weights",
            ),
        }
        self.utilities: dict[str, UtilityPolicy] = {
            "best": UtilityPolicy("max", metric="stability"),
        }
        self.units: dict[str, str] = {
            "pay": "annual",
        }
        self.directions: dict[str, str] = {
            "difference": "symmetric",
        }

    # ------------------------------------------------------------------
    # Resolution
    # ------------------------------------------------------------------
    def resolve(
        self,
        unresolved: Unresolved,
        overrides: dict[str, Any] | None = None,
        allow_defaults: bool = True,
    ) -> SpecEntry | None:
        key = f"{unresolved.kind}:{unresolved.symbol}"
        overrides = overrides or {}
        if key in overrides:
            return SpecEntry(key=key, value=overrides[key], source="user", version=self.version)
        if unresolved.symbol in overrides:
            return SpecEntry(
                key=key,
                value=overrides[unresolved.symbol],
                source="user",
                version=self.version,
            )

        if not allow_defaults:
            return None

        if unresolved.kind == "quantifier":
            policy = self.quantifiers.get(unresolved.symbol)
            if policy is None:
                return None
            return SpecEntry(
                key=key,
                value=policy.to_dict(),
                source="default",
                version=self.version,
                rationale="built-in quantifier policy",
            )
        if unresolved.kind == "metric":
            metric = self.metrics.get(unresolved.symbol)
            if metric is None:
                return None
            return SpecEntry(
                key=key,
                value=metric,
                source="default",
                version=self.version,
                rationale=metric.description or "built-in metric",
            )
        if unresolved.kind == "utility":
            utility = self.utilities.get(unresolved.symbol)
            if utility is None:
                return None
            return SpecEntry(
                key=key,
                value=utility.to_dict(),
                source="default",
                version=self.version,
                rationale="built-in utility policy",
            )
        if unresolved.kind == "unit":
            unit = self.units.get(unresolved.symbol)
            if unit is None:
                return None
            return SpecEntry(
                key=key,
                value=unit,
                source="default",
                version=self.version,
                rationale="built-in unit policy",
            )
        if unresolved.kind == "direction":
            direction = self.directions.get(unresolved.symbol)
            if direction is None:
                return None
            return SpecEntry(
                key=key,
                value=direction,
                source="default",
                version=self.version,
                rationale="built-in direction policy",
            )
        # Scope/corpus, causal model and normative theory have no default:
        # they must be supplied by the caller.
        return None


def _as_quantifier(value: Any) -> QuantifierPolicy | None:
    if isinstance(value, QuantifierPolicy):
        return value
    if isinstance(value, dict):
        try:
            return QuantifierPolicy(
                name=str(value["name"]),
                threshold_num=int(value["threshold_num"]),
                threshold_den=int(value["threshold_den"]),
            )
        except (KeyError, TypeError, ValueError):
            return None
    return None


def _as_metric(value: Any) -> Metric | None:
    if isinstance(value, Metric):
        return value
    if isinstance(value, dict):
        try:
            return Metric(
                name=str(value["name"]),
                weights=tuple((str(f), float(w)) for f, w in value["weights"]),
                description=value.get("description"),
            )
        except (KeyError, TypeError, ValueError):
            return None
    return None


def _as_utility(value: Any) -> UtilityPolicy | None:
    if isinstance(value, UtilityPolicy):
        return value
    if isinstance(value, dict):
        return UtilityPolicy(name=str(value.get("name", "max")), metric=value.get("metric"))
    if isinstance(value, str):
        return UtilityPolicy(name=value)
    return None


def _apply(qir: QIR, unresolved: Unresolved, entry: SpecEntry, registry: SpecRegistry) -> QIR:
    kind = unresolved.kind
    if kind == "quantifier":
        policy = _as_quantifier(entry.value)
        if policy is None:
            return qir
        return replace(
            qir,
            quantifier=policy.name,
            threshold_num=policy.threshold_num,
            threshold_den=policy.threshold_den,
        )
    if kind == "metric":
        metric = _as_metric(entry.value)
        if metric is None:
            return qir
        return replace(qir, metric=metric)
    if kind == "utility":
        utility = _as_utility(entry.value)
        if utility is None:
            return qir
        qir = replace(qir, op=utility.name)
        if qir.metric is None and utility.metric:
            metric = registry.metrics.get(utility.metric)
            if metric is not None:
                qir = replace(qir, metric=metric)
        return qir
    if kind == "unit":
        return replace(qir, field=str(entry.value))
    if kind == "direction":
        return replace(qir, direction=str(entry.value))
    if kind in ("scope", "corpus"):
        return replace(
            qir,
            corpus_id=str(entry.value),
            notes=qir.notes + ("requires_coverage_receipt",),
        )
    if kind in ("model", "theory"):
        # A supplied model/theory does not by itself give us a formal theory.
        return replace(
            qir,
            reason=f"{kind} supplied ({entry.value}); no formal theory implemented",
            notes=qir.notes + (f"{kind}_supplied",),
        )
    return qir


def close_qir(
    qir: QIR,
    registry: SpecRegistry | None = None,
    overrides: dict[str, Any] | None = None,
    allow_defaults: bool = True,
) -> SpecResolution:
    """Close every hole that has a user or registry resolution.

    Returns the closed (or partially closed) QIR plus the entries, remaining
    holes, and assumptions.  It never invents a value.
    """
    registry = registry or SpecRegistry()
    entries: list[SpecEntry] = []
    unresolved_out: list[Unresolved] = []
    assumptions: list[Assumption] = []

    def close_one(node: QIR) -> QIR:
        current = node
        node_unresolved: list[Unresolved] = []
        # Metric before utility: a utility can name a metric.
        ordered = sorted(
            current.unresolved,
            key=lambda u: {"metric": 0, "utility": 1}.get(u.kind, 2),
        )
        for hole in ordered:
            entry = registry.resolve(hole, overrides=overrides, allow_defaults=allow_defaults)
            if entry is None:
                node_unresolved.append(hole)
                unresolved_out.append(hole)
                continue
            current = _apply(current, hole, entry, registry)
            entries.append(entry)
            assumptions.append(
                Assumption(
                    key=entry.key,
                    value=entry.value,
                    source=entry.source,
                    rationale=entry.rationale,
                    version=entry.version,
                )
            )
        current = replace(current, unresolved=tuple(node_unresolved))
        if current.parts:
            current = replace(current, parts=tuple(close_one(p) for p in current.parts))
        return current

    closed = close_one(qir)
    # Attach the same spec to every node so check_answer can find it.
    spec = Spec(entries=tuple(entries), version=registry.version) if entries else None
    if spec is not None:
        closed = replace(closed, spec=spec)
    return SpecResolution(
        qir=closed,
        entries=tuple(entries),
        unresolved=tuple(unresolved_out),
        assumptions=tuple(assumptions),
    )
