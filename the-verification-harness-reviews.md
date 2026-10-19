# The Verification Harness — Review Record

External review rounds for `articles/the-verification-harness.md` (canonical
tree — in this shipped copy the article is
[`the-verification-harness.md`](the-verification-harness.md) at the repo root),
run 2026-10-15. Kept because the reviews are more than a score: the
fix-finding rounds shaped the article, and round 4's adoption answers are
product signal for the kit and the philosophy.

**Format.** Three personas per round, always free models on opencode-go,
fresh sessions, max 3 concurrent subagents:

| Persona | Lens |
|---|---|
| RAG practitioner | adoption Monday, cost, Python/hosted stack, anti-theater |
| Eval skeptic | statistics, metric definitions, contamination, may recompute offline from `unified.jsonl` (inline `node -e`, no writes, zero model calls) |
| Production/infra | p95, memory, determinism in CI, deployment overreach |

Models: qwen3.8-flash, glm-5.3-flash, deepseek-v4.1-flash (one session each
per round). Each round audits the previous round's fixes before scoring, so
scores only move when the fix landed. Round 14 broke the format: the
opencode-go credentials had lapsed, so the owner commissioned a single
standalone session — one reviewer carrying all three lenses against a fresh
clone of the shipped tree (score 8.5, publication not blocked).

## Score trajectory

| Round | RAG practitioner | Eval skeptic | Production/infra | Commits |
|---|---|---|---|---|
| 1 | 7 | 6.5 | 5 | `cd2f1f2` (article first published) |
| 2 | 8 | 8 | 7 | same |
| 3 | 9 | 9 | 8 | `d1fef6f` |
| 4 | 9 | 9 | 8 | `ab35ad0` (ledger R5/R3), `6d10150` (round-4 fixes) |
| 5 | 9 | 8.5 | 9 | `c76d4c6` (round-5 numbers audit) |
| 6 | 9.5 | 9 | 8.5 | `8e9f4df` (round-6 shipping fixes) |
| 7 | 9.75 | 9.5 | 9 | `4ce7955` (B97 correction), `cc5865a` (record/G1), `f47bbc3` (fresh-clone recompute), `7ee4b14` (§5 notes) |
| 8 | 9.5 | 9.5 | 9.5 | `ac7ebb1` (round-8 fixes) |
| 9 | 9.5 | 9.75 | 9 | `55b4a81` (round-9 fixes) |
| 10 | 9.75 | 9.75 | 9.5 | `66db179` (round-10 fixes) |
| 11 | 9.75 | 9.75 | 9.75 | — (zero-finding confirming round) |
| 12 | 9.5 | 9.5 | 9.5 | `155a935` (round-12 fixes) |
| 13 | 9.75 | 9.5 | 9.8 | `bf58c47` (round-13 nits) |
| 14 † | — | 8.5 † | — | `b7dc3df` (round-14 fixes) |
| 15 † | — | 9.0 † | — | `5670a8a` (round-15 fixes) |
| 16 † | — | 6.5 † | — | `a0e03b3` (round-16 fixes), `5555c8e` (pointer) |
| 17 † | — | 8.5 † | — | `d20cd99` (round-17 fixes) |

First unanimous round on both axes: same score (9.5) from all three, and the
first time every persona answered `Publication blocked: no`. Rounds 9–11 kept
the second axis: four consecutive all-clear rounds; rounds 10 and 11 the first
with zero blockers and zero should-fixes. Round 12 — the amendment's belated
panel — kept publication unblocked with two should-fixes, both applied. Round
13 returned to zero blockers and zero should-fixes from every persona (eight
nits, three applied). Round 14 († solo session) scored 8.5 with publication
not blocked — the first evaluation of the shipped export itself, a fresh
clone executed end to end — and returned three should-fixes and two nits,
all applied in `b7dc3df`. Round 15 († solo session) scored 9.0 with
publication not blocked: all five round-14 fixes verified landed, and it
returned one should-fix — the corpus manifest pinning the stale staging
copies of the two kit files round 14 had edited — plus four nits (stale
"not yet public" residue, the `ci.yml` badge, kit's 101-test comment, two
unlabeled canonical citations), all applied in `5670a8a`, the should-fix
now guarded by a shipped-tree pin test. Round 16 († solo session) scored
6.5 with publication **blocked** — the first blocked round since round 1 —
on one blocker it proved against the shipped tree: §3.5's B108 headline had
inverted the audit's polarity (claiming 14 of 16 wrong / 87.5% false-verify
against the committed 14 gold-correct / 2 wrong = 12.5%), which also
poisoned the round-14 range (21%–87.5% → honest **12.5%–56%**),
`report.md`'s erratum, the shipped ledger's B108 cell and B111's
parenthetical. Its should-fix — zero machine joins on the audited [report]
cells despite shipping the audit files — plus the stale closing pointer
were applied in `a0e03b3`/`5555c8e`: every prose surface restored, the
excerpt extended to B95–B118, and `verify-offline` grown to 211 claims (23
audited-share joins, non-vacuity proven by re-inverting the article).
Round 17 († solo session) scored 8.5 with publication **not blocked** —
all three gates green on a fresh clone (211/211 claims pre-batch, kit 153,
traceability 9/9, 8/8 pins, privacy pass) plus ~40 independent
hand-recomputes — and returned two should-fixes (README promising offline
recomputation of *every* BENCHMARKS cell over a five-artifact HotpotQA
backing; the "~25% more tokens" figure reading 32.5% off its own
2044/1543) and five labeling nits, all applied in `d20cd99`;
`verify-offline` now guards the corrected figure (212 claims).

Convergence note: in round 4 all three reviewers independently found the same
defect (the unbacked `127/140` gpt-oss count surviving in §2.2 after being cut
from §3.3) and all three said it alone blocked the next score — one class of
bug, three finds, which is itself evidence the earlier rounds' rigor transferred.

## What each round found → applied

**Round 1** (draft audit, 18 edits): lede speed/memory reconciliation
(~2.4× e2e / ~4.7× reader-only / 56% memory), private cell 28% → 57% (+29pp),
B96 false-accept audit surfaced (leaky-gold upper bound, 11/15), B95 single-pass
and judge-timing provenance disclosed, kimi AUROC pools split by itemset,
middle band 19/29 and marginal-hides 0-for-9 added, §3.1 audit labeled
model-done, ±1–2pp marked heuristic.

**Round 2** (~17 fixes): middle band wording ("unsure about, or failed to
score"), dice-rolls scoped to nondeterministic judges, hides-23 denominators
corrected (raw already hid 14), B97 metric defined (decision accuracy,
show-nothing = 50% floor, best cutoff under the same coverage cap), kimi
AUROC pools split at every use site (B110 N=127 subset 0.825–0.862 mean 0.844
vs B107 N=200 single-pass 0.910 vs B106 paired 0.861/0.849 tie), §5 opened
with "prices the eval loop, not a service", judge-timing provenance (HotpotQA
exports store no judge seconds; private ~8.2 s disclosed), 27B-judge purchase
softened (12 vs 9 directional), §6.5 oracle-never-k-repeated clause, §6.8
tag-not-digest pinning hole, lede "(not yet public — §2.7)".

**Round 3** (9 fixes, `d1fef6f`): lede recomputability scoped to
**[recomputed]** numbers — both 9-scorers called this mandatory pre-publish
("a verification article that fails its own verifiability claim is the one joke
it cannot afford"); [ledger] tag restated as "named script or documented
re-grade"; eval-loop qualifier on lede timings; ~0.04–0.09 AUROC band split
into fixed-itemset inter-pass vs cross-pool; kimi judge named in §3.2;
0.910-vs-0.861 gap named "the dice-roll point"; gross/net flip terms defined;
`bench/oracle-vs-contains.mjs` added (B103(a) 88.1%/κ 0.522 had no named
backing script — now reproduces exactly, n=286).

**Round 4** (7 fixes, `ab35ad0` + `6d10150`): §2.2 `127/140` cut (the last
unbacked count; B107 struck with correction note — sweep results file did not
survive); ledger B113 false-accept 16 → 14 (recomputed from b113); B114
restated from corpus v3 runs b117/b118 — the previous v1-era deepseek numbers
(88% acc, FA 9, partial 63%) matched **no run in the artifact**; B113's 81%
given its shown-denominator (74/91) at every use after two reviewers resolved
the ambiguity in opposite directions; B114's HotpotQA-vs-private comparison
rebuilt on the matched 9B judge (94.8% → 84.8%); unquantified "wider across
itemsets" clause cut; §3.2 tri-state flags stated (3-of-4 and 4-of-5 sit on
unanswerable fabrications); lede ratios tagged eval-loop.

**Round 5** (scores 9/8.5/9, `c76d4c6`): all seven round-4 fixes verified
landed by all three. The round moved from wording to execution, and its most
useful outcome was **two of the eval skeptic's three headline findings
disproved by re-measurement**: §3.4's deepseek 92.6%/7 cell was flagged as a
stale artifact — re-running the kimi re-oracle `b103b` join gives 88/95 with
verified-wrong 7, exactly the published cell (the reviewer's join was the bug);
and B97's cutoffs were flagged as not re-derivable from the pinned artifact —
replicating `bench/hotpot-baselines.mjs`' logic over `unified.jsonl`
re-derives every published cell exactly (55.3%/83.5%, 71.7% at 41.5%, 64.2% at
52.2%) — the export's `reader_correct` column is `oracle_correct` under its
generation-time name, notwithstanding — recorded as a field-hygiene note in
B97, not an article change; the drift counts recorded alongside it (282/600
top1, 102/600 labels) were later shown by round 7 to be an id-only join bug
(both fields match the artifact exactly under a composite (id, condition)
join), and the note was corrected. The third finding was real: `reproduce.md` compared B113's
verified-only cell (83.7%, 72/86) against the ledger's shown-denominator cell
(81%, 74/91) and called the gap "oracle nondeterminism". The numbers audit
added the rest: B109's 4B+kimi row still printed the §4 clobber's deepseek
numbers (88/92/92.6/7/3.5 s → genuine 97/85/91.2/8/2.97 s) with `false-accept`
used where §3.4 says verified-wrong; B110's "gated false-accept is 7 (not 5)"
conflated three b104 counts (pooled verified-wrong 7 = 2 answerable + 5
unanswerable, false-accept 9, raw 11); three correction notes dated 2026-10-16;
§1 attributing the 97.7% HotpotQA cell to the kimi judge when it is
self-judged (kimi's re-oracle reads 98.1%); and B114's reproduce rows still
verifying the struck v1 numbers — restated onto `private-4b-v3.jsonl` /
`private-deepseek-v3.jsonl`, every cell re-verified against `b117`/`b118`
(side-file ↔ run bindings: `private-4b-full` ↔ `b113`).

**Round 6** (scores 9.5/9/8.5, `8e9f4df`): all seven round-5 fixes verified
landed by all three, and the skeptic re-discharged both round-5 disputes from
the artifact — §3.4's deepseek row re-derives at 88/92/92.6/7 (the stale-cell
charge does not reproduce), B97's three cells re-derive from `unified.jsonl`,
and ~40 further cells across §1/§3/§5 recomputed clean (intervals, flip-rate
arithmetic, private cells, timings). A third skeptic claim — that B97's
hygiene counts do not reproduce (they reported 0/600 differences) — was
initially rebutted with a re-measurement that joined on `id` alone (282/600
top1, max Δ0.5004, 102 label disagreements, 2×2 = 395/73/103/29; their
"468/132 agreement" called `oracle_correct`'s base rate — a self-join slip).
Round 7's composite (id, condition) join settled it **the skeptic's way**:
0/600 on both fields (2×2 = 468/0/0/132); the id-only join had paired each
answerable row with its unanswerable twin (both conditions share the id), so
the round-5/6 counts were struck from B97 — the skeptic was right twice over,
and the rebuttal carried the very bug class it accused. The round's real
findings were
**operational and consensus-grade**: the article's own one-line provenance
check printed **FAILED** — round 5 edited `reproduce.md` without re-pinning it
in `unified.jsonl.sha256`, so the first ritual a reader runs was red (all three
reviewers hit it; re-pinned, `shasum -a 256 -c` green again) — and
`reproduce.md`'s end-to-end block still reported the pre-fix 88/92/92.6 row as
a live ⚠️ mismatch while `bench/end-to-end.mjs` and ledger B109 had both been
corrected to 97/85/91.2/8 (block rewritten; the clobber history kept to one
line). Notes applied in the same commit: B108's answerable false-abstention
labeled raw (1%) with its gated value (2%); B110's "false-accept
(unanswerable shown)" renamed to unanswerable-shown (9 = 5 verified +
4 unverified, cross-linked to §3.2's false-accept cell) so no fourth
false-accept sense enters the taxonomy; §3.6 given an oracle footnote (the
deepseek row is self-oracled — no independent private re-oracle exists, and
HotpotQA's analogue moved only +0.4pp under kimi); §5's determinism claim
scoped to "same stored reader outputs" (reader determinism unmeasured, tags
pinned by name — §6.8); §5's "no p95 … were measured" corrected to "are
reported" (per-record times are in the artifact; means are what we quote).
Deferred as noted, not defects: the bench scripts' `false_accept` console
label means verified-&-wrong and collides with the article's false-accept
sense — §4 already forces definition-at-use, and renaming would desync script
output from the ledger rows that quote it.

**Round 7** (scores 9.75/9.5/9, `4ce7955`·`cc5865a`·`f47bbc3`·`7ee4b14`): all
seven round-6 fixes verified landed 3/3 — all three ran `shasum -c` (green),
re-ran `bench/end-to-end.mjs` live (matches the rewritten block to the digit),
and confirmed the B108/B110/§3.6/§5 wording. RAG: publish-ready as-is, zero
should-fixes (its own first Wilson recalculation was wrong, the article right).
The round's decisive result was **settling the B97 dispute that had run since
round 5 — against the record's own counts**: the skeptic's composite
(id, condition) join measured 0/600 top1 and 0/600 label differences (2×2 =
468/0/0/132, printed rows equal), and re-running the record's id-only join
re-derived exactly the 282/102 counts it had stood on — each answerable row
had been paired with its unanswerable twin (both conditions share the id).
`reader_correct` is `oracle_correct` under its generation-time name; `top1` is
reader-independent and identical across b95/b102/b103b. The counts were struck
from B97, G1 and this record; the published cells were never affected (they
re-derive single-file from the artifact — both joins and the retargeted sweep
agree: 55.3/83.5, 71.7 at 41.5, 64.2 at 52.2). Production/infra's should-fix
(the only formal block) closed the packaging gap: the article promised
regeneration from `unified.jsonl` while the `reproduce.md` snippets and
`end-to-end.mjs` read gitignored `bench/results/**` and keyed
`reader_correct` (0 occurrences in the artifact vs 4500 `oracle_correct`) —
snippets and both scripts are artifact-first now (fresh-clone recompute
verified cell-identical on B95/B102/B104/B105/B108/B109/B113/B114), side-file
blocks labeled inline, §7 item 5 and the closing note scoped to [recomputed]
tables, manifest re-pinned green. Notes applied: §5's deepseek row carries the
§3.6 self-oracle caveat at the point of sale; the workhorse prices its
private-corpus advice (~22 s/question = 14.1 s reader + 8.2 s judge, vs the
HotpotQA 8.5); GB figures defined as nominal quantized model sizes, not
measured RSS; the clobber history compressed to one past-tense sentence.
Deferred-noted: Python/hosted adopters must lift the judge prompt and schema
out of the `.mjs` sources (acknowledged boundary, not a defect).

**Round 8** (scores 9.5/9.5/9.5, `ac7ebb1`): all six round-7 fixes verified
LANDED 3/3, with every reviewer executing the full fresh-clone ritual —
`shasum -c` green, `end-to-end.mjs` + `hotpot-baselines.mjs` cell-exact from
committed files only (`git ls-files bench/results` = 0; `reader_correct` = 0
occurrences in the artifact), both reproduce.md snippets byte-identical to
their recorded tables. The skeptic re-proved the B97 forensics from both
directions: composite (id, condition) join 0/600 (2×2 = 468/0/0/132), id-only
join 282 top1 / 102 labels — "exactly the struck numbers, correctly struck" —
plus b103b≡b102 identity and the Wilson intervals. **First unanimous round on
both axes**: 9.5 from all three, and the first time every persona answered
*Publication blocked: no* (RAG: "publish-quality with a should-fix footnote";
skeptic: residuals are "disclosure-level blemishes … neither touching any
published number's truth"; infra: fresh-clone recipe "every cell matched
byte-for-byte"). Findings, both applied in `ac7ebb1`: RAG's should-fix —
`bench/private-gen.mjs` defaults to hosted `GEN_MODEL=kimi-k3`, so §7 step 1
would have regulated corpora egress gold excerpts while building the corpus
(disclosed at the step now, with the `GEN_MODEL`-local instruction); the
skeptic's should-fix — `end-to-end.mjs` computed the raw 27B row's `11` as
answered-and-wrong while its legend said verified-and-wrong (legend corrected,
reproduce.md footnotes the split, the missing b103b fifth row noted). Notes
applied: §3.3's equivalence table tag narrowed (judge-only cost restamped
sweep/[ledger] at nominal sizes — `seconds_judge` is null on every HotpotQA
artifact row); §4's "5 vs 11 vs 7" mapped value-to-counting-rule; §5's
deepseek row priced on both corpora (3.5 s HotpotQA / 6.9 s private reader
mean); reproduce.md's `judge`-field name and B105-4B+kimi derivation noted.
Deferred-noted: RAG's Python-port expectation (the discipline travels free,
the implementation is a port — §7 already frames the method as the artifact).

**Round 9** (scores 9.5/9.75/9, `55b4a81`): the confirming round on the
round-8 batch — 5/6 LANDED (RAG and skeptic both 6/6) plus infra's one
PARTIAL, and the second consecutive round with `Publication blocked: no` from
all three (skeptic: "the article's measurement claims are, as far as the
artifact can arbitrate them, correct"; ~60 cells re-derived with zero failures,
including the 5/11/7 triple and the `seconds_judge` nulls independently).
Infra's PARTIAL and RAG's converging should-fix were both about §7 step 1's
new generator warning: the disclosure said derived question/gold excerpts
egress, but the script sends the **raw doc text** (each sampled doc's title +
first ~3,000 characters, up to 4N attempts), and `private-gen.mjs` read
`~/.local/share/opencode/auth.json` unconditionally *before* routing — so the
very local-`GEN_MODEL` instruction the warning gave crashed ENOENT on an
air-gapped box, making "costs nothing" false there. Fixed in `55b4a81`: the
credential read is now behind `isHosted` (new subprocess test proves local
route = no credential file, hosted route still reads one; guard mutated → red,
reverted → green), and the §7 paragraph now describes the real payload, names
a concrete routing-safe example (`qwen3.5:9b`, with the qwen3.6+ hosted-list
caveat), and adds the gold-quality re-check the script header already records
(the older local 9B produced terse, inconsistent golds). Notes deferred-noted:
skeptic's ledger B105 "~14 s/record" vs §5's ~22 s (two different judge-timing
sources; needs its own adjudication before either number moves); infra's
§3.4-deepseek-row-has-no-shipped-command (reproduce.md already discloses the
fifth row, and the skeptic recomputed it exact).

**Round 10** (scores 9.75/9.75/9.5, `66db179`): confirming round on the
round-9 batch — 3/3 LANDED by all three personas (both offline spawn
scenarios executed, the subprocess test confirmed CI-wired and non-vacuous,
the §7 payload sentence checked line-by-line against `TRUNC`/`GEN_PROMPT`/the
`4N` retry cap), and the first round in the whole audit with **zero blockers
and zero should-fixes** from every persona — notes only. The skeptic ran the
largest recompute battery yet (~35 cells across every §3.3/§3.4 row, the B97
baselines, the matched-judge private pair) with zero failures; RAG called §7
step 1 "the most trustworthy adoption instruction in the piece"; infra's
fresh-clone sweep stayed cell-exact end to end. Two notes were applied in
`66db179`: infra's fail-safe routing — a name matching the hosted list but
looking like an Ollama tag (`name:tag` / `namespace/name`, e.g. a bare
`qwen3.8:4b`) now routes local with a warning instead of silently egressing
doc text (third subprocess test, mutated guard → red, reverted → green); and
the skeptic's return-payload clause — §7 now says the generator returns
question, gold answer, and the two gold-facts. Deferred-noted: RAG's
TRUNC-is-env-overridable framing caveat (covered by "mind its default"), the
hypothetical future `qwen3.9` hosted name (routes local — fail-safe
direction, leak-proof), and the ledger B105 "~14 s/record" timing cell
(re-confirmed unarbitratable: `seconds_judge` is null on 100% of HotpotQA
rows).

**Round 11** (scores 9.75/9.75/9.75 — the final confirming round; no fixes
were required of the round-10 batch): 3/3 LANDED by all three personas with
executed proof — both offline spawn scenarios re-executed, the fail-safe guard
re-verified live (warning + local routing for `qwen3.8:4b`, hosted intact for
`kimi-k3`, the article's `qwen3.5:9b` example unchanged), the third test
confirmed non-vacuous, and the §7 return-payload clause matched against
`GEN_SCHEMA` — plus the final fresh-clone sweep, green end to end. First
unanimous 9.75; infra wrote "Approve for publication"; RAG called the round-9
batch "the most trustworthy adoption instruction in the piece". Notes only,
none blocking: RAG's cosmetic preview of the tag-warning in §7 prose; the
skeptic's tool-hygiene find — `private-gen.mjs` deleted an existing default
`OUT` at the `nPairs=0` smoke path (fixed post-hoc in `eff451d` with a fourth
subprocess test, not re-paneled); infra's bare `qwen3.8*` hosted-route
residual, judged inherent and registered in
`archive/tooling/retrieval-known-issues.md` (`e9b78b4`).

**Post-audit amendment (2026-10-16, owner-directed, not re-paneled).** After
the loop stopped, the judge sweep was re-run with token capture
(`03bcbac`): local judges reproduce their AUROCs to the third decimal while
kimi re-scores 0.855 — the drift claim in §3.3's repeats now has a same-protocol
replication, and §3.3 gained a priced dial table (tokens/call, marginal $/1k)
from that run's ledger addendum (`86c2b2e`), with the reference machine
disclosed everywhere absolute seconds appear (MacBook Pro M4 Max, 34 GB RAM;
hosted dollars an estimate at zen's posted rate). Evidence chain:
[ledger B107]
re-run, script committed, results file gitignored but re-derivable by
re-running. No [recomputed] cell was touched; the manifest files were not
touched (the article itself is not manifest-pinned).

**Round 12** (scores 9.5/9.5/9.5, `155a935`): the amendment's belated panel —
all three approved (infra: "Approve for publication"; skeptic: "every number
in the new §3.3 block reproduces from the named evidence"), with the table's
arithmetic and protocol surviving line-by-line recomputation (tokens, AUROCs,
s/rec rounding, the $7.43/1k derivation, pool identity n=127, the [ledger]
tag class correct, no [recomputed] cell moved). The skeptic's should-fix was
the round's sharpest catch and a repeat of B107's own recorded failure mode:
the re-run's results file was gitignored *and* unconditionally overwritten by
the script's next run — one smoke away from destroying the only measured
token evidence for a published table. Fixed: the file is committed
(force-added past the gitignore) and `judge-sweep.mjs` refuses to overwrite
it without `FORCE=1` (guard proven live, fails before any model call). RAG's
should-fix: the upshot's "the local judge *is* the egress rule" compressed
§5 past what it proves — a hosted reader still egresses on the query leg —
now scoped to "closes the judge leg; with a local reader the whole stack is
the rule". Notes applied: ~$7.40 → ~$7.43 aligned across article, ledger B107
and G1; the re-run's s/rec logged in B107 so the table's s/rec column
resolves to its tag; the equivalence footnote disambiguated (original sweep
vs re-run); the drift sentence's band given its B110 tag; the "(§6)"
timing pointer corrected to §5; "track machine load" softened to "varied
with machine conditions" (the load attribution was inference, not data).

**Round 13** (scores 9.75/9.5/9.8, `bf58c47`): the confirming panel of the
round-12 batch — all three publication-not-blocked, zero blockers and zero
should-fixes from every persona. The skeptic re-derived the priced table end
to end (tokens exact per p+c sum-checks, AUROCs exact, s/rec half-up
rounding, the $7.43/1k at 1,592×$3 + 177×$15 per 1M, pool identity n=127
including confirmation the abstention filter predates the re-run, zero stale
$7.40 anywhere) and marked both round-12 should-fixes fully closed — the
guard refuses live before any credential read, the evidence blob
byte-identical to the commit. Production proved the fresh-clone chain
(`git ls-files`, `check-ignore --no-index`, blob sha, manifest green) and
verdict: the priced table is self-sufficient from a clone; the sweep is
readable but not offline-re-derivable without the gitignored input and judge
models — now documented in B107. Claims-fidelity found all six reworded
spots faithful; its two nits lexical (the egress decomposition defines
itself; "machine conditions" is the ledger's own parenthetical carried
forward). Eight nits total; three applied in `bf58c47`: `judge-sweep.mjs`
gained a `SWEEP_OUT` override with cwd-independent paths (§7 adopters
grading their own outputs no longer touch the pinned evidence; both escapes
named in the refusal message; root, off-root, and override paths proven to
refuse before any model call), B107's addendum now states the graded pool
(127 of 200 after 73 abstentions) and the gitignored-input note, and one
104-char line re-wrapped. Five left as-is with rationale: the record's
pre-round-12 "gitignored but re-derivable" sentence (chronological log,
superseded in place by the round-12 paragraph immediately below),
check-ignore's tracked-file behavior (methodology, not a defect), the
B107-scoped N=200 (the original equivalence scope, clarified by the new
pool clause), and the two lexical fidelity nits. No [recomputed] cell or
manifest file touched.

**Round 14** (solo session, score 8.5, `b7dc3df`): the first evaluation of the
*shipped* tree — a fresh clone of the export candidate (single root commit
`23346f7`) executed end to end: `verify-offline` 188/188 with the artifact
pin matching, kit tests 153 green, traceability 9/9, six path-formatted
pins checked by hand, both article copies byte-identical to each other and
to the canonical source, privacy grep (task gate + CI pattern) zero hits,
and 15 hand spot-checks of article cells against the pinned artifacts
(B95/B108/B109/b119/b120/b121/sweep/cost) all resolving. Run in place of
the planned three-persona panel after the opencode-go credentials lapsed
(owner redirected); one reviewer carried all three lenses; publication not
blocked. Three should-fixes, all applied in `b7dc3df`: the lede's, §6.1's
and the README's superseded "all of them are wrong" quantifier replaced
with the audited 21%–87.5% false-verify range (§3.5 measures 87.5% on the
audited B108 arm, §3.6 measures 56% and 21% — the body had already
retracted the forced-0 phrasing, the headlines kept it); kit/README's three
`../docs/` pointers labeled canonical-tree-not-published (the ledger link
also names the shipped excerpt `../retrieval-claims-ledger.md`); and the
closing provenance note plus §7 step 5 repointed at the shipped artifact
(`bench/results/unified-public.jsonl` + `.sha256`, `88165f6f…`) with the
one-line ritual runnable from the repo root and the stale "not yet public"
clause dropped — the canonical `0adc142c…` stays named-and-labeled (it is
verify-offline's artifact-pin anchor). Two nits applied as well: this
record's header link now resolves in the shipped copy, and the article's
five audit side-file citations carry their `bench/results/` prefix. RN-V01
re-walked on the fixed tree (G1): the batch's only new outward numbers are
the shipped pin `88165f6f…` (G2) and the 21%–87.5% range — both already
carried §3.5/§3.6 measured cells; everything else was path/pointer/label
rewording.

**Round 15** (solo session, score 9.0, `5670a8a`): a confirming pass over the
shipped tree after round 14 — all five round-14 fixes verified LANDED on a
fresh clone (188/188, kit 153, traceability 9/9, privacy 0; every cited fix
present at its exact location). The one should-fix was the shipped-tree
check's `manifest pins OK: 6 bad: 2`: `b7dc3df`'s manifest rebuild had
pinned the *staging* copies of `kit/README.md` and `kit/CHANGELOG.md` (frozen
since the corpus freeze) while the export ships the root `kit/` files — the
two trees had been identical before round 14 and diverged with its edits.
Fixed in `5670a8a` (staging re-synced, manifest rebuilt — 8/8 pins resolve
against the built candidate) and guarded: `export-public.test.js` now hashes
every manifest entry against the shipped candidate (non-vacuity proven — a
mutated pin goes red, reverted green). Four nits applied as well: the lede's,
§2.7's and this record's standing-gap "not yet public" residue reworded to
the shipped-subset reality (the full canonical `unified.jsonl` stays private
by design), the README's CI badge repointed at the workflow that actually
ships (`offline.yml`, not the canonical-only `ci.yml`), kit/README's
101-test comment updated to 153, and `report.md`'s article citation plus the
article's `docs/v4-read-system` citation labeled canonical-tree-not-published.
No new outward numbers; publication not blocked.

**Round 16** (solo session, score 6.5, `a0e03b3`, `5555c8e`): the first
*blocked* verdict since round 1, run against the shipped tree. Privacy,
labels, kit and recomputation checks all passed (the evaluator's 34/35
ad-hoc recomputes matched, privacy 0-hit throughout), but the blocker held:
§3.5's headline cell read "after a strict oracle audit of those 16, 14 are
wrong … false-verifies partial support at 87.5%" — the committed
`audit-hotpot-b108.jsonl` partial rows are **14 `construction`
(gold-correct) / 2 `genuine`**, the blind TSV confirms 16/16 on that subset,
the classifier defines construction = correct, and the run's own commit
message said "14/16 were correct"; the true cell is "14 gold-correct, 2
wrong = 12.5% false-verify". The flip was born at `dfde55a` (report erratum
`e900781`) and had been carried — never re-joined against the file —
through the round-14/15 walks. Inheritance: the lede/§7/README range
"21%–87.5%" (honest audited range over the three partial cells is
**12.5%–56%**: b108 12.5%, b119 56.3%, b120 20.6% — a genuine 87.5% exists
only as b119's *unanswerable* accuracy cell, out of the lede's partial
scope), `report.md`'s erratum restatement ("is 14/16 wrong (not 16/16)"),
the shipped ledger's B108 partial row and B111's "(all still wrong)", plus
two §3.5 narrative lines ("worse for the gate than the forced label
claimed", "moves 2 of the 16 out"). The should-fix: `verify-offline`
asserted the 53/31/16 state counts but performed **zero joins** on the
article's audited [report] citations — the process gap that let the flip
ship. The nit: the shipped excerpt stopped at B114, so the erratum's own
backing rows B115–B118 never traveled and the shipped B108/B111 cells went
unretracted. Applied in `a0e03b3`: §3.5 rewritten with the correct polarity
plus a self-disclosure of the inversion (no canonical hashes), B111 scoped
to pre-audit labels, the honest 12.5%–56% range at all three sites, the
report erratum, ledger B108/B111, excerpt scope → B95–B118 with a B118
backings repoint (test expectations 20 → 24 rows), and 23 new
`[report] audited shares` claims in `verify-offline` (188 → 211) joining the
shipped side-files — non-vacuity proven twice (re-inverted article → 3
claims red → green; a tamper test flipping one audit row → red).
`5555c8e` fixed the article's closing B95–B114 pointer. RN-V01 re-walked
in the canonical ledger's G1 (canonical tree — not published);
publication was blocked at round 16 pending this batch — cleared by
round 17 below.

**Round 17** (solo session, score 8.5, `d20cd99`): a confirmation round
over the round-16 batch — publication **not blocked**; every gate, pin and
privacy check passed on a fresh clone (211/211 claims pre-batch, kit 153,
traceability 9/9, 8/8 `.sha256` + 8/8 manifest, both article copies
byte-identical to the canonical source, privacy 0-hit under a
stricter-than-lint sweep), and ~40 independent hand-recomputes matched
every probed value — including the new audit-file joins, Wilson intervals
and the B97 threshold sweep. Two should-fixes, applied in `d20cd99`:
(a) README:12-14 and README:50 promised offline byte-for-byte
re-derivation of *every* `bench/BENCHMARKS.md` cell while naming five
HotpotQA-only pinned artifacts — the SciFact/Qasper/Confluence/v4.5/
selector/sub-4B cells have no shipped backing (BENCHMARKS itself discloses
this at its head; the tool's own header was already correctly scoped
"backed by") — both sentences now carry the scope clause; (b) "~25% more
tokens" was arithmetically 32.5% ((2044−1543)/1543 — with 2044/1543 and
the 2× latency machine-checked from `tier-b-hotpot-300.jsonl`) — corrected
at all five sites (BENCHMARKS, kit/README, this record; canonical
`bench/RESULTS.md` + `docs/v4-read-system.md`) and now guarded by the new
`bench-cost-tok-pct` claim (212 claims; non-vacuity by anchor: reverting
the figure drops the claim red). Five labeling nits applied as well:
B108's non-shipping backing file marked canonical-only in the canonical
ledger (excerpt regenerated — its preamble promises exactly this);
`report.md`'s Sources sentence split into shipped vs named-absent-by-design;
this record's round-16 tail repointed at G1 with "blocked pending" resolved
by this round; §4's five struck rows (B11/B14/B68/B70/B71) labeled outside
the excerpt's B95–B118 scope; and the BENCHMARKS 24→31→36 bullet naming
its three source runs (crossover-100, tier-b head-100, final-arms-100 —
ids verified 100/100 shared) instead of implying one table. RN-V01
re-walked in G1; no article number changed.

## Round 4 — the three most powerful things (their answers)

Consensus across all three: **§4 self-audit, §3.3 judge determinism, and
§3.5 partial-support are the article's three load-bearing legs.**

| # | RAG practitioner | Eval skeptic | Production/infra |
|---|---|---|---|
| 1 | **§4 self-audit** — the clobbered-file catch is reader-verifiable in one command; publishing your own error list earns trust in the numbers you didn't catch | **§4 forensics** — b103b≡b102 byte-identity re-proved 300/300; proof, not assertion | **§3.3 determinism** — 9B's 0-flip vs kimi's 9.4% state-flips reframes local-vs-hosted as a reliability decision |
| 2 | **§3.3 flip-rate** — converts "+0.05 hosted AUROC" from fact to dice roll; k=3 costs one afternoon, zero reader runs | **The demoted number** — published 0.910, re-rolled it, buried it against the authors' own interest | **§4 as prosecution exhibit** — the reproduction pass caught 88%-vs-97% printed wrong |
| 3 | **§3.5 partial-support** — the failure enterprise retrieval actually ships, quantified (16%/51% verified at 0% correct) and declared unsolved | **§3.5 contamination control** — memorization measured as a 10-point cell, not a scold | **§3.1/B97** — the gate isn't a threshold you already had: 83.5% vs 71.7%/64.2% at matched coverage |

## Round 4 — adoption verdicts (product signal)

**Philosophy: unanimous, zero real blockers.** All three would adopt
k-repeat-with-flip-rates, frozen-config-committed-before-the-run,
content-addressed artifact + recompute script, and the claims ledger with its
three-tag taxonomy. Quotable: *"adopt tomorrow, because it is stack-agnostic
and cheap"*; *"nothing real stops me — only days, not quarters, [which] pay
back the first time a number drifts"*; *"aggressively."* The RAG practitioner
additionally picks the by-construction 3-condition private corpus + the ≥60%
grounding filter as *"the cheapest instrument audit I've seen"* — their own
question generator hallucinates golds at the same 14/100 rate.

**Kit: conditional, with the same three reservations every time:**

1. **Scope.** `--sufficient` is a weak-reader crutch (inert on strong readers)
   and is opt-in because it hurts synthesis (Confluence 18/23 → 10/23, B61).
   All three would only run it on extractive-over-stable-docs corpora.
   *"If I ran a regulated, extractive, Ollama-adjacent stack, the kit is a
   flat yes; for a frontier-hosted synthesis pipeline, keep the harness, leave
   the kit."*
2. **Stack.** `.mjs`/Ollama-first; the eval harness (`bench/`, `reproduce.md`,
   ledger) is not packaged. The README's own tax: ~2× slower, ~32.5% more tokens
   than naive one-call RAG. One reviewer: *"steal the receipt idea tonight;
   rewrite the implementation."*
3. **Not public.** The artifact not shipping blocks forking the reproduction
   discipline — the article's strongest claim is verified-by-authors, not
   by-readers, until `unified.jsonl` is published.

Round-4 scores held at 9/9/8 solely on the §2.2 defect (all three: "one
deletion unlocks the next score"), which `6d10150` applied.

## Standing deferred gaps (honestly disclosed in the article, by design)

No p95/throughput/concurrency/$/query/CUDA numbers (§5 fenced as eval-loop,
M4 Max, batch-1, single-user); full artifact not public — its public subset
ships (§2.7); models pinned by
tag, not digest (§6.8); same-family local judging unresolved — no ≥9B
cross-family model available (§6.4); private corpus not held out from tuning
(§6.3); partial-support unsolved, mechanical fix priced both ways (§3.5/§6.1).

## Re-running a round

Launch 3 subagents in one message (never more — AGENTS.md fan-out rule), one
per persona above, prompt shape: persona block → full article path →
"ROUND n+1, prior scores x/y/z" → numbered fix-audit list → score + verdict →
additions (round 4 asked for the three most powerful things and a kit-vs-
philosophy adoption answer; see above). Reviewers may run read-only scripts
(`node bench/oracle-vs-contains.mjs`) and inline `node -e` against
`unified.jsonl`; never writes, never model calls. Fix batch → one commit →
next round.
