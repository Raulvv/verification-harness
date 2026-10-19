# AGENTS.md — retrieval-kit

Guardrails for work **under `kit/`**. Self-contained on purpose: the kit is
published on its own, so nothing here may depend on the parent repo. Repo-wide
rules (third-party conduct, the commit cadence) stay in the root `AGENTS.md`.

## Concision — answer first

- **Lead with the answer**: the number, the name, or yes/no, on the first line.
  No preamble, no restating the question, no postamble.
- Expand only when asked, or when compressing would be unsafe — a multi-cause
  diagnosis, a decision with real trade-offs.
- Prefer one word to a sentence, a sentence to a paragraph. Default to the
  fewest lines that are still correct.
- **Chat is terse; artifacts are not.** Ledger rows, commit bodies and docs keep
  the evidence and detail the repo requires — different medium, different rule.
- Output tokens are the dominant cost of a run. Treat every extra paragraph as
  spend.

## Working agreements

- **Gate: `npm run kit:test`** — offline, no network. Green before and after a
  change. A structural move is proven by the gate staying green **and** the diff
  being exactly what was intended, not by the unit suite alone.
- **Tests travel with the touch.** A unit that touches an uncovered module adds
  focused tests in the same commit. **No vacuous tests** (never restate the
  code); prove a new guard non-vacuous by mutating what it guards, watching it go
  red, then reverting.
- **The facade is frozen.** `kit/index.mjs` is the only supported import;
  `kit/test/structure/exports-surface.test.mjs` pins the surface. A new export is
  a deliberate act — update the test with the change, never to make red go green.
- **Standalone.** No `../` imports out of `kit/`, no reliance on the parent
  repo's scripts or data. The kit runs from its own directory.
- **One unit per commit**, conventional style
  (`feat|fix|refactor|test|docs|chore(kit): …`). A user-visible change gets a
  `kit/CHANGELOG.md` entry.
- **Temp scripts** live in the OS temp dir, use absolute paths, and are deleted
  in the same command. Never leave a `.tmp-*` under `kit/`.
- **Be a good citizen to any source** the adapters reach (MediaWiki, Confluence):
  one query per real use case, bounded retries, cache what hasn't changed, fail
  silent — never block or slow the rest of the app.
