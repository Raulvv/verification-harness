#!/usr/bin/env node
// Offline verification for the published harness repo (extraction epic, Phase 4).
//
// Recomputes every [recomputed] cell the article quotes from the shipped
// artifacts (bench/results/unified-public.jsonl and the b121 open-pool pair,
// both sha256-pinned), every bench/BENCHMARKS.md cell backed by the five
// pinned R-2 artifacts, and cross-checks each value against its own doc
// (anchor strings). No model calls, no network, arithmetic only — the
// round-7/8 standard.
//
//   node verify-offline.mjs        # exit 0 = every cell matches
//
// Locates the article and the artifact relative to the repo root, so the same
// file works in the canonical tree (articles/the-verification-harness.md,
// full unified.jsonl as fallback) and in the exported candidate
// (the-verification-harness.md, bench/results/unified-public.jsonl).

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// canonical tree: scripts/verify-offline.mjs (repo root = HERE/..); exported
// candidate: verify-offline.mjs at the repo root itself.
const ROOT = existsSync(join(HERE, 'bench')) || existsSync(join(HERE, 'the-verification-harness.md'))
  ? HERE
  : resolve(HERE, '..')

function firstExisting (...cands) {
  for (const c of cands) if (existsSync(c)) return c
  throw new Error(`none of these exist: ${cands.join(', ')}`)
}

const ARTICLE_PATH = firstExisting(
  join(ROOT, 'the-verification-harness.md'),
  join(ROOT, 'articles/the-verification-harness.md'),
)
const ARTIFACT_PATH = firstExisting(
  join(ROOT, 'bench/results/unified-public.jsonl'),
  join(ROOT, 'unified-public.jsonl'),
  join(ROOT, 'unified.jsonl'),
)
const PIN_PATH = firstExisting(
  join(ROOT, 'bench/results/unified-public.jsonl.sha256'),
  join(ROOT, 'unified-public.jsonl.sha256'),
  join(ROOT, 'unified.jsonl.sha256'),
)
// b121 — open-pool e2e pair (article §3.4 b121 block), same layout in both trees
const B121_PATH = firstExisting(
  join(ROOT, 'bench/results/b121-e2eir-4b.jsonl'),
  join(ROOT, 'b121-e2eir-4b.jsonl'),
)
const B121_PIN = firstExisting(
  join(ROOT, 'bench/results/b121-e2eir-4b.sha256'),
  join(ROOT, 'b121-e2eir-4b.sha256'),
)
const B121_9B_PATH = firstExisting(
  join(ROOT, 'bench/results/b121-e2eir-4b-ours9b.jsonl'),
  join(ROOT, 'b121-e2eir-4b-ours9b.jsonl'),
)
const B121_9B_PIN = firstExisting(
  join(ROOT, 'bench/results/b121-e2eir-4b-ours9b.sha256'),
  join(ROOT, 'b121-e2eir-4b-ours9b.sha256'),
)
// R-2 — the five pinned artifacts backing bench/BENCHMARKS.md cells
const benchFile = (name) => firstExisting(
  join(ROOT, 'bench/results', name),
  join(ROOT, name),
)
const CROSS_PATH = benchFile('crossover-100.json')
const CROSS_PIN = benchFile('crossover-100.sha256')
const FARMS_PATH = benchFile('final-arms-100.json')
const FARMS_PIN = benchFile('final-arms-100.sha256')
const TIERBJ_PATH = benchFile('tier-b-hotpot-300-judged.jsonl')
const TIERBJ_PIN = benchFile('tier-b-hotpot-300-judged.sha256')
const TIERB_PATH = benchFile('tier-b-hotpot-300.jsonl')
const TIERB_PIN = benchFile('tier-b-hotpot-300.sha256')
const TIERB2_PATH = benchFile('tier-b2-hotpot-100.md')
const TIERB2_PIN = benchFile('tier-b2-hotpot-100.sha256')
const BENCHDOC_PATH = firstExisting(
  join(ROOT, 'bench/BENCHMARKS.md'),
  join(ROOT, 'BENCHMARKS.md'),
)
const LEDGER_PATH = firstExisting(
  join(ROOT, 'retrieval-claims-ledger.md'),
  join(ROOT, 'docs/epicas/retrieval-claims-ledger.md'),
)

const article = readFileSync(ARTICLE_PATH, 'utf8')
const benchDoc = readFileSync(BENCHDOC_PATH, 'utf8')
const ledger = readFileSync(LEDGER_PATH, 'utf8')
const all = readFileSync(ARTIFACT_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const b121 = readFileSync(B121_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const b1219b = readFileSync(B121_9B_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const cross = JSON.parse(readFileSync(CROSS_PATH, 'utf8'))
const farms = JSON.parse(readFileSync(FARMS_PATH, 'utf8'))
const readJl = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const tierbj = readJl(TIERBJ_PATH)
const tierb = readJl(TIERB_PATH)
const tierb2 = readFileSync(TIERB2_PATH, 'utf8')

// ── arithmetic (mirrors reproduce.md's snapshot snippet) ───────────────────
const load = (prefix) => all.filter((x) => String(x.run_id).startsWith(prefix))
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0')
const mean = (xs) => (xs.length ? (xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1) : '0.0')
const mean2 = (xs) => (xs.length ? (xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(2) : '0.00')

function snap (r) {
  const a = r.filter((x) => x.condition === 'answerable')
  const u = r.filter((x) => x.condition === 'unanswerable')
  const rawShown = a.filter((x) => !x.reader_abstained)
  const gateShown = a.filter((x) => x.state !== 'not_found')
  const verAns = a.filter((x) => x.state === 'verified')
  const verAll = r.filter((x) => x.state === 'verified')
  return {
    n: r.length,
    rawUnk: pct(u.filter((x) => x.reader_abstained).length, u.length),
    rawFA: pct(a.filter((x) => x.reader_abstained).length, a.length),
    rawAcc: pct(rawShown.filter((x) => x.oracle_correct === 1).length, rawShown.length),
    rawShownN: rawShown.length,
    gateUnk: pct(u.filter((x) => x.state === 'not_found').length, u.length),
    gateFA: pct(a.filter((x) => x.state === 'not_found').length, a.length),
    gateAcc: pct(gateShown.filter((x) => x.oracle_correct === 1).length, gateShown.length),
    precAns: pct(verAns.filter((x) => x.oracle_correct).length, verAns.length),
    nAns: verAns.length,
    precAll: pct(verAll.filter((x) => x.oracle_correct).length, verAll.length),
    nAll: verAll.length,
    fa: u.filter((x) => x.state === 'verified').length,
    vw: verAns.filter((x) => x.oracle_correct === 0).length,
    unverified: r.filter((x) => x.state === 'unverified'),
  }
}

function stateCell (r, condition) {
  const g = r.filter((x) => x.condition === condition)
  const sh = g.filter((x) => x.state !== 'not_found')
  const ve = g.filter((x) => x.state === 'verified')
  return {
    shownPct: pct(sh.length, g.length),
    shownN: sh.length,
    ver: ve.length,
    verOfShown: pct(ve.length, sh.length),
    verCorr: ve.filter((x) => x.oracle_correct === 1).length,
    verPrec: pct(ve.filter((x) => x.oracle_correct === 1).length, ve.length),
    shownCorr: sh.filter((x) => x.oracle_correct === 1).length,
    shownAcc: pct(sh.filter((x) => x.oracle_correct === 1).length, sh.length),
  }
}

function endToEnd (prefix) {
  const R = load(prefix).slice(0, 200)
  const ans = R.filter((x) => x.condition === 'answerable')
  const un = R.filter((x) => x.condition === 'unanswerable')
  const shown = (x) => x.state !== 'not_found'
  const ve = R.filter((x) => x.state === 'verified')
  return {
    n: R.length,
    cov: pct(ans.filter(shown).length, ans.length),
    unk: pct(un.filter((x) => !shown(x)).length, un.length),
    verPrec: pct(ve.filter((x) => x.oracle_correct).length, ve.length),
    verWrong: ve.filter((x) => !x.oracle_correct).length,
    sPerRec: mean2(R.filter((x) => x.seconds_reader != null).map((x) => x.seconds_reader)),
  }
}

// ── claims ─────────────────────────────────────────────────────────────────
const failures = []
let total = 0
function claimIn (text, where, id, computed, expected, anchor) {
  total += 1
  const ok = String(computed) === String(expected)
  const anchorOk = anchor == null || text.includes(anchor)
  if (!ok || !anchorOk) {
    failures.push({ id, computed, expected, anchor, anchorOk, where })
  }
}
const claim = (id, computed, expected, anchor) => claimIn(article, 'article', id, computed, expected, anchor)
const bclaim = (id, computed, expected, anchor) => claimIn(benchDoc, 'bench/BENCHMARKS.md', id, computed, expected, anchor)
const lclaim = (id, computed, expected, anchor) => claimIn(ledger, 'retrieval-claims-ledger.md', id, computed, expected, anchor)

// §1 + §2.1 — the middle band and the missing-score bucket (B95)
const b95 = snap(load('b95-'))
const a95 = load('b95-').filter((x) => x.condition === 'answerable')
const band = a95.filter((x) => !x.reader_abstained && x.state === 'unverified')
claim('band-size', band.length, 29, '29 of 300')
claim('band-correct', band.filter((x) => x.oracle_correct === 1).length, 19, '19 of those 29 (65%)')
const noScore = load('b95-').filter((x) => x.state === 'unverified' && x.score == null)
claim('judge-no-score-n', noScore.length, 14, 'B95 had 14 such items; two were correct')
claim('judge-no-score-correct', noScore.filter((x) => x.oracle_correct === 1).length, 2)

// §3.1 — B95 snapshot
claim('b95-n', b95.n, 600, 'rows 301–600, N=600 [recomputed]')
claim('b95-raw-unk', b95.rawUnk, '70.7', '70.7% | **81.7%**')
claim('b95-raw-fa', b95.rawFA, '4.7', '4.7% | 7.7%')
claim('b95-raw-acc', b95.rawAcc, '89.5', '89.5% (256/286)')
claim('b95-raw-shown-n', b95.rawShownN, 286)
claim('b95-gate-unk', b95.gateUnk, '81.7')
claim('b95-gate-fa', b95.gateFA, '7.7')
claim('b95-gate-acc', b95.gateAcc, '92.4', '92.4% | +2.9pp')
claim('b95-ver-ans', b95.precAns, '95.6', '95.6%** (n=248)')
claim('b95-ver-ans-n', b95.nAns, 248)
claim('b95-ver-all', b95.precAll, '90.1', '90.1% (n=263) as labeled')
claim('b95-ver-all-n', b95.nAll, 263)
claim('b95-fa', b95.fa, 15, '15/300')
const gateHidden = a95.filter((x) => x.state === 'not_found')
const newlyHidden = gateHidden.filter((x) => x.reader_abstained === 0)
claim('b95-gate-hidden', gateHidden.length, 23, '23 of 300 answerable questions hidden')
claim('b95-newly-hidden', newlyHidden.length, 9, '0-for-9 against the oracle')
claim('b95-newly-hidden-all-wrong', newlyHidden.filter((x) => x.oracle_correct === 0).length, 9)

// §3.2 — strong readers, same frozen gate
const b102 = snap(load('b102-'))
claim('b102-raw-unk', b102.rawUnk, '93.0', '| deepseek-v4.1-flash (hosted) | 600 | 93.0% | 13.7% | 97.7% | 97.7% / 91.3% | 18 | 4 times |')
claim('b102-raw-fa', b102.rawFA, '13.7')
claim('b102-raw-acc', b102.rawAcc, '97.7')
claim('b102-ver-ans', b102.precAns, '97.7')
claim('b102-ver-all', b102.precAll, '91.3')
claim('b102-fa', b102.fa, 18)
claim('b102-fired', b102.unverified.length, 4, '4 times')
claim('b102-fired-on-unans', b102.unverified.filter((x) => x.condition === 'unanswerable').length, 3, "3 of deepseek's 4")
const b104 = snap(load('b104-'))
claim('b104-raw-unk', b104.rawUnk, '91.0', '| qwen3.8-27b q4 (local) | 200 | 91.0% | 7.0% | 97.8% | 97.8% / 92.8% | 5 | 5 times |')
claim('b104-raw-fa', b104.rawFA, '7.0')
claim('b104-raw-acc', b104.rawAcc, '97.8')
claim('b104-ver-ans', b104.precAns, '97.8')
claim('b104-ver-all', b104.precAll, '92.8')
claim('b104-fa', b104.fa, 5)
claim('b104-fired', b104.unverified.length, 5, '5 times')
claim('b104-fired-on-unans', b104.unverified.filter((x) => x.condition === 'unanswerable').length, 4, "4 of the 27B's 5")
const b105 = snap(load('b105-'))
claim('b105-gate-unk', b105.gateUnk, '90.0')
claim('b105-gate-fa', b105.gateFA, '6.0')
claim('b105-gate-acc', b105.gateAcc, '95.7')
claim('b105-ver-all', b105.precAll, '90.5')

// §3.4 — end-to-end table (rows 301–400 slices)
const e2eKimi = endToEnd('b95-')
claim('e2e-kimi-cov', e2eKimi.cov, '97.0', '| **4B + kimi judge** (hosted judge) | 97% | 85% | 91.2% | 8 | 2.97 s | 3.4 GB |')
claim('e2e-kimi-unk', e2eKimi.unk, '85.0')
claim('e2e-kimi-verPrec', e2eKimi.verPrec, '91.2')
claim('e2e-kimi-verWrong', e2eKimi.verWrong, 8)
claim('e2e-kimi-s', e2eKimi.sPerRec, '2.97', '| **4B + kimi judge** (hosted judge) | 97% | 85% | 91.2% | 8 | 2.97 s | 3.4 GB |')
const e2e27j = endToEnd('b105-')
claim('e2e-27j-cov', e2e27j.cov, '94.0', '| **4B + 27B judge** (fully local) | 94% | 90% | 90.5% | 9 | 5.54 s | 21.2 GB |')
claim('e2e-27j-unk', e2e27j.unk, '90.0')
claim('e2e-27j-verPrec', e2e27j.verPrec, '90.5')
claim('e2e-27j-verWrong', e2e27j.verWrong, 9)
claim('e2e-27j-s', e2e27j.sPerRec, '5.54', '| **4B + 27B judge** (fully local) | 94% | 90% | 90.5% | 9 | 5.54 s | 21.2 GB |')
const e2e9b = endToEnd('b109-')
claim('e2e-9b-cov', e2e9b.cov, '97.0', '| **4B + 9B judge** (fully local) | 97% | 89% | 88.3% | 12 | 4.33 s | 10 GB |')
claim('e2e-9b-unk', e2e9b.unk, '89.0')
claim('e2e-9b-verPrec', e2e9b.verPrec, '88.3')
claim('e2e-9b-verWrong', e2e9b.verWrong, 12, '12/200')
claim('e2e-9b-s', e2e9b.sPerRec, '4.33', '| **4B + 9B judge** (fully local) | 97% | 89% | 88.3% | 12 | 4.33 s | 10 GB |')
const e2e27 = endToEnd('b104-')
claim('e2e-27-cov', e2e27.cov, '93.0', '| **27B reader, no gate** (local) | 93% | 91% | 92.8% | 7 | 20.17 s | 17.8 GB |')
claim('e2e-27-unk', e2e27.unk, '91.0')
claim('e2e-27-verWrong', e2e27.verWrong, 7, null)
claim('e2e-27-s', e2e27.sPerRec, '20.17', '| **27B reader, no gate** (local) | 93% | 91% | 92.8% | 7 | 20.17 s | 17.8 GB |')
const e2eds = endToEnd('b103b-')
claim('e2e-ds-cov', e2eds.cov, '88.0', '| **deepseek reader** (hosted, no gate delta) | 88% | 92% | 92.6% | 7 | 3.47 s | — |')
claim('e2e-ds-unk', e2eds.unk, '92.0')
claim('e2e-ds-verPrec', e2eds.verPrec, '92.6')
claim('e2e-ds-verWrong', e2eds.verWrong, 7)
claim('e2e-ds-s', e2eds.sPerRec, '3.47', '| **deepseek reader** (hosted, no gate delta) | 88% | 92% | 92.6% | 7 | 3.47 s | — |')

// §3.5 — the partial-support blind spot (B108 state counts; accuracy is [report])
const part108 = load('b108-').filter((x) => x.condition === 'partial')
claim('b108-partial-not-found', part108.filter((x) => x.state === 'not_found').length, 53, '53% of partial items are rejected')
claim('b108-partial-unverified', part108.filter((x) => x.state === 'unverified').length, 31, '31% flagged')
claim('b108-partial-verified', part108.filter((x) => x.state === 'verified').length, 16, '16% marked `verified`')

// §3.6 — the clean-room state tables (accuracy on partial/unans rows is [report])
const b119 = load('b119-')
const b120 = load('b120-')
const c119ans = stateCell(b119, 'answerable')
const c119part = stateCell(b119, 'partial')
const c119un = stateCell(b119, 'unanswerable')
claim('b119-ans-shown', c119ans.shownPct, '96.0', '| answerable | 96% | 82 (85.4% of shown) | **87.8%** (72/82, CI 79.0–93.2) [recomputed] | — |')
claim('b119-ans-ver', c119ans.ver, 82, '82 (85.4% of shown)')
claim('b119-ans-ver-of-shown', c119ans.verOfShown, '85.4')
claim('b119-ans-ver-prec', c119ans.verPrec, '87.8')
claim('b119-ans-ver-corr', c119ans.verCorr, 72)
claim('b119-part-shown', c119part.shownPct, '88.0', '| partial | 88% | 48 (54.5% of shown)')
claim('b119-part-ver', c119part.ver, 48)
claim('b119-un-shown', c119un.shownPct, '64.0', '| unanswerable | 64% | 16 (25.0% of shown)')
claim('b119-un-ver', c119un.ver, 16)
const pf120 = b120.filter((x) => x.parse_failure === 1)
claim('b119-parse-failures', b119.filter((x) => x.parse_failure === 1).length, 0, '**0** for the 4B')
claim('b120-parse-failures', pf120.length, 10, '**10 of 300**')
claim('b120-parse-by-cond',
  ['answerable', 'partial', 'unanswerable'].map((c) => pf120.filter((x) => x.condition === c).length).join('/'),
  '2/6/2', '2 answerable, 6 partial, 2 unanswerable')
const c120ans = stateCell(b120, 'answerable')
const c120part = stateCell(b120, 'partial')
const c120un = stateCell(b120, 'unanswerable')
claim('b120-ans-shown', c120ans.shownPct, '98.0', '| answerable | 98% | 92 (93.9% of shown) | **97.8%** (90/92, CI 92.4–99.4) [recomputed] | — |')
claim('b120-ans-ver', c120ans.ver, 92, '92 (93.9% of shown)')
claim('b120-ans-ver-of-shown', c120ans.verOfShown, '93.9')
claim('b120-ans-ver-prec', c120ans.verPrec, '97.8')
claim('b120-ans-ver-corr', c120ans.verCorr, 90)
claim('b120-part-shown', c120part.shownPct, '59.0', '| partial | 59% | 34 (57.6% of shown)')
claim('b120-part-ver', c120part.ver, 34)
claim('b120-un-shown', c120un.shownPct, '12.0', '| unanswerable | 12% | 9 (75.0% of shown)')
claim('b120-un-ver', c120un.ver, 9)

// ── [report] audited shares — file joins over the shipped audit side-files ──
// Polarity class (bench/audit-classify.mjs:33-35): construction = the shown
// answer is actually gold-correct; genuine = actually wrong. These claims are
// the machine check that caught the round-16 B108 polarity inversion.
const readJsonl = (rel) => readFileSync(join(ROOT, rel), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const b108p = readJsonl('bench/results/audit-hotpot-b108.jsonl').filter((x) => x.condition === 'partial')
const b108correct = b108p.filter((x) => x.class === 'construction').length
claim('b108-audit-partial-n', b108p.length, 16, 'oracle audit of those 16, 14 are gold-correct')
claim('b108-audit-correct', b108correct, 14, '14 are gold-correct: only 2 of 16 (12.5%) are')
claim('b108-audit-wrong', b108p.length - b108correct, 2)
claim('b108-false-verify', (((b108p.length - b108correct) / b108p.length) * 100).toFixed(1), '12.5', 'false-verifies partial support at 12.5% on this')
const b108blind = readFileSync(join(ROOT, 'bench/results/audit-hotpot-b108-blind-verdicts.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'))
claim('b108-blind-rows', b108blind.length, 22, 'blind second pass 22/22 (16/16')
claim('b108-blind-agree', b108blind.filter((r) => r[4] === 'true').length, 22)
claim('b108-blind-partial-agree', b108blind.filter((r) => r[2] === 'partial' && r[4] === 'true').length, 16)

const b95audit = readJsonl('bench/results/audit-hotpot-b95.jsonl')
claim('b95-audit-supported', b95audit.filter((x) => x.class === 'construction').length, 10, '5 genuinely wrong**')
claim('b95-audit-wrong', b95audit.filter((x) => x.class === 'genuine').length, 5)

const ac = readJsonl('bench/results/audit-classify.jsonl')
const acCell = (arm, cond, cls) => ac.filter((x) => x.arm === arm && x.condition === cond && (cls == null || x.class === cls)).length
claim('b119-part-audited-n', acCell('4b-local', 'partial'), 48, '43.8%** (21/48, CI 30.7')
claim('b119-part-audited-correct', acCell('4b-local', 'partial', 'construction'), 21, '21/48, CI 30.7')
claim('b120-part-audited-n', acCell('deepseek', 'partial'), 34, '79.4%** (27/34, CI 63.2')
claim('b120-part-audited-correct', acCell('deepseek', 'partial', 'construction'), 27, '27/34, CI 63.2')
claim('b119-un-audited-n', acCell('4b-local', 'unanswerable'), 16, '12.5%** (2/16, CI 3.5')
claim('b119-un-audited-correct', acCell('4b-local', 'unanswerable', 'construction'), 2, '(2/16, CI 3.5')
claim('b120-un-audited-n', acCell('deepseek', 'unanswerable'), 9, '55.6%** (5/9, CI 26.7')
claim('b120-un-audited-correct', acCell('deepseek', 'unanswerable', 'construction'), 5, '(5/9, CI 26.7')
const pu = readJsonl('bench/results/audit-partial-unverified.jsonl')
claim('b119-unver-n', pu.filter((x) => x.arm === '4b-local').length, 40, '(7/40, CI 8.7')
claim('b119-unver-correct', pu.filter((x) => x.arm === '4b-local' && x.judge_correct === 1).length, 7, '17.5% (7/40, CI 8.7')
claim('b120-unver-n', pu.filter((x) => x.arm === 'deepseek').length, 25, '(3/25, CI 4.2')
claim('b120-unver-correct', pu.filter((x) => x.arm === 'deepseek' && x.judge_correct === 1).length, 3, '12.0% (3/25, CI 4.2')

// the lede/§7 audited range over the three partial false-verify cells
const fvPartial = [
  ((b108p.length - b108correct) / b108p.length) * 100,
  (acCell('4b-local', 'partial', 'genuine') / acCell('4b-local', 'partial')) * 100,
  (acCell('deepseek', 'partial', 'genuine') / acCell('deepseek', 'partial')) * 100,
]
claim('partial-fv-floor', Math.min(...fvPartial).toFixed(1), '12.5', 'audited cells measure 12.5%–56%')
claim('partial-fv-ceil', Math.max(...fvPartial).toFixed(0), '56', '12.5%–56% of those verifications are wrong')

// ── round-18 — B115's polarity, the B108 unanswerable cell, the B97 sweep ──
// B115's own enumeration: audit rows whose joined artifact row is
// state=verified on partial|unanswerable, across the seven public runs.
const artState = new Map(all.map((x) => [`${x.run_id}|${x.id}|${x.condition}`, x]))
let b115n = 0
let b115cons = 0
for (const f of ['b95', 'b102', 'b103b', 'b104', 'b105', 'b108', 'b109']) {
  for (const r of readJsonl(`bench/results/audit-hotpot-${f}.jsonl`)) {
    const a = artState.get(`${r.run_id}|${r.id}|${r.condition}`)
    if (a && a.state === 'verified' && (r.condition === 'partial' || r.condition === 'unanswerable')) {
      b115n += 1
      if (r.class === 'construction') b115cons += 1
    }
  }
}
const b115gen = b115n - b115cons
lclaim('b115-audit-n', b115n, 90, 'All 90 rows carrying')
lclaim('b115-construction', b115cons, 65, '**65 construction / 25 genuine** — 72.2%')
lclaim('b115-gold-pct', ((b115cons / b115n) * 100).toFixed(1), '72.2', "72.2% of the gate's forced-verified shown-nonanswers are gold-correct yet unbacked")
lclaim('b115-genuine-n', b115gen, 25)
lclaim('b115-genuine-pct', ((b115gen / b115n) * 100).toFixed(1), '27.8', 'the other 25/90 = 27.8% are genuine fabrications')
// B108 unanswerable cell — the audited split behind the "(0% acc)" label
const b108all = readJsonl('bench/results/audit-hotpot-b108.jsonl')
const b108un = b108all.filter((x) => x.condition === 'unanswerable')
const b108unCons = b108un.filter((x) => x.class === 'construction').length
lclaim('b108-un-n', b108un.length, 6, '4/6 gold-correct')
lclaim('b108-un-correct', b108unCons, 4, 'audited: 4/6 gold-correct')
lclaim('b108-un-false-pct', (((b108un.length - b108unCons) / b108un.length) * 100).toFixed(1), '33.3', '2/6 = 33.3% false-verify')
// B97 — port of bench/hotpot-baselines.mjs: the gate point and the
// best-accuracy-under-the-gate's-coverage-cap sweep over each baseline.
const b97 = all.filter((x) => String(x.run_id ?? '').startsWith('b95'))
const b97lab = (x) => x.oracle_correct ?? x.reader_correct
const b97acc = (decide) => {
  let ok = 0
  let ans = 0
  for (const x of b97) {
    const a = decide(x)
    if (a) ans++
    const good = a ? (x.condition === 'answerable' && b97lab(x) === 1) : (x.condition === 'unanswerable')
    if (good) ok++
  }
  return { coverage: ans / b97.length, accuracy: ok / b97.length }
}
const b97gate = b97acc((x) => x.state !== 'not_found')
claim('b97-gate-cov', (100 * b97gate.coverage).toFixed(1), '55.3', '55.3% shown-or-flagged coverage')
claim('b97-gate-acc', (100 * b97gate.accuracy).toFixed(1), '83.5', "against the gate's **83.5%**")
const b97best = (key) => {
  const vals = b97.map((x) => x[key]).filter((v) => v != null).sort((a, b) => a - b)
  let best = { accuracy: -1 }
  for (const tau of vals) {
    const m = b97acc((x) => (x[key] ?? -Infinity) >= tau)
    if (m.coverage <= b97gate.coverage + 0.005 && m.accuracy > best.accuracy) best = m
  }
  return best
}
claim('b97-top1', (100 * b97best('top1_retrieval_score').accuracy).toFixed(1), '71.7', 'only 71.7% decision accuracy')
claim('b97-logprob', (100 * b97best('mean_logprob').accuracy).toFixed(1), '64.2', 'cutoff 64.2% — against the gate')
// The provenance exception is real: §4's pair is not inside the main artifact.
claim('b121-not-in-unified', all.filter((x) => String(x.run_id ?? '').startsWith('b121')).length, 0, "plus §4's pinned `b121-e2eir-4b*.jsonl` pair")

// §3.6 reading 1 — contamination inflation, both sides
const b109ans = stateCell(load('b109-'), 'answerable')
const b102ans = stateCell(load('b102-'), 'answerable')
claim('contam-4b-public-shown', b109ans.shownAcc, '93.8', '93.8% → 84.4%')
claim('contam-4b-private-shown', c119ans.shownAcc, '84.4')
claim('contam-4b-public-ver', b109ans.verPrec, '94.8', '94.8% → 87.8%')
claim('contam-4b-private-ver', c119ans.verPrec, '87.8')
claim('contam-ds-public-shown', b102ans.shownAcc, '97.7', '97.7% → 98.0% shown-accuracy')
claim('contam-ds-private-shown', c120ans.shownAcc, '98.0')

// §3.6 reading 4 — clean-room loop times (sum of per-field means)
const times = (r) => {
  const rMean = r.filter((x) => x.seconds_reader != null).map((x) => x.seconds_reader)
  const jMean = r.filter((x) => x.seconds_judge != null).map((x) => x.seconds_judge)
  const raw = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)
  return {
    reader: mean(rMean),
    judge: mean(jMean),
    e2e: (raw(rMean) + raw(jMean)).toFixed(1),
    readerN: rMean.length,
    judgeN: jMean.length,
  }
}
const t119 = times(b119)
const t120 = times(b120)
claim('b119-reader-s', t119.reader, '12.3', '12.3 s** (4B) and **8.1 s')
claim('b119-judge-s', t119.judge, '9.0', '9.0 s**\nand **5.7 s')
claim('b119-e2e-s', t119.e2e, '21.2', '~21.2 s** and **~13.9 s')
claim('b120-reader-s', t120.reader, '8.1')
claim('b120-judge-s', t120.judge, '5.7')
claim('b120-e2e-s', t120.e2e, '13.9')
claim('b119-timing-n', `${t119.readerN}/${t119.judgeN}`, '300/281')
claim('b120-timing-n', `${t120.readerN}/${t120.judgeN}`, '300/172')

// §3.4 b121 — open-pool retrieval, accuracy, and the two gate rows
const b121Ours = b121.filter((r) => r.arm === 'ours')
const armAcc = (rows) => pct(rows.filter((r) => r.oracle_correct === 1).length, rows.length)
const b121Recall = (k) => pct(b121Ours.reduce((s, r) => s + r[k], 0), b121Ours.length)
claim('b121-recall-dense', b121Recall('recall_dense'), '83.3', '**83.3% dense · 76.7% hybrid (RRF) · 88.0% iterative**')
claim('b121-recall-hybrid', b121Recall('recall_hybrid'), '76.7')
claim('b121-recall-iterative', b121Recall('recall_iterative'), '88.0')
claim('b121-bare-acc', armAcc(b121.filter((r) => r.arm === 'bare')), '25.3', 'bare **25.3%** · naive **80.3%** · ours')
claim('b121-naive-acc', armAcc(b121.filter((r) => r.arm === 'naive')), '80.3')
claim('b121-ours-acc', armAcc(b121Ours), '80.3', "**80.3%** — deepseek's strict oracle")

const b121Gate = (rows) => {
  const ver = rows.filter((r) => r.state === 'verified')
  const nf = rows.filter((r) => r.state === 'not_found')
  return {
    shown: rows.length - nf.length,
    shownCov: pct(rows.length - nf.length, rows.length),
    verN: ver.length,
    verOK: ver.filter((r) => r.oracle_correct === 1).length,
    verPrec: pct(ver.filter((r) => r.oracle_correct === 1).length, ver.length),
    verWrong: ver.filter((r) => r.oracle_correct === 0).length,
  }
}
const rowKimi = '| **4B + kimi judge** (hosted) | 89.7% (269/300) | **93.5% (215/230)** | 15 | 91.2% |'
const rowLocal = '| **4B + 9B judge** (fully local) | 90.3% (271/300) | **88.2% (232/263)** | 31 | 88.3% |'
const gK = b121Gate(b121Ours)
const gL = b121Gate(b1219b)
claim('b121-kimi-cov', gK.shownCov, '89.7', rowKimi)
claim('b121-kimi-shown-n', gK.shown, 269, rowKimi)
claim('b121-kimi-ver-n', gK.verN, 230, rowKimi)
claim('b121-kimi-ver-ok', gK.verOK, 215, rowKimi)
claim('b121-kimi-ver-prec', gK.verPrec, '93.5', rowKimi)
claim('b121-kimi-ver-wrong', gK.verWrong, 15, rowKimi)
claim('b121-local-cov', gL.shownCov, '90.3', rowLocal)
claim('b121-local-shown-n', gL.shown, 271, rowLocal)
claim('b121-local-ver-n', gL.verN, 263, rowLocal)
claim('b121-local-ver-ok', gL.verOK, 232, rowLocal)
claim('b121-local-ver-prec', gL.verPrec, '88.2', rowLocal)
claim('b121-local-ver-wrong', gL.verWrong, 31, rowLocal)

const kStates = new Map(b121Ours.map((r) => [r.id, r.state]))
const agreeN = b1219b.filter((r) => kStates.get(r.id) === r.state).length
claim('b121-agreement', pct(agreeN, b1219b.length), '85.3', '**85.3% (256/300)**')
claim('b121-agreement-n', `${agreeN}/${b1219b.length}`, '256/300')
const promoted = b1219b.filter((r) => r.state === 'verified' && kStates.get(r.id) !== 'verified')
claim('b121-promoted', `${promoted.filter((r) => r.oracle_correct === 1).length}/${promoted.length}`, '20/36', '**20/36**')
const judgeMs = (rows) => mean2(rows.filter((r) => r.sec_judge != null).map((r) => r.sec_judge))
const judgeN = (rows) => rows.filter((r) => r.sec_judge != null).length
claim('b121-judge-kimi-s', judgeMs(b121Ours), '3.76', 'kimi 3.76 s/rec vs 9B 3.32 s/rec')
claim('b121-judge-local-s', judgeMs(b1219b), '3.32', 'kimi 3.76 s/rec vs 9B 3.32 s/rec')
claim('b121-judge-n', `${judgeN(b121Ours)}/${judgeN(b1219b)}`, '279/279', 'over the 279 answered rows')
claim('b121-fidelity-mismatch', b1219b.filter((r) => r.window_fidelity === 0).length, 0, '0 window mismatches')

// artifact pin: the shipped file must match its committed sha256 line
const actual = createHash('sha256').update(readFileSync(ARTIFACT_PATH)).digest('hex')
const pinned = readFileSync(PIN_PATH, 'utf8').trim().split(/\s+/)[0]
claim('artifact-pin', actual, pinned, '88165f6fd26af787edc66fef4348cbb4c1e945c10918b6d8d1dd4697aed3ea33')
claim('b121-pin', createHash('sha256').update(readFileSync(B121_PATH)).digest('hex'),
  readFileSync(B121_PIN, 'utf8').trim().split(/\s+/)[0])
claim('b121-9b-pin', createHash('sha256').update(readFileSync(B121_9B_PATH)).digest('hex'),
  readFileSync(B121_9B_PIN, 'utf8').trim().split(/\s+/)[0])

// R-2 — bench/BENCHMARKS.md: five pinned artifacts, headline/cost/sweep cells
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const pinHash = (p) => readFileSync(p, 'utf8').trim().split(/\s+/)[0]
for (const [id, path, pin] of [
  ['cross', CROSS_PATH, CROSS_PIN],
  ['final-arms', FARMS_PATH, FARMS_PIN],
  ['tier-b-judged', TIERBJ_PATH, TIERBJ_PIN],
  ['tier-b', TIERB_PATH, TIERB_PIN],
  ['tier-b2', TIERB2_PATH, TIERB2_PIN],
]) claim(`bench-${id}-pin`, sha(path), pinHash(pin))

// headline table — judged correctness % per arm over the 300 set and its 100 slice
const trip = (rows, arm) => ['contains', 'qwen', 'granite'].map((k) => mean(rows.map((r) => r[arm][k] * 100)))
const row300b = '| **HotpotQA** (300) | bare | 17.3 | 26.0 | 27.7 | none |'
bclaim('bench-h300-bare-c', trip(tierbj, 'bare')[0], '17.3', row300b)
bclaim('bench-h300-bare-q', trip(tierbj, 'bare')[1], '26.0')
bclaim('bench-h300-bare-g', trip(tierbj, 'bare')[2], '27.7')
const row300n = '| | naive RAG | 66.7 | 80.7 | 80.0 | titles, unverified |'
bclaim('bench-h300-naive-c', trip(tierbj, 'naive')[0], '66.7', row300n)
bclaim('bench-h300-naive-q', trip(tierbj, 'naive')[1], '80.7')
bclaim('bench-h300-naive-g', trip(tierbj, 'naive')[2], '80.0')
const row300o = '| | **ours** | **76.7** | **87.0** | **94.7** | **89.5% quotes byte-verified** |'
bclaim('bench-h300-ours-c', trip(tierbj, 'ours')[0], '76.7', row300o)
bclaim('bench-h300-ours-q', trip(tierbj, 'ours')[1], '87.0')
bclaim('bench-h300-ours-g', trip(tierbj, 'ours')[2], '94.7')
// quote trace: mean over quoted rows of verified/quotes (run-tier-b.mjs `col('trace')`)
const quoted = tierb.filter((r) => r.ours.quotes > 0).map((r) => r.ours.verified / r.ours.quotes)
bclaim('bench-h300-quote-trace',
  (quoted.reduce((s, v) => s + v, 0) / quoted.length * 100).toFixed(1), '89.5', row300o)

const row100b = '| **HotpotQA** (100) | bare | 20.0 | 31.0 | 35.0 | none |'
const h100b = trip(tierbj.slice(0, 100), 'bare')
bclaim('bench-h100-bare-c', h100b[0], '20.0', row100b)
bclaim('bench-h100-bare-q', h100b[1], '31.0')
bclaim('bench-h100-bare-g', h100b[2], '35.0')
const row100n = '| | naive RAG | 69.0 | 80.0 | 83.0 | titles, unverified |'
const h100n = trip(tierbj.slice(0, 100), 'naive')
bclaim('bench-h100-naive-c', h100n[0], '69.0', row100n)
bclaim('bench-h100-naive-q', h100n[1], '80.0')
bclaim('bench-h100-naive-g', h100n[2], '83.0')
const row100o = '| | **ours** | **76.0** | **87.0** | **93.0** | byte-verified |'
const h100o = trip(tierbj.slice(0, 100), 'ours')
bclaim('bench-h100-ours-c', h100o[0], '76.0', row100o)
bclaim('bench-h100-ours-q', h100o[1], '87.0')
bclaim('bench-h100-ours-g', h100o[2], '93.0')

// cost cells — per-question mean over the same 300 (judge timing is null there)
bclaim('bench-cost-naive-s', mean(tierb.map((r) => r.naive.ms / 1000)), '4.8', '9.8 vs 4.8 s/q')
bclaim('bench-cost-ours-s', mean(tierb.map((r) => r.ours.ms / 1000)), '9.8')
bclaim('bench-cost-naive-tok',
  Math.round(tierb.reduce((s, r) => s + r.naive.tok, 0) / tierb.length), 1543, '2044 vs 1543 tok')
bclaim('bench-cost-ours-tok',
  Math.round(tierb.reduce((s, r) => s + r.ours.tok, 0) / tierb.length), 2044)
const naiveTok = Math.round(tierb.reduce((s, r) => s + r.naive.tok, 0) / tierb.length)
const oursTok = Math.round(tierb.reduce((s, r) => s + r.ours.tok, 0) / tierb.length)
bclaim('bench-cost-tok-pct',
  (((oursTok - naiveTok) / naiveTok) * 100).toFixed(1), '32.5', '~32.5% more tokens')

// model-size sweep — per-arm judged % and s/q over the shared 100-item set
const sweepCell = (rows, arm) => [
  mean(rows.map((r) => r[arm].qwen * 100)),
  mean(rows.map((r) => r[arm].granite * 100)),
  mean(rows.map((r) => r[arm].ms / 1000)),
]
for (const [id, rows, arm, row, exp] of [
  ['bare4', cross, 'bare4', '| bare | 4B | 24.0 | 29.0 | 0.2 |', ['24.0', '29.0', '0.2']],
  ['naive4', cross, 'naive4', '| naive RAG | 4B | 80.0 | 81.0 | 2.4 |', ['80.0', '81.0', '2.4']],
  ['full4', cross, 'full4', '| ours (full) | 4B | **86.0** | **93.0** | **6.1** |', ['86.0', '93.0', '6.1']],
  ['src4', cross, 'src4', '| ours (source) | 4B | 82.0 | 88.0 | 3.5 |', ['82.0', '88.0', '3.5']],
  ['naive9', cross, 'naive9', '| naive RAG | 9B | 80.0 | 83.0 | 4.7 |', ['80.0', '83.0', '4.7']],
  ['full9', cross, 'full9', '| ours (full) | 9B | 87.0 | 93.0 | 11.4 |', ['87.0', '93.0', '11.4']],
  ['src9', cross, 'src9', '| ours (source) | 9B | 83.0 | 91.0 | 9.6 |', ['83.0', '91.0', '9.6']],
  ['bare27', farms, 'bare27', '| bare | 27B | 36.0 | 37.0 | 1.2 |', ['36.0', '37.0', '1.2']],
  ['ours27', farms, 'ours27', '| ours (full) | 27B | 87.0 | 93.0 | 30.4 |', ['87.0', '93.0', '30.4']],
]) {
  const [q, g, s] = sweepCell(rows, arm)
  bclaim(`bench-sweep-${id}-q`, q, exp[0], row)
  bclaim(`bench-sweep-${id}-g`, g, exp[1])
  bclaim(`bench-sweep-${id}-s`, s, exp[2])
}
// naive27 backs only in tier-b2-hotpot-100.md (its jsonl has no judge fields)
const m27 = tierb2.match(/\| naive27 \|\s*[^|]+\s*\|\s*[^|]+\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/)
const row27 = '| naive RAG | 27B | 89.0 | 88.0 | 20.3 |'
bclaim('bench-sweep-naive27-q', m27?.[1], '89.0', row27)
bclaim('bench-sweep-naive27-g', m27?.[2], '88.0')
bclaim('bench-sweep-naive27-s', m27?.[3], '20.3')

// ── report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`verify-offline: ${failures.length} of ${total} claims FAILED\n`)
  for (const f of failures) {
    console.error(`  ✗ ${f.id}: computed ${f.computed} ≠ expected ${f.expected}` +
      (f.anchor && !f.anchorOk ? `\n      anchor missing in ${f.where}: ${JSON.stringify(f.anchor).slice(0, 90)}` : ''))
  }
  process.exit(1)
} else {
  console.log(`verify-offline: ${total} claims OK — artifact ${actual.slice(0, 12)}… matches pin; every [recomputed] cell in the article reproduces offline.`)
}
