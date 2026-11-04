# Competitive benchmark harness

This directory holds a frozen claim set and detector score files. The harness
does **not** call a model; it compares the formal verifier with external
detectors on the same claims.

## Run

```bash
cd bench/formal
.venv/bin/python -m formal.competitive \
  --detector competitive/detectors/nli.jsonl
```

The frozen 50-claim public pilot and its results are in
[`PILOT-REPORT.md`](PILOT-REPORT.md). The larger 160-claim public pilot is in
[`PILOT-160-REPORT.md`](PILOT-160-REPORT.md). The pre-registration is
[`PRE-REGISTRATION.md`](PRE-REGISTRATION.md).

## One-question gold form (recommended)

Open [`GOLD-FORM.html`](GOLD-FORM.html) in a browser. It shows **one claim at a
time** and asks you to choose the gold label:

- `1` Supported — correct and supported by the evidence
- `2` Contradicted — wrong or contradicted by the evidence
- `3` Absent — correctly says the fact is not stated
- `4` Partial — some parts correct, some missing
- `5` Ambiguous — cannot decide from the evidence
- `6` Skip

Clicking a label stays on the claim so you can add notes; keyboard selection
advances. The provisional gold and formal verdict are hidden until you toggle
**Show provisional hints**. Export JSON/CSV when done.

```bash
open bench/formal/competitive/GOLD-FORM.html
open bench/formal/competitive/private/natural-gold-form.html
```

The natural form is generated from the local, gitignored natural-reader slice:

```bash
.venv/bin/python competitive/build_natural.py
.venv/bin/python competitive/build_gold_form.py \
  --input competitive/private/natural-80.jsonl \
  --output competitive/private/natural-gold-form.html \
  --title "Natural reader-error gold"
```

## Card-based audit (alternative)

Open [`AUDIT-SHEET.html`](AUDIT-SHEET.html) in a browser. It is a self-contained
audit tool:

- shows question, answer, evidence, gold, and formal verdict
- **Correct / Incorrect / Ambiguous / Skip** buttons
- notes per claim
- filters (needs audit, unreviewed, contradicted, supported, absent)
- keyboard shortcuts `1`–`4`
- export JSON/CSV, import JSON
- decisions saved in localStorage

`AUDIT-SHEET.csv` is the same sheet for spreadsheet users. The natural-reader
slice is local-only (gitignored):

```bash
.venv/bin/python competitive/build_natural.py
.venv/bin/python competitive/build_gold_form.py \
  --input competitive/private/natural-80.jsonl \
  --output competitive/private/natural-gold-form.html \
  --title "Natural reader-error gold"
```

## Multi-reader held-out slice

A two-reader natural-error set is generated from cached Sonnet 5.5 DA and
GLM-5.3-Flash DA outputs:

```bash
.venv/bin/python competitive/build_multireader.py
.venv/bin/python competitive/build_gold_form.py \
  --input competitive/private/multireader-160.jsonl \
  --output competitive/private/multireader-gold-form.html \
  --title "Multi-reader natural gold"
```

160 claims: 80 Sonnet DA + 80 GLM DA, 80 answerable + 80 unanswerable. The
set is human-audited and corrected (8 confirmed corrections). Results:

| System | Binary | Exact | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **1.00** | 0.98 | **0** | **0** | **1.00** |
| MiniCheck | 0.75 | 0.27 | 7 | 33 | 1.00 |
| LettuceDetect | 0.21 | 0.21 | 96 | 30 | 1.00 |
| HHEM | 0.79 | 0.28 | 2 | 31 | 1.00 |

Apply the export with:

```bash
.venv/bin/python competitive/apply_multireader_audit.py
```

Details: `private/MULTIREADER-AUDIT-REPORT.md`. This is reader-held-out, not
question-held-out.

## Apply the audit

After exporting `gold-results-combined.json` from the browser:

```bash
.venv/bin/python competitive/apply_audit.py
```

This writes:

- `pilot-160-human.jsonl` — public human labels; 160/160 matched provisional.
- `private/natural-80-human.jsonl` — private natural-reader labels.

Natural-reader audit result after confirmed corrections: 31 supported, 40
absent, 8 contradicted, 1 partial. The natural slice found and fixed three real
formal issues: a false sub-claim (`natural-test-030`), verbose arithmetic
(`natural-test-089`), and false abstention on answerable questions. Formal now
scores 1.00 binary, 0 false accepts, 0 false rejects, 1.00 coverage on the 80
natural claims; exact is 0.99 because `natural-test-030` is gold `partial` and
the verdict is `CONTRADICTION`. The private report is
`private/NATURAL-AUDIT-REPORT.md`.

```bash
.venv/bin/python -m formal.competitive \
  --claims competitive/pilot-50.jsonl \
  --detector competitive/detectors/minicheck.jsonl \
  --detector competitive/detectors/lettucedetect.jsonl \
  --detector competitive/detectors/hhem.jsonl
```

```text
system           binary    exact   false+   false-    cover
formal             1.00     1.00        0        0     1.00
nli                0.80     0.70        1        1     1.00
```

## Claim set

`claims.jsonl` fields:

| Field | Meaning |
|---|---|
| `id` | stable claim id |
| `category` | lookup, difference, compare, extremum, count, absence, prose |
| `question` | the user question |
| `answer` | the reader/detector answer |
| `gold` | supported, contradicted, absent, needs_specification |

The current fixture is a public OOH claim set. It is a harness test, not the
final competitive benchmark.

## Detector score files

`detectors/*.jsonl` fields:

```json
{"id": "lookup-supported", "score": 0.95}
```

or a label:

```json
{"id": "lookup-supported", "label": "supported"}
```

A score is thresholded at `--threshold` (default `0.5`): `supported` above,
`contradicted` below. A label is normalized. This is how HHEM, MiniCheck, and
LettuceDetect outputs can be imported without coupling the harness to their
runtimes.

## What this measures

- **binary accuracy** — supported vs not supported
- **exact accuracy** — exact category match where the detector provides one
- **false accepts** — supported when gold is contradicted/absent
- **false rejects** — not supported when gold is supported
- **coverage** — not abstained/unknown
- **per-category** breakdown

The point is not a single leaderboard number. The point is the category
breakdown: where structured verification wins, and where probabilistic
detectors win.
