# Golden-set protocol

The golden set is the experiment's ground truth — spend real care here; every
number downstream is only as honest as this file. ~25–50 questions is the
useful range (below 20 the noise swamps differences; above 50 authoring cost
grows faster than signal).

## What goes in

1. **Real questions first.** Actual questions you or your users asked the
   docs, in the words they used. These are the `asked_by: "user"` rows —
   keep them visible as a separate group in the scorecard so overfitting to
   seeds stays visible.
2. **Adversarial seeds.** Questions the system *should* get right but that
   stress a specific failure mode: paraphrase distance, ambiguity between two
   similar docs, terminology drift.
3. **NOT-FOUND traps** (`"not_found": true`) — questions the docs cannot
   answer. `"candidates": []` — bare `NOT FOUND` is the whole correct answer
   (verdict + path + quote). (The old "neighbor" shape was removed 2026-09-30:
   an abstention carries no receipts.)
4. **Multi-home cases** — questions two documents legitimately answer. List
   both in `candidates`; scoring is any-of.
5. **Lexical traps** — questions where a plausible wrong answer can echo
   words from a real quote that actually contradicts it. These are what the
   contract rule "the quote must support the whole answer" exists for.

## Item shape

```json
{
  "id": "q-7",
  "question": "What is the reservation limit for holds?",
  "asked_by": "user",
  "expect": ["10", "per card"],
  "not_found": false,
  "candidates": [
    { "path": "docs/domain/limits.md:12", "quote": "The limit is 10 active holds per card." }
  ]
}
```

- `expect` — substrings the answer must contain (case-insensitive). One point.
- `candidates[].path` — file, optional `:line`. One point if named.
- `candidates[].quote` — verbatim supporting text. One point if reproduced.
- Total per item: **3 points** (verdict, path, quote).

## Citations (system 3.0)

Answers cite `Source: <title> · <path:line>`; the title and date are
auto-derived by `lib/meta.mjs` (sidecar `.meta.json` → git → mtime).
Candidate quotes are matched **file-side** — any verbatim line of a
legitimate home counts.

## Scoring rules (already encoded in `lib/receipts/score.mjs` — don't re-invent)

- Path match ignores a trailing `:line` range; quote matching normalizes
  whitespace, strips backticks/emphasis, and matches through " / " joins
  (whole or by verbatim segments).
- **Quote is scored file-side** (since 2026-09-25): the answer's own quoted
  evidence must appear verbatim in one of the candidate *homes* — any
  legitimate line of the right file counts, not only the fixture's favorite.
  Reproducing the candidate quote verbatim still counts as well.
- For `not_found` items with no candidates, an abstention in the answer IS
  the correct path/quote shape.
- Keep one set for **fit** (thresholds, prompts, fine-tune) and one strictly
  for **holdout** (never looked at while tuning). Label them (`"set": "v2"`).

## Provenance discipline

Any label used for tuning must come from the mechanical verifier, this
golden set, a seeded-error drill, or a human. The model never grades its own
homework.
