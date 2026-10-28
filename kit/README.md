# retrieval-kit

> **This is the kit component of the OOH citation-first benchmark.**
> The OOH results are in `README.md` and `bench/ooh-BENCHMARK.md`; the old
> historical verification-harness tables are not part of this repo.

**Layered retrieval with receipts.** Declared metadata → flash-tier
select-and-extract under a verbatim-quote contract → a free mechanical gate
with veto power. Bring your docs and your models; the contract is what
matters, not the vendor.

Current measured results are the **OOH citation-first benchmark** (root
`README.md`, `bench/ooh-BENCHMARK.md`, `bench/ARM-COMPARE-REPORT.md`).
Pre-OOH 1.0/2.0 numbers are kept for provenance under
[Historical internal baselines](#historical-internal-baselines); they are not
OOH results and are not comparable across corpora.

## Just ask a folder

The one command is `config` once, then `ask` as often as you like. This
example assumes Ollama and `qwen3.5:4b`; see **Reader model setup** below for
hosted and non-Ollama servers.

```sh
node kit/bin/retrieval-kit.mjs config --corpus ./my-docs   # seal the workspace
node kit/bin/retrieval-kit.mjs ask "What is the refund window?"
# Q: …  /  Source: …  /  gate: verified
```

> The OOH benchmark corpus is `bench/corpus/ooh-v1`; point `--corpus` at your
> own private docs for real use. Do not put private docs in this repo.

> **Bring your own corpus.** The kit is corpus-agnostic — it carries no corpus
> of its own. `config --corpus <dir>` (or a `retrieval.config.json` with a
> `source`) points it at any folder of markdown, and `ask` / `score` / `verify`
> give you your own numbers. The harness's own eval reads a **frozen snapshot**
> (`bench/corpus/ooh-v1/`) so its published numbers stay reproducible;
> yours are computed the same way, over your docs.

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
- `config --show` / `config --reset`; `--json` for machines. In this repo the
  command is `node kit/bin/retrieval-kit.mjs`.

## Reader model setup — defaults, Ollama, non-Ollama

The kit does **not** depend on Opencode. The chat boundary is OpenAI-compatible
(`/chat/completions`); Ollama is special-cased to its native `/api/chat`.
`ask` needs a model; `config` alone does not call one.

Defaults with no config or flags:

| Setting | Default | Behavior |
|---|---|---|
| Base URL | `http://localhost:11434/v1` | Assumes Ollama |
| Model | `qwen3.5:4b` | Only if the base URL looks like Ollama |
| API key | `ollama` for Ollama | Non-Ollama needs `RETRIEVAL_API_KEY` or `--api-key-env` |
| Retriever | `router` | Needs local `nomic-embed-text`; use `reference` without it |
| Tier | `source-v45` | `--quote` switches to `v45` |

There is **no default hosted model**. If you pass a non-Ollama `--base-url`
without `--model`, it fails with `no chat model`. If you pass a model but no key,
it fails with `no api key`. If Ollama is not running, the default local path
fails with a connection error; it does not fall back to a hosted model. If the
Ollama model is not pulled, Ollama returns a model-not-found error.

### Ollama

```sh
ollama pull qwen3.5:4b
ollama pull nomic-embed-text   # only for dense/router

node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1 \
  --retriever reference
```

### Hosted OpenAI-compatible

```sh
export RETRIEVAL_API_KEY="..."
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model "<model-id>" \
  --base-url "https://your-endpoint/v1" \
  --retriever reference
```

### Local non-Ollama (vLLM, llama.cpp server, LM Studio, etc.)

```sh
export RETRIEVAL_API_KEY=local   # dummy Bearer value if the server ignores auth
node kit/bin/retrieval-kit.mjs config \
  --corpus ./my-docs \
  --model "<served-model-id>" \
  --base-url "http://localhost:8000/v1" \
  --retriever reference
```

`dense` and `router` always use the local Ollama embedder
(`nomic-embed-text`), even when the chat model is hosted. Without Ollama, use
`--retriever reference`.

The benchmark reader was **DeepSeek V4.1 Flash**; `qwen3.5:4b` is the kit's
local convenience default, not the benchmark model. The kit writes `.retrieval/`
and `.retrieval-index/`; both are gitignored.

## Strict verbatim mode — opt-in

The default verifier is deliberately tolerant: case, emphasis, whitespace and
` / ` segment joins can match. For a literal verbatim claim, use:

```sh
node kit/bin/verify.mjs results.json --golden golden.json --strict
```

or `verify(item, answer, root, { strict: true })`. Strict mode tolerates only
whitespace runs and one wrapping quote pair; case, punctuation and emphasis must
match exactly, and a quote under 20 characters must be a complete line. The
default is unchanged, so the published OOH numbers keep their definition.

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
reader or the judge; the old claims ledger is not part of this benchmark-only
package. A non-authoritative lexical hint ("the answer names X, not in the window")
always prints; `--no-grounding` turns it off. A trained small local head
(Laya/ModernBERT-class) is a research direction, not part of this package.

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
over-refuses (`pokemon-experiment/ld-detect.py`, a small Python shim —
not part of this benchmark-only package; `bespoke-minicheck` needs none — it is Ollama).

`--judge-cmd "<command>"` runs any **external grounding detector** as the judge:
JSON `{question,evidence,answer}` on stdin → `SUFFICIENT`/`INSUFFICIENT` on
stdout. Example (LettuceDetect, 7/8 via the CLI — equal to the 27B):

```sh
# pokemon-experiment/ ships in the canonical tree only (needs python3 + LettuceDetect)
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
  that file); fallback/multi-file windows keep the vet. Historical
  verification-harness benchmarks and probes are not part of this
  benchmark-only package.

## Historical internal baselines

Pre-OOH, one private repo, 27 golden questions / 81 points. Kept for
provenance only — **not** OOH results and not comparable across corpora:

- **96% accuracy at ~10.5k tokens and ~13 s per question** — 6.4× cheaper,
  ~5× faster and +9 accuracy points over one coordinator model searching
  alone, with every accepted quote machine-verified (27/27).
- After the 2.0 receipt/gate fixes (tense + `Status:` receipts, multi-receipt
  legs, file-side quote scoring): **80/81 goldens · 48/48 adversarial · 43/43
  mechanical verification** on the certification run.

The public, independently readable comparison is the OOH benchmark: 27/40
answerable correct at **2%** audited wrong-shown versus **8%** for plain RAG
with citations (root `README.md`).

## Tests — the whole safety net, one command

```sh
node kit/bin/test.mjs         # 190 tests + the gate drill
node kit/bin/coverage.mjs     # the same suite under V8 coverage (npm run kit:coverage)
```

Covers every pure layer (answer parsing, evidence matching, citation
integrity, title/date resolution, source adapters with stubbed fetch,
config) and the battery's frozen contract. No model, no network. Runs in CI
(`.github/workflows/offline.yml`); add it to a local pre-commit hook if you
want it on every commit.

Coverage baseline (2026-10-20, `npm run kit:coverage`): **96.99% statements /
79.52% branches / 93.71% functions** overall, with a floor of 95% statements /
75% branches — the floor ratchets, never regresses (RN-K07).

