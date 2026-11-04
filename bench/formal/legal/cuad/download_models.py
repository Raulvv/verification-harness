"""Download the official CUAD fine-tuned checkpoints from Zenodo.

    .venv/bin/python legal/cuad/download_models.py --model roberta-large

Models are written under legal/cuad/models/ and are gitignored. The archives
are large; roberta-large is ~1.3 GB and deberta-v2-xlarge is ~3.1 GB.
"""

from __future__ import annotations

import argparse
import hashlib
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = HERE / "models"
BASE = "https://zenodo.org/api/records/4599830/files/{name}.zip/content"
FILES = {
    "roberta-base": ("63855b3d798f010164974cafc3ade2fa", 447429160),
    "roberta-large": ("1882ab4a3fc037bdd62a7f7c67d6c7da", 1292725488),
    "deberta-v2-xlarge": ("762ea34564bcfa8703d58c966577ddd7", 3123889641),
}


def _md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download official CUAD checkpoints")
    parser.add_argument("--model", choices=sorted(FILES), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)

    expected_md5, expected_size = FILES[args.model]
    MODELS.mkdir(parents=True, exist_ok=True)
    archive = MODELS / f"{args.model}.zip"
    target = MODELS / args.model
    if args.force or not archive.exists() or archive.stat().st_size != expected_size:
        print(f"downloading {args.model} ({expected_size / 1e9:.2f} GB)")
        with urllib.request.urlopen(BASE.format(name=args.model), timeout=600) as response:
            with archive.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
    actual_md5 = _md5(archive)
    if actual_md5 != expected_md5:
        raise SystemExit(f"MD5 mismatch: {actual_md5} != {expected_md5}")
    if args.force or not target.exists():
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(MODELS)
    print(f"model: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
