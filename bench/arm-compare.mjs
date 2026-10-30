#!/usr/bin/env node
// Strong-baseline comparison. Same reader, same corpus, same retrieved window:
//   A  naive            question only, no documents
//   B  rag-cite         documents + "cite the file, say NOT FOUND if absent"
//   C  rag-cite + NLI   B, then an entailment check; INSUFFICIENT => abstain
//   D  harness          askOneShot (contract reader + mechanical receipts)
//
// Question it answers: does D beat the best simple alternative (C) on
// false-accepts, outside the noise? Decide the rule BEFORE running (see
// bench/ARM-COMPARE.md). Tune the C threshold/judge on dev only; run held-out once.
//
//   node bench/arm-compare.mjs --questions bench/ooh-pilot.jsonl \
//     --corpus bench/corpus/ooh-v1 --base-url http://localhost:11434/v1 \
//     --model qwen3.5:4b --judge-model bespoke-minicheck [--judge-cmd "<cmd>"] \
//     [--arms A,B,C,D] [--seeds 3] [--k 3] [--max-tokens 400] [--out bench/results/arm-compare.jsonl]
//   node bench/arm-compare.mjs --fake     # offline plumbing self-test, no models
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { askOneShot } from '../kit/lib/answer/oneshot.mjs'
import { askAggregate } from '../kit/lib/answer/aggregate.mjs'
import { runAbsence, shouldRunAbsence } from '../kit/lib/answer/absence.mjs'
import { chatWithUsage } from '../kit/lib/model.mjs'
import { judgeSufficiency, judgeByCommand } from '../kit/lib/receipts/sufficiency.mjs'
import { verify } from '../kit/lib/receipts/gate.mjs'
import { parseAnswer } from '../kit/lib/receipts/text.mjs'
import { parseOneShot } from '../kit/lib/answer/parse.mjs'
import { ONESHOT_SCHEMA } from '../kit/lib/answer/prompt.mjs'
import { score, wilson, leadAbstain } from './lib/arm-score.mjs'
import { citationStats, splitClaims, computedHolds } from './lib/cite-score.mjs'
import { loadRows, isGlobalItem, globalSpec, baseFor, expectedFor, formatField, receiptLine, legsFor } from './lib/ooh-rows.mjs'
import { windowDocs } from './lib/doc-window.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const FAKE = flag('fake')
const arms = opt('arms', 'A,Q,DA').split(',')
const seeds = Number(opt('seeds', FAKE ? 1 : 3))
const K = Number(opt('k', 3))
const MAX_TOKENS = Number(opt('max-tokens', 400)) // reasoning readers need headroom; documented in the report
const DOC_CHARS = Number(opt('doc-chars', 20000))
const DOC_MODE = opt('doc-mode', 'excerpt')
if (!['head', 'full', 'excerpt'].includes(DOC_MODE)) throw new Error('--doc-mode must be head, full or excerpt')
const AGGREGATE = opt('aggregate', 'off')
if (!['off', 'table', 'pages'].includes(AGGREGATE)) throw new Error('--aggregate must be off, table or pages')
const AGGREGATE_DATA = opt('aggregate-data', 'bench/ooh-data.json')
const IDS = opt('ids') ? new Set(opt('ids').split(',').filter(Boolean)) : null
const corpus = resolve(opt('corpus', 'bench/corpus/ooh-v1'))
const qfile = opt('questions', 'bench/ooh-pilot.jsonl')
const outPath = opt('out', 'bench/results/arm-compare.jsonl')
const baseUrl = opt('base-url', 'http://localhost:11434/v1')
const judgeBaseUrl = opt('judge-base-url', baseUrl)
const apiKeyEnv = opt('api-key-env')
const isOllama = (u) => /:11434|ollama/i.test(String(u ?? ''))
const reader = { label: 'reader', baseUrl, model: opt('model', 'qwen3.5:4b'), apiKeyEnv, apiKey: isOllama(baseUrl) ? 'ollama' : undefined }
const judge = { label: 'judge', baseUrl: judgeBaseUrl, model: opt('judge-model', reader.model), apiKeyEnv, apiKey: isOllama(judgeBaseUrl) ? 'ollama' : undefined }
const judgeCmd = opt('judge-cmd')

const items = readFileSync(qfile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((item) => !IDS || IDS.has(item.id))

// ---------- model plumbing (injectable for --fake) ----------
const tok = (u) => (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0)
const fakeUsage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
const fakeChat = (item) => async (msgs) => {
  const p = msgs.map((m) => m.content).join('\n')
  if (/SUFFICIENT or INSUFFICIENT|Claim:/.test(p)) return { content: /\d/.test(p.split('ANSWER:')[1] ?? '') ? 'SUFFICIENT' : 'INSUFFICIENT', usage: { ...fakeUsage } }
  if (/not_found/.test(p) || /JSON/i.test(p)) return { content: JSON.stringify({ answer: '', quotes: [], not_found: true }), usage: { ...fakeUsage } }
  const g = item.condition === 'answerable' ? String(item.gold) : null
  return { content: g && p.includes('Documents') ? g : 'NOT FOUND', usage: { ...fakeUsage } }
}
const chat = (item) => FAKE ? fakeChat(item) : (msgs, o) => chatWithUsage(reader, msgs, { maxTokens: MAX_TOKENS, think: false, ...o })

const window_ = (item) => windowDocs(corpus, item.question, { k: K, docChars: DOC_CHARS, mode: DOC_MODE })
const docsBlock = (docs) => docs.map((d, i) => `[${i + 1}] ${d.rel}\n${d.content}`).join('\n\n')
const PROMPT_B = (q, docs) => [
  'Answer using ONLY the documents. Name the source file.',
  'If the documents do not state the answer, reply exactly: NOT FOUND.',
  'If only part is stated, give that part and say which part is not stated.',
  '', 'Documents:', docsBlock(docs), '', 'Question: ' + q,
].join('\n')

// Q — B's prompt + "quote every claim", WITHOUT the gate. The control for
// "a simple prompt does not work": we show the raw quotes and measure them.
const PROMPT_Q = (q, docs) => [
  'Answer using ONLY the documents. Name the source file and copy the exact supporting passage(s) VERBATIM, one passage per claim.',
  'If the documents do not state the answer, reply exactly: NOT FOUND.',
  'If only part is stated, give that part and say which part is not stated.',
  'Return ONLY a JSON object: {"answer": "<answer>", "quotes": [{"doc": <document number>, "quote": "<verbatim passage>"}], "not_found": <true|false>}',
  '', 'Documents:', docsBlock(docs), '', 'Question: ' + q,
].join('\n')

// Sentence-level support (ALCE-style): positive claims go to MiniCheck;
// computed claims require their operands in the quotes; absence claims are
// reported separately.
async function supportFor(item, answer, quotesText) {
  if (!quotesText) return null
  let positive = 0, supported = 0, computed = 0, computedOk = 0, absence = 0
  for (const c of splitClaims(answer)) {
    if (c.kind === 'absence') { absence++; continue }
    if (c.kind === 'computed') { computed++; if (computedHolds(c.text, quotesText)) computedOk++; continue }
    positive++
    if (FAKE) { supported++; continue }
    const v = await judgeSufficiency(judge, item.question, quotesText, c.text)
    if (v === 'SUFFICIENT') supported++
  }
  return { positive, supported, computed, computedOk, absence }
}

let aggregateSourceCache = null
const aggregateSource = () => aggregateSourceCache ??= loadRows({
  source: AGGREGATE === 'pages' ? 'pages' : 'table',
  dataPath: AGGREGATE_DATA,
  corpusRoot: corpus,
})
function runAggregate(item) {
  const t0 = Date.now()
  const source = aggregateSource()
  const spec = globalSpec(item.question)
  const base = baseFor(source, spec)
  const result = askAggregate({
    expected: expectedFor(source, spec),
    rows: base,
    spec,
    question: item.question,
    formatField,
    receiptLine,
    legsFor,
  })
  return {
    text: result.answer,
    rawAnswer: result.answer,
    rawQuotes: [],
    receipt: result.final.text,
    gate: null,
    citations: [],
    usage: {},
    tokens: 0,
    ms: Date.now() - t0,
    aggregate: {
      ...result.aggregate,
      source: source.meta.source,
      coverage: result.coverage,
      citation_breadth: result.citation_breadth,
      receipt: result.final.text,
      legs: result.legs,
    },
  }
}

// D: the harness on the SAME docs as B/C, then the mechanical gate.
// A gate rejection is an abstention; a gate pass is the only shown answer.
async function runArm(arm, item) {

  const t0 = Date.now()
  const ask = chat(item)
  if (arm === 'A') {
    const r = await ask([{ role: 'user', content: 'Answer concisely. If you do not know, reply NOT FOUND.\nQuestion: ' + item.question }])
    return { text: r.content, usage: r.usage ?? {}, tokens: tok(r.usage), ms: Date.now() - t0 }
  }
  if (arm === 'DA' && AGGREGATE !== 'off' && isGlobalItem(item)) return runAggregate(item)
  const docs = window_(item)
  if (arm === 'B' || arm === 'C') {
    const r = await ask([{ role: 'user', content: PROMPT_B(item.question, docs) }])
    let text = r.content, gate = null
    if (arm === 'C' && !leadAbstain(text)) {
      const ev = docsBlock(docs)
      gate = judgeCmd ? judgeByCommand(judgeCmd, item.question, ev, text)
        : await judgeSufficiency(judge, item.question, ev, text, FAKE ? { _chat: fakeChat(item) } : {})
      if (gate !== 'SUFFICIENT') text = 'NOT FOUND (entailment check: ' + gate + ')'
    }
    return { text, gate, usage: r.usage ?? {}, tokens: tok(r.usage), ms: Date.now() - t0 }
  }
  const runDWith = async (useDocs) => {
    const res = await askOneShot(reader, corpus, item.question, {
      retriever: 'reference', promptStyle: 'v45', docs: useDocs,
      ...(FAKE ? { _chat: fakeChat(item), _vet: fakeChat(item) } : {})
    })
    const receipt = res.final?.text ?? ''
    const gateItem = { id: item.id, question: item.question, not_found: res.parsed?.notFound ?? true }
    const g = verify(gateItem, receipt, corpus, { citations: res.citations })
    const text = g.mechanicalPass ? (parseAnswer(receipt).proposed || receipt) : 'NOT FOUND (gate rejected: ' + g.why + ')'
    return { text, rawAnswer: res.parsed?.answer ?? text, rawQuotes: res.parsed?.quotes ?? [], receipt, gate: g, citations: res.citations ?? [], usage: res.usage ?? {}, tokens: res.tokens ?? 0, ms: Date.now() - t0 }
  }
  if (arm === 'Q') {
    const t0 = Date.now()
    const r = await ask([{ role: 'user', content: PROMPT_Q(item.question, docs) }], { format: ONESHOT_SCHEMA })
    let parsed = null
    try { parsed = parseOneShot(r.content) } catch { parsed = null }
    const rawText = String(r.content ?? '')
    const text = parsed ? (parsed.notFound ? 'NOT FOUND' : parsed.answer)
      : /"not_found"\s*:\s*true/.test(rawText) ? 'NOT FOUND' : rawText
    return { text, quotes: parsed?.quotes ?? [], parseFailed: !parsed, usage: r.usage ?? {}, tokens: tok(r.usage), ms: Date.now() - t0 }
  }
  if (arm === 'D') return runDWith(docs)
  if (arm === 'DA') {
    const d = await runDWith(docs)
    const triggered = d.gate.mechanicalPass && !d.text.startsWith('NOT FOUND (gate rejected') && (d.gate.abstained || shouldRunAbsence(d.text))
    if (!triggered) return d
    const a = await runAbsence({ question: item.question, docs, corpusRoot: corpus, chat: ask, read: runDWith, docChars: DOC_CHARS })
    const base = a.fixed ?? d
    const usage = { ...(base.usage ?? {}) }
    const add = (u) => {
      if (!u) return
      for (const k of ['prompt_tokens', 'completion_tokens', 'total_tokens']) if (u[k] != null) usage[k] = (usage[k] ?? 0) + u[k]
      if (u.cost != null) usage.cost = (usage.cost ?? 0) + u.cost
    }
    if (a.fixed) add(d.usage)
    add(a.usage)
    return {
      ...base,
      absence: a.absence,
      usage,
      tokens: (base.tokens ?? 0) + (a.fixed ? (d.tokens ?? 0) : 0) + (a.usage?.total_tokens ?? 0),
      ms: (d.ms ?? 0) + (a.ms ?? 0),
    }
  }
  return { text: '', ms: 0, tokens: 0, error: 'unknown arm: ' + arm }
}

// ---------- run + report ----------
const rows = []
for (let s = 0; s < seeds; s++) for (const item of items) for (const arm of arms) {
  let out
  try { out = await runArm(arm, item) } catch (e) { out = { text: '', error: String(e.message ?? e), ms: 0, tokens: 0 } }
  if (out.aggregate) {
    out.citationRaw = null
    out.citationShown = null
    out.support = null
  } else if (arm === 'Q' || arm === 'D' || arm === 'DA') {
    const docs = window_(item)
    const shown = !leadAbstain(out.text)
    if (arm === 'Q') {
      out.citationRaw = citationStats({ item, answer: out.text, quotes: out.quotes ?? [], docs })
      out.citationShown = shown ? citationStats({ item, answer: out.text, quotes: out.quotes ?? [], docs }) : null
      out.support = shown ? await supportFor(item, out.text, (out.quotes ?? []).map((q) => q.quote).join(' | ')) : null
    } else {
      const shownQuotes = shown ? (out.citations ?? []).map((c) => ({ rel: c.rel, quote: c.quote })) : []
      // DA reads counter-documents added after the original window; resolve the
      // shown citations against the documents they actually name.
      const cited = [...new Set(shownQuotes.map((q) => q.rel))]
      const shownDocs = cited.map((rel) => ({ rel, content: readFileSync(join(corpus, rel), 'utf8') }))
      out.citationRaw = arm === 'DA' ? null : citationStats({ item, answer: out.rawAnswer ?? out.text, quotes: out.rawQuotes ?? [], docs })
      out.citationShown = shown ? citationStats({ item, answer: out.text, quotes: shownQuotes, docs: shownDocs }) : null
      out.support = shownQuotes.length ? await supportFor(item, out.text, shownQuotes.map((q) => q.quote).join(' | ')) : null
    }
  }
  rows.push({ seed: s, arm, id: item.id, condition: item.condition, reader: reader.model, judge: judgeCmd ? 'cmd' : judge.model, ...out, cost: out.usage?.cost ?? null, ...score(item, out.text) })
}
mkdirSync(dirname(resolve(outPath)), { recursive: true })
writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

const pct = (k, n) => n ? (100 * k / n).toFixed(0).padStart(3) + '%' : '  - '
const ci = (k, n) => { const [a, b] = wilson(k, n); return `[${Math.max(0, 100 * a).toFixed(0)}-${Math.min(100, 100 * b).toFixed(0)}]` }
console.log(`${FAKE ? '(FAKE MODELS — plumbing check only, numbers are meaningless)\n' : ''}items=${items.length} seeds=${seeds} k=${K} reader=${reader.model} judge=${judgeCmd ? 'cmd' : judge.model}\n`)
console.log('arm  answerable-correct        unanswerable-abstain       partial-correct            false-accept(all)       s/q  tok/q   $/q   $total')
for (const arm of arms) {
  const R = rows.filter((r) => r.arm === arm)
  const cell = (cond, f) => { const x = R.filter((r) => r.condition === cond); const k = x.filter(f).length; return `${pct(k, x.length)} ${ci(k, x.length).padEnd(9)} n=${String(x.length).padEnd(3)}` }
  const fa = R.filter((r) => r.falseAccept).length
  const msq = (R.reduce((a, r) => a + r.ms, 0) / R.length / 1000).toFixed(1)
  const tokq = Math.round(R.reduce((a, r) => a + (r.tokens ?? 0), 0) / R.length)
  const priced = R.filter((r) => Number.isFinite(r.cost))
  const costSum = priced.reduce((a, r) => a + r.cost, 0)
  const costCell = priced.length ? `$${(costSum / R.length).toFixed(4)} $${costSum.toFixed(2)}` : '     -       -'
  console.log(`${arm}    ${cell('answerable', (r) => r.correct).padEnd(26)} ${cell('unanswerable', (r) => r.correct).padEnd(26)} ${cell('partial', (r) => r.correct).padEnd(26)} ${(pct(fa, R.length) + ' ' + ci(fa, R.length)).padEnd(23)} ${msq.padStart(4)} ${String(tokq).padStart(5)}  ${costCell}`)
}
// ---------- citation metrics (pre-registered 2026-10-29) ----------
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0)
const pctCell = (k, n) => n ? `${pct(k, n)} ${ci(k, n)}` : '   -'
console.log('\nCitation metrics (shown unless the scope says raw):')
console.log('arm        quotes  exact          tolerant  misattr  missing  all-valid     coverage       support+')
const scopes = []
for (const arm of arms) {
  if (arm === 'D') {
    scopes.push(['D-raw', 'D', (r) => r.citationRaw], ['D-shown', 'D', (r) => r.citationShown])
  } else if (arm === 'DA') {
    scopes.push(['DA-shown', 'DA', (r) => r.citationShown])
  } else if (arm === 'Q') {
    scopes.push(['Q-raw', 'Q', (r) => r.citationRaw], ['Q-shown', 'Q', (r) => r.citationShown])
  }
}
for (const [label, armName, get] of scopes) {
  const rowsArm = rows.filter((r) => r.arm === armName)
  const R = rowsArm.map(get).filter(Boolean)
  const q = sum(R, (c) => c.quotes)
  const ex = sum(R, (c) => c.exact)
  const tol = sum(R, (c) => c.tolerant)
  const mis = sum(R, (c) => c.misattributed)
  const miss = sum(R, (c) => c.missing)
  const withQ = R.filter((c) => c.quotes > 0)
  const valid = withQ.filter((c) => c.all_valid).length
  const covRows = R.filter((c) => c.coverage.required > 0)
  const cov = covRows.filter((c) => c.coverage.complete).length
  const sup = rowsArm.filter((r) => r.support)
  const pos = sum(sup, (r) => r.support.positive)
  const ok = sum(sup, (r) => r.support.supported)
  console.log(`${label.padEnd(9)} ${String(q).padStart(5)}  ${(pct(ex, q) + ' ' + ci(ex, q)).padEnd(15)} ${String(tol).padStart(7)}  ${String(mis).padStart(7)}  ${String(miss).padStart(7)}  ${pct(valid, withQ.length).padEnd(13)} ${pct(cov, covRows.length).padEnd(14)} ${pct(ok, pos)}`)
}
console.log('\nJoint view (shown):')
console.log('arm        correct+valid  correct+invalid  correct+none  wrong+valid  wrong+invalid  wrong+none  abstain')
for (const arm of ['Q', 'D', 'DA']) {
  const R = rows.filter((r) => r.arm === arm)
  const c = (f) => R.filter(f).length
  const st = (r) => !r.shown ? 'none' : r.citationShown ? (!r.citationShown.has_quote ? 'none' : r.citationShown.all_valid ? 'valid' : 'invalid') : 'none'
  console.log(`${arm.padEnd(9)} ${String(c((r) => r.shown && r.correct && st(r) === 'valid')).padStart(13)} ${String(c((r) => r.shown && r.correct && st(r) === 'invalid')).padStart(16)} ${String(c((r) => r.shown && r.correct && st(r) === 'none')).padStart(13)} ${String(c((r) => r.shown && !r.correct && st(r) === 'valid')).padStart(12)} ${String(c((r) => r.shown && !r.correct && st(r) === 'invalid')).padStart(14)} ${String(c((r) => r.shown && !r.correct && st(r) === 'none')).padStart(10)} ${String(c((r) => !r.shown)).padStart(7)}`)
}
if (!FAKE) {
  const Q = rows.filter((r) => r.arm === 'Q')
  if (Q.length) {
    const Qc = Q.filter((r) => r.shown).map((r) => r.citationShown).filter(Boolean)
    const qq = sum(Qc, (c) => c.quotes), qe = sum(Qc, (c) => c.exact)
    const qcovRows = Qc.filter((c) => c.coverage.required > 0), qcov = qcovRows.filter((c) => c.coverage.complete).length
    const Qsup = Q.filter((r) => r.support), qpos = sum(Qsup, (r) => r.support.positive), qok = sum(Qsup, (r) => r.support.supported)
    const qExact = qq ? qe / qq : 0, qCov = qcovRows.length ? qcov / qcovRows.length : 0, qSup = qpos ? qok / qpos : 0
    console.log(`\nPRE-REGISTERED: Q exact ${(qExact*100).toFixed(1)}% coverage ${(qCov*100).toFixed(1)}% support ${(qSup*100).toFixed(1)}% -> ${qExact >= 0.95 && qCov >= 0.90 && qSup >= 0.90 ? 'PASS (simple prompt holds)' : 'FAIL (simple prompt does not hold)'}`)
  }
  const D = rows.filter((r) => r.arm === 'D')
  if (D.length) {
    const Dc = D.map((r) => r.citationShown).filter((c) => c && c.quotes > 0)
    const dValid = Dc.length ? Dc.filter((c) => c.all_valid).length / Dc.length : 0
    const dWrongInvalid = D.filter((r) => r.shown && !r.correct && r.citationShown && r.citationShown.invalid > 0).length
    console.log(`PRE-REGISTERED: D shown-validity ${(dValid*100).toFixed(1)}% wrong+invalid ${dWrongInvalid} -> ${dValid === 1 && dWrongInvalid === 0 ? 'PASS' : 'FAIL'}`)
  }
}
console.log(`\nrows -> ${outPath}. Intervals are Wilson 95% over seed-pooled rows (seeds are not independent questions: widen by eye).`)
console.log('$/q and $total come from provider usage.cost when the endpoint reports it; blank when it does not.')
