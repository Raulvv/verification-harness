# retrieval-kit

> **Ship-state reference (canonical tree — not published):**
> [`../docs/v4-read-system.md`](../docs/v4-read-system.md)
> — the single technical description of the current read-system (layers,
> contract, config, measured numbers, known limits).

**Layered retrieval with receipts.** Declared metadata → flash-tier
select-and-extract under a verbatim-quote contract → a free mechanical gate
with veto power. Bring your docs and your models; the contract is what
matters, not the vendor.

Measured origin (27 golden questions / 81 points, one real repo): **96%
accuracy at ~10.5k tokens and ~13 s per question — 6.4× cheaper, ~5×
faster and +9 accuracy points over one coordinator model searching alone,
with every accepted quote machine-verified (27/27).**
After the 2.0 receipt/gate fixes (tense + `Status:` receipts, multi-receipt
legs, file-side quote scoring) the certified numbers are **80/81 goldens ·
48/48 adversarial · 43/43 mechanical verification on the certification
run** — and the answer contract carries receipts a machine can re-check.

> **Scope of those numbers.** They are the **1.0/2.0 internal baselines**
> (one golden repo; the comparison arm is a coordinator model searching
> alone). They are **not** a claim of speed/cost over naive RAG. On external
> benchmarks the honest result is in [`bench/BENCHMARKS.md`](../bench/BENCHMARKS.md):
> the kit is the **most accurate** local arm with the only machine-verifiable
> quotes, but it is **~2× slower and ~32.5% more tokens** than one-call naive
> RAG — the receipt contract is the cost, and the differentiator is accuracy +
> verifiable citations, not speed.

## Just ask a folder

The one command is `config` once, then `ask` as often as you like:

```sh
node kit/bin/retrieval-kit.mjs config --corpus ./docs   # seal the workspace
node kit/bin/retrieval-kit.mjs ask "What is the refund window?"
# Q: …  /  Source: …  /  gate: verified
```

- Resolution is **flags → env → the nearest sealed workspace** (found by walking
  up from the cwd) **→ defaults**; `ask <dir> "<question>"` is a one-off with no
  workspace. `config` writes the seat **where you run it** (`.retrieval/`), so run
  `config` and `ask` from the same place (or pass the folder).
- The default retriever is **`router`** (dense → abstain → iterative) and needs a
  local embedder; if none is reachable it **fails loud** with the fix
  (`ollama pull nomic-embed-text`). `--retriever reference` is the explicit
  embedder-free path.
- The default contract is the shipped **`source-v45`** (a `Source` receipt, which
  the gate verifies by path/title/date). Add **`--quote`** for the full
  byte-verbatim quote (`v45`), or `--tier source-v45|v45|full`.
- `config --show` / `config --reset`; `--json` for machines. The published package
  (a later step, `docs/epicas/retrieval-kit-oss.md`) exposes the same command as
  `retrieval-kit`.

## Honest abstention — optional (`--sufficient`)

The mechanical gate proves a citation *exists*; it cannot prove the evidence
*answers the question*. That second check is a model's job. Add one:

```sh
node kit/bin/retrieval-kit.mjs ask "What is the refund window?" --sufficient --judge qwen3.5:9b
```

The judge is asked "does the retrieved evidence support the answer?", and an
`INSUFFICIENT` verdict makes the system **abstain**. It is **opt-in**, and the
judge is **explicit** because reliability scales with judge capability —
measured on the PokéAPI corpus (N=8, 5 unanswerable traps; 4B reader):

| judge | correct |
|---|---|
| none (raw) | 3/8 |
| `qwen3.5:9b` (local) | 5/8 — too lenient, accepts fabrications |
| `qwen3.8-27b` (local) | **7/8** |
| independent hosted judge | **7/8** |

Cost: ~+0.8 s (9B) to ~+12 s (27B) per answer. The residual failure is
**architectural** (counting across documents is beyond a single window), not the
reader or the judge — see
[`../docs/epicas/retrieval-claims-ledger.md`](../docs/epicas/retrieval-claims-ledger.md)
(canonical tree — not published; in the shipped copy the excerpt is
[`../retrieval-claims-ledger.md`](../retrieval-claims-ledger.md))
B57. A non-authoritative lexical hint ("the answer names X, not in the window")
always prints; `--no-grounding` turns it off. The next lever is a **trained small
local head** (Laya/ModernBERT-class) to drop the 27B/hosted judge — see
[`../docs/hypotheses/2026-09-24_self-improving-decision-seat.md`](../docs/hypotheses/2026-09-24_self-improving-decision-seat.md)
(canonical tree — not published).

**Pretrained grounding judges (no training needed).** Small fact-checking models
plug in the same way: `--judge bespoke-minicheck` (Ollama) is auto-detected and
uses its `Document:`/`Claim:` → `Yes/No` format. On the same PokéAPI fixture
(4B reader): `bespoke-minicheck` **6/8**, `qwen3.5:9b` 5/8, `qwen3.8-27b` 7/8, an
independent hosted judge 7/8. MiniCheck catches the fabrications but over-refuses
one paraphrase ("pre-evolution" vs the document's "Evolves from"). A grounding
detector like it (LettuceDetect, MiniCheck, or an NLI cross-encoder) is the
local-first path with no 27B and no trained head. Measured: **LettuceDetect-base
(ModernBERT 150M, MIT, local) 7/8 — equal to the 27B and hosted judges**, and it
handles the "pre-evolution" = "Evolves from" paraphrase that MiniCheck
over-refuses (`pokemon-experiment/ld-detect.py`, a small Python shim;
`bespoke-minicheck` needs none — it is Ollama).

`--judge-cmd "<command>"` runs any **external grounding detector** as the judge:
JSON `{question,evidence,answer}` on stdin → `SUFFICIENT`/`INSUFFICIENT` on
stdout. Example (LettuceDetect, 7/8 via the CLI — equal to the 27B):

```sh
node kit/bin/retrieval-kit.mjs ask "…" --sufficient \
  --judge-cmd "python3 pokemon-experiment/ld-detect.py --stdin"
```

The judge is handed the **receipt's own evidence** — the verbatim quote, or the
cited document's question-relevant lines (a few hundred chars), never the whole
window. That is both the right question ("does *this* evidence support the
answer?") and what makes a small local detector transfer across corpora: bound
the evidence, and LettuceDetect agrees with a 27B judge **8/8** on a different
domain (Naruto) where the whole-window version managed 4/8 (`judgeEvidence` in
`kit/lib/receipts/evidence.mjs`; ledger B60).

**It is not free, and it is not a default.** On a **synthesis** corpus (the
Confluence battery: long pages, prose answers) the same gate over-refuses badly —
raw **18/23 correct → 10/23 gated**, with **10 false abstentions**: a strict
grounding detector refuses a correct synthesized answer when the bounded evidence
slice does not literally contain the support (ledger B61). And passing the
answer's **own verbatim quotes** does not fix it: on the `v45` tier the gate still
refused 8–9 of 17 correct answers (LettuceDetect 17→12, an entailment NLI model
17→10), because a synthesized answer legitimately exceeds the one–three quoted
lines — the judge's **granularity** (one quote vs the whole answer) is wrong for
synthesis, whatever the judge family (ledger B62). So `--sufficient` stays
**opt-in**: it helps extractive answers over small, well-shaped evidence (PokéAPI
7/8) and hurts synthesized answers over long pages (Confluence 18→10). Decide per
corpus/task; do not turn it on globally.

## The architecture

```
question
   │
   ▼
① SUBSTRATE — INDEX.md + Status/Since/Answers headers   · 0 tokens, 0 s
   "what's relevant" is a LOOKUP, not a search            (bootstrap.mjs)
   │
   ▼
② WINDOW — the question's words pick a small candidate   · free, instant
   set; a cheap model call vets it for fit        (corpus/locate · answer/window · answer/vet)
   │
   ▼
③ ANSWER — one model call reads the window and writes    · 1 call
   the prose; the receipt (Q / Source / Quote) is  (answer/oneshot.mjs)
   assembled mechanically from the verbatim quotes
   │
   ▼
④ SCORE / GATE — three points (verdict/path/quote);      · free, instant
   the gate re-checks a citation against the file  (receipts/score · receipts/gate)
```

> ① **Substrate is optional.** The diagram is the full 1.x/2.x layered kit.
> In the current **System 3.0 (citation-first)** the substrate is dropped —
> dates/titles are auto-resolved and there is no `INDEX.md`/header requirement
> (see *System 3.0* below). The kit works either way; guidance is a corpus
> choice, not a mandate.

## Choosing a source — one line in the config

The engine only ever sees **files**; the source decides how the corpus
becomes files. That is the entire difference:

```jsonc
"source": "local"                       // the repo you are standing in
"source": "https://naruto.fandom.com"   // an external site — mirrored locally
"source": { "type": "url", "url": "…", "limit": 300,
            "include": ["Page A", "Page B"], "delayMs": 350 }
"source": { "type": "confluence", "url": "https://<site>.atlassian.net",
            "space": "DEMO", "limit": 50, "delayMs": 350 }
```

Run `retrieval-sync` and the corpus materializes under
`.retrieval-mirror/<host>/` as markdown + `.meta.json` sidecars carrying
the **source's own title and last-edited date** (never regenerated ones).
Adapters: `mediawiki` (fandom/wikia/wikipedia-shaped), `flat` (a list
or index of files over HTTP, dates from `Last-Modified`), and
`confluence` (one space, via the official `twg` CLI — dates from the
page's own version history; auth lives in `twg`'s config, never here;
`twg` must be on `PATH`). Same config shape throughout — nothing
downstream changes.

## Embeddings — the default retriever's one local dependency

The default retriever is `router` → **dense**, which ranks the corpus with
local embeddings. That needs a local [Ollama](https://ollama.com) serving an
embedding model:

```sh
ollama pull nomic-embed-text     # the default embedding model
```

- `OLLAMA_URL` (default `http://localhost:11434`) — where the embedder lives.
- `RETRIEVAL_EMBED_MODEL` (default `nomic-embed-text`) — the model.

Embeddings are local-only: no network beyond localhost. The `reference`
retriever (exact title/heading match) needs no embedder — `--retriever
reference`, or set `cfg.retriever`, for a fully embedder-free run.

## The one-pager recipe

```sh
cp kit/retrieval.config.example.json retrieval.config.json   # pick your models
node kit/bin/bootstrap.mjs --apply --hook                    # 1. substrate
#    fill each TODO "Answers:" cell (one question per doc — human work)
$EDITOR golden/golden.json                                   # 2. golden set (GOLDEN.md)
node kit/bin/ask.mjs --golden golden/golden.json --config retrieval.config.json \
    --out .retrieval-results/golden.json                     # 3. the one-shot machine
node kit/bin/verify.mjs .retrieval-results/golden.json --golden golden/golden.json
node kit/bin/score.mjs  .retrieval-results/golden.json --golden golden/golden.json
```

Day 0 substrate · Day 1 golden · Day 2 measure → adopt the Pareto winner.
Accuracy beats cost at every fork.

## The rules this kit encodes

1. **The quote must be verbatim** — a receipt a machine can check beats a
   model's confidence. `NOT FOUND` is a first-class answer.
2. **Mechanical verify is the only gate** that can reject. Models flag.
3. **The model never grades its own homework** — labels need independent
   truth.
4. **Measure, don't mandate** — forcing "start from the index" dropped a
   45/45 retriever to 36/45. Keep every mandate behind an experiment.

## What you bring

| | |
|---|---|
| **Docs** | any markdown tree; `bootstrap.mjs` gives it headers + an index |
| **Models** | any `/chat/completions` endpoint (hosted, Ollama, vLLM): one flash-tier retriever |
| **Golden set** | your real questions — `GOLDEN.md` is the protocol |

Boundary, honestly: the system answers **extractive questions over a stable
corpus** — answers that can be quoted. For synthesis, the gate can verify
citations but not conclusions. For mutating corpora, pin snapshots.

## Layout

```
kit/
  index.mjs   the public facade (the only supported import; frozen by test)
  bin/        bootstrap · manifest-check · sync · ask · score · verify · test · coverage
  lib/
    config.mjs · model.mjs · cli.mjs
    retrieval/  window · dense · vet · locate · terms · embed
    answer/     prompt · parse · assemble · oneshot
    receipts/   text · cite · gate · score · results
    corpus/     source · html · twg · meta
    text/       stopwords · morph · walk   (shared primitives)
  GOLDEN.md   how to author the ground truth
```

## System 3.0 — citation-first (current)

The receipt is a **citation**, and the system reads nothing hand-written:

```
Q: <answer — one line>
Source: <the document's own title> · <path:line>
Quote: <verbatim line(s)>
```

- **Dates and titles are auto-resolved** (sidecar `.meta.json` → git →
  file mtime; title from front-matter/H1/filename) — no headers, no index,
  no declared guidance required. Works on any corpus that can become files.
- **The gate verifies the whole citation** — quote verbatim at the path,
  title not fabricated, claimed date either the resolved one or one the
  document itself carries. Lying citations reject.
- **Freshness is the reader's judgment** — the title and date are always
  shown; old-but-valid vs new-but-dead is not something metadata can
  decide, and the system doesn't pretend otherwise. (If accuracy on some
  corpus ever needs it, the setup conversation may *ask* whether the
  consumer has an archived/active distinction — optional input, never a
  requirement.)
- Measured: goldens 45/45 · attack 43/48 · supersession 8.3/9 · mechanical
  109/112 — the cost of dropping guidance is ~5 points on figure-brittle
  trap questions and nothing else. The 2.x annotated configuration remains
  available (`system-2.x` tag) for corpora we own and label.
- **Speed note (2026-10-01):** `askOneShot` skips the vet when the reference
  layer resolves the question to ONE named file (the window is already just
  that file); fallback/multi-file windows keep the vet. External benchmarks,
  the latency profile and every probe live in
  [`bench/BENCHMARKS.md`](../bench/BENCHMARKS.md) and `bench/RESULTS.md`.

## Tests — the whole safety net, one command

```sh
node kit/bin/test.mjs         # 153 tests + the gate drill
node kit/bin/coverage.mjs     # the same suite under V8 coverage (npm run kit:coverage)
```

Covers every pure layer (answer parsing, evidence matching, citation
integrity, title/date resolution, source adapters with stubbed fetch,
config) and the battery's frozen contract. No model, no network. Runs in the
pre-commit hook **and in CI** (`.github/workflows/ci.yml`).

Coverage baseline (2026-10-06, `npm run kit:coverage`): **97.4% statements /
80.7% branches / 95.0% functions** overall, with a CI-enforced floor of 95%
statements / 75% branches — the floor ratchets, never regresses (RN-K07).

