"""Download the public CUAD v1 data used by the CUAD adapter.

    .venv/bin/python legal/cuad/download_cuad.py

The data is written under legal/cuad/data/ and is gitignored. CUAD is public
but has its own license and citation requirements; do not vendor the JSON into
the repository.

Source: https://github.com/The-Atticus-Project/cuad
Paper:  https://arxiv.org/abs/2103.06268
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ZIP_URL = "https://raw.githubusercontent.com/The-Atticus-Project/cuad/main/data.zip"
CSV_URL = (
    "https://raw.githubusercontent.com/The-Atticus-Project/cuad/main/"
    "category_descriptions.csv"
)
ZIP_SHA256 = "f8161d18bea4e9c05e78fa6dda61c19c846fb8087ea969c172753bc2f45b999a"
CSV_SHA256 = "7499950ee04d2ed2841c0f8ec2ef96b91be039bc2ea3c4edcc36334a465b1f36"
MEMBERS = ("CUADv1.json", "test.json", "train_separate_questions.json")


def _download(url: str, path: Path) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        payload = response.read()
    path.write_bytes(payload)
    return payload


def _check(payload: bytes, expected: str, label: str) -> None:
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected:
        raise SystemExit(f"{label} checksum mismatch: {actual} != {expected}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download CUAD v1")
    parser.add_argument("--force", action="store_true", help="redownload existing files")
    args = parser.parse_args(argv)

    DATA.mkdir(parents=True, exist_ok=True)
    zip_path = DATA / "data.zip"
    if args.force or not zip_path.exists():
        payload = _download(ZIP_URL, zip_path)
    else:
        payload = zip_path.read_bytes()
    _check(payload, ZIP_SHA256, "data.zip")

    with zipfile.ZipFile(zip_path) as archive:
        for member in MEMBERS:
            target = DATA / member
            if args.force or not target.exists():
                with archive.open(member) as source, target.open("wb") as dest:
                    dest.write(source.read())

    csv_path = DATA / "category_descriptions.csv"
    if args.force or not csv_path.exists():
        _check(
            _download(CSV_URL, csv_path),
            CSV_SHA256,
            "category_descriptions.csv",
        )

    for member in MEMBERS:
        path = DATA / member
        count = len(json.loads(path.read_text(encoding="utf-8")).get("data", []))
        print(f"{member}: {count} contracts")
    print(f"wrote {DATA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
