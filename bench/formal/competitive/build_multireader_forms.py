"""Build one gold form per reader from the four-reader claim set.

    .venv/bin/python competitive/build_multireader_forms.py

Writes `private/multireader-<reader>-gold.html` for each reader. Each form has
80 claims, so the audit stays one question at a time.
"""

from __future__ import annotations

from pathlib import Path

import build_gold_form

HERE = Path(__file__).resolve().parent
INPUT = HERE / "private" / "multireader-320.jsonl"
OUT_DIR = HERE / "private"

TITLES = {
    "deepseek-da": "DeepSeek 4.1 Flash — 80 claims",
    "sonnet-da": "Sonnet 5.5 — 80 claims",
    "glm-da": "GLM-5.3-Flash — 80 claims",
    "qwen-da": "Qwen 3.8 27B — 80 claims",
}


def main() -> None:
    for reader, title in TITLES.items():
        output = OUT_DIR / f"multireader-{reader}-gold.html"
        build_gold_form.main(
            [
                "--input",
                str(INPUT),
                "--reader",
                reader,
                "--output",
                str(output),
                "--title",
                title,
            ]
        )


if __name__ == "__main__":
    main()
