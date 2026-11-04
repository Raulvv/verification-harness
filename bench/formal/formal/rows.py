"""Structured OOH rows, field access, quote->row/field mapping, and schema.

The JSON snapshot is the formal premise source.  Page quotes remain evidence:
every structured field is paired with the exact quick-fact line it came from.
The markdown table is parsed independently and cross-checked against the JSON.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .model import FIELDS, Citation

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA = ROOT / "bench" / "ooh-data.json"
DEFAULT_TABLE = ROOT / "bench" / "ooh-table-v1.md"

QUOTE_KEYS = {
    "annual": "2023 Median Pay",
    "hourly": "2023 Median Pay",
    "outlook_pct": "Job Outlook, 2023-33",
    "jobs": "Number of Jobs, 2023",
    "change": "Employment Change, 2023-33",
    "annual_openings": "openings",
    "education": "Typical Entry-Level Education",
    "work_experience": "Work Experience in a Related Occupation",
    "training": "On-the-job Training",
}


def norm_quote(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _num(text: str) -> int:
    return int(str(text).replace(",", "").replace("$", "").strip())


@dataclass(frozen=True)
class Row:
    slug: str
    title: str
    annual: int | None
    hourly: float | None
    education: str
    work_experience: str
    training: str
    jobs: int
    change: int
    outlook_pct: int
    annual_openings: int
    quotes: dict[str, str]
    annual_censored: bool = False

    @property
    def jobs2033(self) -> int:
        return self.jobs + self.change

    @property
    def has_annual(self) -> bool:
        return self.annual is not None


def load_rows(data_path: Path | str = DEFAULT_DATA) -> tuple[Row, ...]:
    raw = json.loads(Path(data_path).read_text(encoding="utf-8"))
    rows: list[Row] = []
    for x in raw:
        qf = dict(x.get("quick_facts") or {})
        pay_quote = qf.get("2023 Median Pay", "")
        censored = bool(re.search(r"equal to or greater than|>=\s*\$", pay_quote, re.I))
        rows.append(
            Row(
                slug=x["slug"],
                title=x["title"],
                annual=None if x.get("annual") is None else int(x["annual"]),
                hourly=None if x.get("hourly") is None else float(x["hourly"]),
                education=str(x.get("education") or ""),
                work_experience=str(x.get("work_experience") or ""),
                training=str(x.get("training") or ""),
                jobs=int(x["jobs"]),
                change=int(x["change"]),
                outlook_pct=int(x["outlook_pct"]),
                annual_openings=int(x["annual_openings"]),
                quotes=qf,
                annual_censored=censored,
            )
        )
    if len(rows) != 48:
        raise ValueError(f"expected 48 rows, got {len(rows)}")
    return tuple(rows)


@dataclass(frozen=True)
class TableRow:
    title: str
    annual: int | None
    outlook_pct: int
    jobs: int
    change: int
    annual_openings: int
    education: str
    work_experience: str
    training: str


def parse_table(path: Path | str = DEFAULT_TABLE) -> tuple[TableRow, ...]:
    """Parse the published markdown table independently of the JSON."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out: list[TableRow] = []
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 9 or cells[0] == "Occupation" or set(cells[0]) <= {"-"}:
            continue
        pay = None if cells[1].upper() == "N/A" else _num(cells[1])
        out.append(
            TableRow(
                title=cells[0],
                annual=pay,
                outlook_pct=_num(cells[2].replace("%", "")),
                jobs=_num(cells[3]),
                change=_num(cells[4]),
                annual_openings=_num(cells[5]),
                education=cells[6],
                work_experience=cells[7],
                training=cells[8],
            )
        )
    if len(out) != 48:
        raise ValueError(f"expected 48 table rows, got {len(out)}")
    return tuple(out)


@dataclass
class Dataset:
    rows: tuple[Row, ...]
    table: tuple[TableRow, ...]
    by_title: dict[str, Row]
    by_slug: dict[str, Row]
    paid: tuple[Row, ...]
    quote_index: dict[str, tuple[Row, str]]
    table_agreement: dict[str, Any]

    def row(self, title: str) -> Row | None:
        return self.by_title.get(title)

    def field_value(self, title: str, field: str) -> int | float | str | None:
        row = self.by_title.get(title)
        if row is None:
            return None
        return field_value(row, field)

    def field_quote(self, title: str, field: str) -> str | None:
        row = self.by_title.get(title)
        if row is None:
            return None
        return field_quote(row, field)

    def citation(self, title: str, field: str) -> Citation | None:
        row = self.by_title.get(title)
        if row is None:
            return None
        quote = field_quote(row, field)
        if quote is None:
            return None
        return Citation(title=row.title, slug=row.slug, field=field, quote=quote)

    def map_quote(self, quote: str, title: str | None = None) -> tuple[Row, str] | None:
        """Map an evidence quote to (row, field).

        Quick-fact lines repeat across occupations (e.g. a 7% growth line), so
        when the citation names a title, that row wins before any global index.
        """
        key = norm_quote(quote)
        if not key:
            return None
        candidates = (self.by_title[title],) if title and title in self.by_title else self.rows
        # Exact within the claimed row first.
        for row in candidates:
            for field, q in row.quotes.items():
                if norm_quote(q) == key:
                    return row, _quote_key_to_field(field)
        hit = self.quote_index.get(key)
        if hit is not None:
            return hit
        best: tuple[Row, str] | None = None
        best_len = 0
        for row in candidates:
            for field, q in row.quotes.items():
                qn = norm_quote(q)
                if not qn:
                    continue
                if key in qn or qn in key:
                    if len(qn) > best_len:
                        best = (row, _quote_key_to_field(field))
                        best_len = len(qn)
        return best

    def closest_quote(self, title: str, field: str, scope_kind: str | None) -> Citation | None:
        """The nearest available field, used only to evidence a schema absence."""
        row = self.by_title.get(title)
        if row is None:
            return None
        # The closest available field for each unsupported scope.
        fallback = {
            ("annual", "place"): "annual",
            ("annual", "company"): "annual",
            ("jobs", "year"): "jobs",
            ("outlook_pct", "period"): "outlook_pct",
            ("annual_openings", "specific_year"): "annual_openings",
        }.get((field, scope_kind), field)
        quote = field_quote(row, fallback)
        if quote is None:
            return None
        return Citation(
            title=row.title,
            slug=row.slug,
            field=fallback,
            quote=quote,
            source="ooh-data.json",
        )


def _quote_key_to_field(key: str) -> str:
    for field, qk in QUOTE_KEYS.items():
        if qk == key:
            return field
    return key


def field_value(row: Row, field: str) -> int | float | str | None:
    if field == "annual":
        return row.annual
    if field == "hourly":
        return row.hourly
    if field == "outlook_pct":
        return row.outlook_pct
    if field == "jobs":
        return row.jobs
    if field == "change":
        return row.change
    if field == "jobs2033":
        return row.jobs2033
    if field == "annual_openings":
        return row.annual_openings
    if field == "education":
        return row.education
    if field == "work_experience":
        return row.work_experience
    if field == "training":
        return row.training
    raise KeyError(f"unknown field {field!r}")


def field_quote(row: Row, field: str) -> str | None:
    key = QUOTE_KEYS.get(field)
    if key is None:
        return None
    return row.quotes.get(key)


def schema_has(field: str, scope_kind: str | None = None) -> bool:
    """Closed-world schema check: does the snapshot carry this field/scope?

    The snapshot is national, 2023--33, with annual-average openings.  A
    place/company qualifier, a 2010 employment year, a 2012--22 growth period,
    or a 2033-specific openings count is outside the schema.  This is NOT an
    open-world absence claim.
    """
    if field not in FIELDS:
        return False
    if scope_kind is None:
        return True
    return False


def build_dataset(data_path: Path | str = DEFAULT_DATA, table_path: Path | str = DEFAULT_TABLE) -> Dataset:
    rows = load_rows(data_path)
    table = parse_table(table_path)
    by_title = {r.title: r for r in rows}
    by_slug = {r.slug: r for r in rows}
    paid = tuple(r for r in rows if r.has_annual)
    quote_index: dict[str, tuple[Row, str]] = {}
    for row in rows:
        for key, quote in row.quotes.items():
            quote_index.setdefault(norm_quote(quote), (row, _quote_key_to_field(key)))

    table_by_title = {t.title: t for t in table}
    mismatches: list[str] = []
    for row in rows:
        t = table_by_title.get(row.title)
        if t is None:
            mismatches.append(f"missing table row: {row.title}")
            continue
        checks = {
            "annual": row.annual == t.annual,
            "outlook_pct": row.outlook_pct == t.outlook_pct,
            "jobs": row.jobs == t.jobs,
            "change": row.change == t.change,
            "annual_openings": row.annual_openings == t.annual_openings,
            "education": row.education == t.education,
            "work_experience": row.work_experience == t.work_experience,
            "training": row.training == t.training,
        }
        for field, ok in checks.items():
            if not ok:
                mismatches.append(f"{row.title}: {field} JSON={field_value(row, field)!r} table={getattr(t, field)!r}")

    return Dataset(
        rows=rows,
        table=table,
        by_title=by_title,
        by_slug=by_slug,
        paid=paid,
        quote_index=quote_index,
        table_agreement={
            "rows": len(rows),
            "table_rows": len(table),
            "fields_checked": 8,
            "mismatches": mismatches,
            "agrees": not mismatches,
        },
    )
