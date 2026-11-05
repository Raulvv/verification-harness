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

## Hard sets H2 and H3

Two frozen, human-approved question sets stress different parts of the harness.
They are **not** pooled with the main 100. The JSONL files and manifests are
private and gitignored; the builders and validators are public.

| Set | Questions | Hashes (SHA-256) | Tests |
|---|---:|---|---|
| H2 | 100 | `5271ddbd3b39ea0088b4e12d91d0e3f030c9e4f67ad34f6df6d7a835057f7093` | derived-2033 reading |
| H3 | 100 | `2420e06fce52b2a719f575a6502d2e70800f24818bca4d527582dbcd5c9ebaed` | multi-condition, top-k, filters, ambiguity |

H2 has 100 answerable derived-2033 questions. It measures the reader: the 2033
figure must be computed from the jobs and change lines. Three DeepSeek seeds
gave DA 71–75, B 15–20, A 0, with DA beating B on 51–58 questions per seed and
losing none.

H3 has 68 answerable, 17 ambiguity/specification, and 15 partial items. It
measures harness coverage, not reader quality: most questions need the full
46-row paid table, while the reader sees six documents.

```bash
# Regenerate and validate (no model calls)
.venv/bin/python competitive/build_hard_h2.py
.venv/bin/python competitive/validate_hard_h2.py
.venv/bin/python competitive/build_hard_h3.py
.venv/bin/python competitive/validate_hard_h3.py

# Prove the deterministic reducer reproduces the H3 gold (from bench/formal)
node competitive/verify_h3_aggregate.mjs

# Build the answerable + partial reader subset
python3 - <<'PY'
import json
p = 'competitive/private/hard-h3-100.jsonl'
rows = [json.loads(l) for l in open(p) if l.strip()]
run = [r for r in rows if r['condition'] in ('answerable', 'partial')]
open('competitive/private/hard-h3-83-run.jsonl', 'w').write(
    ''.join(json.dumps(r) + '\n' for r in run))
PY
```

Arm runs use `bench/arm-compare.mjs`. H3 needs the deterministic reducer:

```bash
node bench/arm-compare.mjs \
  --questions bench/formal/competitive/private/hard-h3-83-run.jsonl \
  --corpus bench/corpus/ooh-v1 --arms A,B,DA --seeds 1 --k 6 \
  --max-tokens 1200 --doc-mode excerpt --no-support \
  --aggregate table \
  --out bench/results/hard-h3-deepseek-arms.jsonl
```

`verify_h3_aggregate.mjs` covers the 68 answerable items. The 17 ambiguity
items need the specification layer to return `NEEDS_SPECIFICATION`; they are not
part of the reader-accuracy run. Results and caveats are in
[`../../ARM-COMPARE-REPORT.md`](../../ARM-COMPARE-REPORT.md).

### H3 paraphrase test

The H3 parser is phrasing-bound. A frozen set of 30 reviewed paraphrases plus 5
blind items (4 answerable, 1 ambiguity) measured whether the reducer can be
reached from other wording:

| Group | Routed | Missed |
|---|---:|---:|
| Reviewed 30 | 18 | 12 |
| Blind answerable | 0 | 4 |

Everything routed was correct (18/18). The reducer is sound; the rule-based
parser is the bottleneck.

`bench/lib/spec-extract.mjs` closes the gap on these development sets: the
model proposes a spec, the schema validates it, the reducer computes. With
`--extract on`, 30/30 reviewed and 3/4 blind answerable items are answered, and
H3 goes 100/100 (68 deterministic, 15 partials on the reader, 17 ambiguity
refused). The one blind miss is a deliberate refusal because “next year” is
outside the 2023 snapshot. These sets informed the prompt, so they are
development sets.

### Clean v2

A 10-question set was frozen after the extractor and run once. It scored
**6/10, with two false accepts**: “beat inflation” was silently mapped to
employment growth (25), and “2 worst by projected growth” returned the two best
because top-k sorts descending. Two schema gaps refused safely; 4/10 router
calls produced no JSON and fell back to a refusal. Do not patch against v2;
fixes are validated on a fresh v3 set. Report:
[`V2-REPORT.md`](V2-REPORT.md).
Full paraphrase report: [`H3-PARAPHRASE-REPORT.md`](H3-PARAPHRASE-REPORT.md).

```bash
.venv/bin/python competitive/build_h3_paraphrase.py
.venv/bin/python competitive/validate_h3_paraphrase.py \
  --input competitive/private/hard-h3-paraphrase-30.jsonl \
  --input competitive/private/hard-h3-paraphrase-blind.jsonl \
  --out competitive/private/hard-h3-paraphrase-35.jsonl
node competitive/verify_h3_aggregate.mjs \
  competitive/private/hard-h3-paraphrase-35.jsonl

# Full run with the schema-validated extractor
node bench/arm-compare.mjs \
  --questions bench/formal/competitive/private/hard-h3-paraphrase-35.jsonl \
  --corpus bench/corpus/ooh-v1 --arms DA --seeds 1 --k 6 \
  --max-tokens 1200 --doc-mode excerpt --no-support \
  --aggregate table --extract on \
  --out bench/results/hard-h3-paraphrase-35-extract.jsonl
```

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

### Two-reader set (historical)

The two-reader set is kept for the audit trail; the four-reader set below
supersedes it. It is generated from cached Sonnet 5.5 DA and GLM-5.3-Flash DA
outputs:

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
.venv/bin/python competitive/apply_multireader_audit.py \
  --input competitive/private/multireader-160.jsonl \
  --export ~/Downloads/gold-results.json \
  --out competitive/private/multireader-160-human.jsonl
```

Details: `private/MULTIREADER-AUDIT-REPORT.md`. This is reader-held-out, not
question-held-out.

### Four-reader set (human-audited)

The four-reader set adds DeepSeek 4.1 Flash DA and Qwen 3.8 27B DA to the
existing Sonnet 5.5 DA and GLM-5.3-Flash DA claims:

```bash
.venv/bin/python competitive/build_multireader.py
```

It writes `private/multireader-320.jsonl` (4 readers × 80 answerable/unanswerable
claims). Build one form per reader so the audit stays one question at a time:

```bash
.venv/bin/python competitive/build_multireader_forms.py
```

This writes `private/multireader-{deepseek,sonnet,glm,qwen}-gold.html`, each
with 80 claims. Then merge the exports:

```bash
.venv/bin/python competitive/apply_multireader_audit.py \
  --input competitive/private/multireader-320.jsonl \
  --export ~/Downloads/gold-results-deepseek.json \
  --export ~/Downloads/gold-results-sonnet.json \
  --export ~/Downloads/gold-results-glm.json \
  --export ~/Downloads/gold-results-qwen.json \
  --corrections competitive/private/multireader-320-corrections.json \
  --out competitive/private/multireader-320-human.jsonl
```

The audited label distribution is 130 supported, 160 absent, 26 contradicted,
and 4 partial. The 26 contradicted claims are below the pre-registered minimum
of 40, so this remains a pilot, not a primary false-accept claim.

Reader-only results on the same 100 test questions, before formal verification:

| Reader | Answerable | Unanswerable | Partial | Total correct | False accepts | Median latency |
|---|---:|---:|---:|---:|---:|---:|
| DeepSeek 4.1 Flash DA | 32/40 | 40/40 | 19/20 | 91 | 1 | 4.1 s |
| Sonnet 5.5 DA | 31/40 | 40/40 | 20/20 | 91 | 2 | 4.4 s |
| GLM-5.3-Flash DA | 31/40 | 40/40 | 17/20 | 88 | 6 | 5.8 s |
| Qwen 3.8 27B DA | 37/40 | 40/40 | 12/20 | 89 | 2 | 47.0 s |

Qwen has the best answerable coverage and the weakest partial coverage. This is
reader capability, not the harness result.

Final audited comparison:

| System | Binary | Exact | False accepts | False rejects | Coverage |
|---|---:|---:|---:|---:|---:|
| **Formal** | **1.00** | 0.99 | **0** | **0** | **1.00** |
| MiniCheck | 0.72 | 0.24 | 13 | 75 | 1.00 |
| LettuceDetect | 0.21 | 0.21 | 186 | 66 | 1.00 |
| HHEM | 0.76 | 0.25 | 4 | 73 | 1.00 |

Formal exact is 0.99 because four `partial` answers are judged
`CONTRADICTION`; the binary endpoint is correct. Natural-only 0/26 gives a
one-sided 95% upper bound of 10.9%; synthetic + natural 0/106 gives 2.8%. The
combined figure mixes synthetic perturbations with natural reader errors.

### Error-enriched and second-rater slices

The four-reader set has only 26 audited contradicted claims, below the
pre-registered 40 minimum. Two follow-up slices are prepared:

```bash
.venv/bin/python competitive/build_error_enriched.py
.venv/bin/python competitive/build_gold_form.py \
  --input competitive/private/error-enriched-38.jsonl \
  --output competitive/private/error-enriched-38-gold.html \
  --title "Error-enriched natural — 38 claims" --audit-all

.venv/bin/python competitive/build_second_rater.py
.venv/bin/python competitive/build_gold_form.py \
  --input competitive/private/second-rater-60.jsonl \
  --output competitive/private/second-rater-60-gold.html \
  --title "Second rater — 60 claims" --audit-all
```

- **Error-enriched slice:** 38 provisional contradicted claims (34
  `CONTRADICTION`, 4 `INCOMPLETE`). This is a stress test, not a random natural
  sample. It does not reach 100.
- **Second-rater sample:** 60 claims — all contradicted/partial plus random
  supported/absent claims. Labels and formal verdicts are removed from the
  second-rater file.

After audit, the error-enriched slice is 26 contradicted, 4 partial, and 8
supported. Formal is **1.00 binary, 0.89 exact, 0 false accepts, 0 false
rejects, 1.00 coverage**. Exact is 0.89 because the four `partial` answers are
judged `CONTRADICTION`.

This slice is **not independent** of the 320-claim set: it is a selected
subset of the same claims. It confirms the same 26 contradicted claims and does
not move the sample-size target.

After the second-rater export:

```bash
.venv/bin/python competitive/compare_raters.py \
  --second ~/Downloads/second-rater-results.json
```

This reports raw agreement, Cohen's kappa, the confusion matrix, and
disagreements.

### Fresh 300-question candidate set

A deterministic candidate set for a question-held-out run:

```bash
.venv/bin/python competitive/build_fresh_300.py
.venv/bin/python competitive/validate_fresh_300.py
```

It writes `private/fresh-300.jsonl` and a manifest with a SHA-256. The set is:

- 120 answerable
- 60 partial
- 120 unanswerable
- 50 lookup, 25 difference, 10 sum, 15 compare, 15 extremum, 5 count,
  60 partial, 120 absence

The validator checks:

- question parses to the expected QIR kind,
- gold matches the canonical derived answer,
- evidence quotes exist in the named source,
- no duplicate of the existing 100 or within the set.

The set is **mechanically validated, not human-reviewed**. It is marked
`validation: candidate` and should be reviewed before use as a held-out set.
It has not been run on any reader yet.

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
