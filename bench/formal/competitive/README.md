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
[`PILOT-REPORT.md`](PILOT-REPORT.md).

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
