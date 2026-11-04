"""Synthetic legal playbook demo for EPIC-FORMAL-003.

This is a proof of concept, not legal advice. It extracts six structured facts
from a synthetic contract and checks a small playbook with deterministic rules.
The real pilot replaces the extractor and playbook with expert-reviewed ones.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .model import Verification
from .router import route_verification


@dataclass(frozen=True)
class LegalFact:
    value: Any
    quote: str
    clause: str | None


@dataclass(frozen=True)
class LegalFacts:
    governing_law: LegalFact | None = None
    liability_cap_months: LegalFact | None = None
    notice_days: LegalFact | None = None
    renewal_months: LegalFact | None = None
    data_protection: LegalFact | None = None
    assignment_consent: LegalFact | None = None


@dataclass(frozen=True)
class PlaybookRule:
    id: str
    description: str
    field: str
    op: str
    value: Any


@dataclass(frozen=True)
class LegalFinding:
    rule_id: str
    description: str
    verdict: str
    route: str
    route_reason: str
    clause: str | None
    quote: str | None
    value: Any
    receipt: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "description": self.description,
            "verdict": self.verdict,
            "route": {"action": self.route, "reason": self.route_reason},
            "clause": self.clause,
            "quote": self.quote,
            "value": self.value,
            "receipt": self.receipt,
        }


def _line_at(text: str, pos: int) -> str:
    start = text.rfind("\n", 0, pos) + 1
    end = text.find("\n", pos)
    if end < 0:
        end = len(text)
    return text[start:end].strip()


def _heading_before(text: str, pos: int) -> str | None:
    matches = list(re.finditer(r"^##\s+(.+)$", text[:pos], re.M))
    return matches[-1].group(1).strip() if matches else None


def _fact(text: str, match: re.Match, value: Any) -> LegalFact:
    return LegalFact(
        value=value,
        quote=_line_at(text, match.start()),
        clause=_heading_before(text, match.start()),
    )


def extract_facts(contract_text: str) -> LegalFacts:
    text = str(contract_text or "")
    law = re.search(r"governed by the laws of the State of ([A-Z][A-Za-z ]+)\.", text)
    liability = re.search(r"fees paid in the (\d+) months", text, re.I)
    notice = re.search(r"with (\d+) days' prior written notice", text, re.I)
    renewal = re.search(r"successive (\d+) month periods", text, re.I)
    data = re.search(r"data protection laws", text, re.I)
    assignment = re.search(
        r"[^\n]*assign[^\n]*prior written consent[^\n]*\.",
        text,
        re.I,
    )
    return LegalFacts(
        governing_law=_fact(text, law, law.group(1).strip()) if law else None,
        liability_cap_months=_fact(text, liability, int(liability.group(1))) if liability else None,
        notice_days=_fact(text, notice, int(notice.group(1))) if notice else None,
        renewal_months=_fact(text, renewal, int(renewal.group(1))) if renewal else None,
        data_protection=_fact(text, data, True) if data else None,
        assignment_consent=_fact(text, assignment, True) if assignment else None,
    )


def load_playbook(path: Path | str) -> list[PlaybookRule]:
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        PlaybookRule(
            id=str(row["id"]),
            description=str(row["description"]),
            field=str(row["field"]),
            op=str(row["op"]),
            value=row["value"],
        )
        for row in rows
    ]


def playbook_digest(rules: list[PlaybookRule]) -> str:
    payload = json.dumps(
        [
            {"id": r.id, "field": r.field, "op": r.op, "value": r.value}
            for r in rules
        ],
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _compare(value: Any, op: str, expected: Any) -> bool:
    if op == "=":
        return value == expected
    if op == "!=":
        return value != expected
    if op == ">=":
        return value >= expected
    if op == "<=":
        return value <= expected
    if op == ">":
        return value > expected
    if op == "<":
        return value < expected
    raise ValueError(f"unknown op {op!r}")


def verify_playbook(
    facts: LegalFacts,
    rules: list[PlaybookRule],
) -> list[LegalFinding]:
    spec_id = playbook_digest(rules)
    findings: list[LegalFinding] = []
    for rule in rules:
        fact: LegalFact | None = getattr(facts, rule.field, None)
        if fact is None:
            verdict = "INCOMPLETE"
            reason = f"fact not found: {rule.field}"
            clause = quote = None
            value = None
        else:
            ok = _compare(fact.value, rule.op, rule.value)
            verdict = "ENTAILED" if ok else "CONTRADICTION"
            reason = (
                f"{rule.field} = {fact.value!r} satisfies {rule.op} {rule.value!r}"
                if ok
                else f"{rule.field} = {fact.value!r} violates {rule.op} {rule.value!r}"
            )
            clause, quote, value = fact.clause, fact.quote, fact.value
        route = route_verification(Verification(verdict=verdict))
        findings.append(
            LegalFinding(
                rule_id=rule.id,
                description=rule.description,
                verdict=verdict,
                route=route.action,
                route_reason=route.reason,
                clause=clause,
                quote=quote,
                value=value,
                receipt={
                    "spec_id": spec_id,
                    "rule": rule.description,
                    "field": rule.field,
                    "op": rule.op,
                    "expected": rule.value,
                    "observed": value,
                    "clause": clause,
                    "quote": quote,
                },
            )
        )
    return findings


def verify_contract(
    contract_text: str,
    playbook_path: Path | str,
) -> tuple[LegalFacts, list[LegalFinding], str]:
    rules = load_playbook(playbook_path)
    facts = extract_facts(contract_text)
    return facts, verify_playbook(facts, rules), playbook_digest(rules)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Synthetic legal playbook demo")
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--playbook", type=Path, required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    text = args.contract.read_text(encoding="utf-8")
    facts, findings, spec_id = verify_contract(text, args.playbook)
    if args.json:
        print(
            json.dumps(
                {
                    "contract": str(args.contract),
                    "spec_id": spec_id,
                    "findings": [f.to_dict() for f in findings],
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0
    print(f"CONTRACT: {args.contract}")
    print(f"SPEC: {spec_id}")
    for finding in findings:
        print(f"{finding.rule_id}: {finding.verdict} ({finding.route})")
        print(f"  rule: {finding.description}")
        if finding.clause:
            print(f"  clause: {finding.clause}")
        if finding.quote:
            print(f"  quote: {finding.quote}")
        print(f"  reason: {finding.route_reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
