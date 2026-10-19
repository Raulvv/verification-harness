#!/usr/bin/env node
// b121 — END-TO-END IR run: gold not guaranteed (open passage pool).
//
// Arms over HotpotQA distractor rows (pool = union of ALL rows' context
// paragraphs, ~3k docs at N=300 — a paragraph is gold for one question and a
// distractor for the others, retrieval can genuinely miss):
//   bare   — closed book (no documents): the IR baseline
//   naive  — one plain answer over the iterative window
//   ours   — receipt one-shot (PROMPT_V45) + frozen gate (gate-config.json)
//            → states recorded, judge = gate-config judge
// Retrieval (per iterative-hotpot.mjs, K=6): dense + hybrid (dense+BM25 RRF)
// recalls recorded model-free per item; the ANSWERING window is
// hybrid + bridge re-retrieval (the iterative lever, 94% both-gold @6 on this
// pool). Deepseek strict oracle labels shown rows of every arm (phase 2).
//
// Resumable: rows are keyed (arm,id), appended per arm, skipped on restart;
// oracle fills `oracle_correct: null` in phase 2 with atomic checkpoints.
//
//   node bench/e2e-ir.mjs [N]          # OUT / POOL / READER_MODEL / JUDGE_MODEL env overrides
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { hotpotRows } from './ingest-hotpot.mjs'
import { selectByDense, selectFuse, chatWithUsage, parseOneShot, PROMPT_V45, ONESHOT_SCHEMA } from '../kit/index.mjs'
import { assembleOneShot } from '../kit/lib/answer/assemble.mjs'
import { judgeGrade } from '../kit/lib/receipts/sufficiency.mjs'
import { parseVerdict } from './audit-classify.mjs'
import { containsGold, judgePrompt } from './lib/judge.mjs'
import { buildPool, bothGold, summarize, pct } from './lib/e2e-ir-core.mjs'
import { CACHE } from './ingest.mjs'

const N = Number(process.argv[2] ?? 300)
const K = 6
const OUT = process.env.OUT ?? `bench/results/b121-e2eir-4b.jsonl`
const POOL = process.env.POOL ?? join(CACHE, `e2e-ir-pool-${N}`)
const CFG = JSON.parse(readFileSync(new URL('./gate-config.json', import.meta.url), 'utf8'))
const HOSTED = /^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/
// Hosted credentials load on demand: a local-only run (local reader, local
// judge, local bridge) works on a machine without them, while a hosted model
// configured without them still fails loud before any network call.
let KEY = null
const hostedKey = () => {
  if (KEY === null) {
    try {
      KEY = JSON.parse(readFileSync(process.env.HOME + '/.local/share/opencode/auth.json', 'utf8'))['opencode-go'].key
    } catch (err) {
      throw new Error(`hosted call needs ~/.local/share/opencode/auth.json ("opencode-go" key): ${err?.message ?? err}`)
    }
  }
  return KEY
}
const HAS_KEY = (() => { try { hostedKey(); return true } catch { return false } })()
const READER_MODEL = process.env.READER_MODEL ?? CFG.reader_model
const READER = /^(glm|deepseek|kimi|gpt|claude|grok|mimo|minimax|omen|qwen3\.[678])/.test(READER_MODEL)
  ? { baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: hostedKey(), model: READER_MODEL }
  : { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: READER_MODEL }
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? CFG.judge_model
const JUDGE = HOSTED.test(JUDGE_MODEL)
  ? { baseUrl: CFG.judge_base_url, apiKey: hostedKey(), model: JUDGE_MODEL }
  : { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: JUDGE_MODEL }
const BRIDGE_MODEL = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: process.env.RETRIEVAL_MODEL ?? 'qwen3.5:4b' }
// ours9b: the fully-local gate arm — same answers as ours, judged by a local
// 9B. ONLY=ours9b restricts phase 1 to that arm (rows reused from the core file).
const JUDGE9B = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: process.env.JUDGE9B_MODEL ?? 'qwen3.5:9b' }
const ONLY = process.env.ONLY?.split(',').filter(Boolean) ?? null
const CORE = process.env.CORE ?? 'bench/results/b121-e2eir-4b.jsonl'

const ARMS = ['bare', 'naive', 'ours']
// stateOf: verbatim from bench/hotpot-fresh.mjs (the frozen gate mapping)
const stateOf = (abstained, score, parseFailed = false) => {
  if (abstained) return { state: 'not_found', fail_reason: parseFailed ? 'parse_failure' : 'reader_abstained' }
  if (score == null) return { state: 'unverified', fail_reason: 'judge_no_score' }
  if (score < CFG.lo) return { state: 'not_found', fail_reason: null }
  if (score >= CFG.hi) return { state: 'verified', fail_reason: null }
  return { state: 'unverified', fail_reason: null }
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const BARE = (q) => `Question: ${q}\n\nAnswer the question briefly with what you know.`
const NAIVE = (q, parts) => ['Documents:', ...parts, '', `Question: ${q}`, '', 'Answer the question briefly using the documents.'].join('\n')
const BRIDGE = (q, parts) => ['Question: ' + q, '', 'Documents:', ...parts, '', 'What single SHORT search query (a few words — the missing entity or fact) would find the information needed to answer the question? Reply with ONLY the query text.'].join('\n')
const stamp = () => new Date().toISOString().slice(11, 19)
const say = (...a) => { console.log(`${stamp()} ${a.join(' ')}`) }
// strict deepseek oracle — audit-classify's parseVerdict (content only, exact
// word) with an ESCALATING token budget: v4.1-flash sometimes burns a 1500-token
// budget in reasoning before the final word (finish_reason=length, empty
// content), which stalls labeling. Budgets 4k→8k; a row that still fails stays
// null and is reported — never guessed.
const oracleStrict = async (question, gold, ans) => {
  const last = { content: '' }
  for (const budget of [4000, 8000]) {
    const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + hostedKey(), 'Content-Type': 'application/json', 'x-opencode-session': 'ses_' + Math.random().toString(16).slice(2, 26) },
      body: JSON.stringify({ model: 'deepseek-v4.1-flash', max_tokens: budget, temperature: 0, messages: [{ role: 'user', content: judgePrompt(question, gold, ans) }] }),
    })
    const j = await r.json()
    if (!r.ok || !j.choices?.[0]?.message) throw new Error(`oracle: HTTP ${r.status}`)
    last.content = j.choices[0].message.content ?? ''
    const v = parseVerdict(last.content)
    if (v !== null) return v ? 1 : 0
  }
  throw new Error(`oracle: no YES/NO verdict after budget escalation (content: ${JSON.stringify(last.content.slice(0, 120))})`)
}

async function readAnswer (prompt, { json = false } = {}) {
  const t0 = Date.now()
  if (READER.baseUrl.startsWith('https')) {
    const res = await chatWithUsage(READER, [{ role: 'user', content: prompt }], { maxTokens: 1000, think: false, ...(json ? { format: ONESHOT_SCHEMA } : {}) })
    return { content: res.content ?? '', tokens: (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0), ms: Date.now() - t0 }
  }
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: READER_MODEL, messages: [{ role: 'user', content: prompt }], stream: false, think: false, ...(json ? { format: ONESHOT_SCHEMA } : {}), options: { temperature: 0, num_predict: 1000 } }),
  })
  if (!res.ok) throw new Error(`reader: HTTP ${res.status}`)
  const j = await res.json()
  return { content: j.message?.content ?? '', tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0), ms: Date.now() - t0 }
}

// ---- pool (stable across chunks → the dense index is embedded once) ----
const rows0 = await hotpotRows(N)
const manPath = join(POOL, '.pool.json')
let pool
if (existsSync(manPath)) {
  const man = JSON.parse(readFileSync(manPath, 'utf8'))
  if (man.n === N) { pool = buildPool(rows0); say(`pool reused: ${POOL} (${pool.docs.length} docs, ${pool.items.length} items)`) }
}
if (!pool) {
  if (existsSync(POOL)) rmSync(POOL, { recursive: true, force: true })
  mkdirSync(POOL, { recursive: true })
  pool = buildPool(rows0)
  pool.docs.forEach((d, i) => writeFileSync(join(POOL.replace(/\/$/, '') + '/', pool.rels[i]), `# ${d.title}\n${d.text}`))
  writeFileSync(manPath, JSON.stringify({ n: N, count: pool.docs.length }))
  say(`pool built: ${POOL} (${pool.docs.length} docs, ${pool.items.length} items)`)
}
const relIdx = new Map(pool.rels.map((r, i) => [r, i]))
const readDoc = (rel) => readFileSync(join(POOL, rel), 'utf8')
const partsOf = (rels) => rels.map((rel, i) => `=== DOC ${i + 1}: ${rel} ===\n${readDoc(rel)}`)

// ---- resume state ----
// tolerant load: a chunk killed mid-write can leave a truncated tail line; it
// is dropped (and repaired out of the file) so resume never crashes on it.
const loadJsonl = (p) => {
  if (!existsSync(p)) return []
  const good = []; let dropped = 0
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    if (!l) continue
    try { good.push(JSON.parse(l)) } catch { dropped++ }
  }
  if (dropped) { const tmp = p + '.tmp'; writeFileSync(tmp, good.map((r) => JSON.stringify(r)).join('\n') + '\n'); renameSync(tmp, OUT); say(`repaired ${dropped} truncated tail line(s) in ${p}`) }
  return good
}
const done = new Set()
const existing = loadJsonl(OUT)
const coreRows = ONLY?.includes('ours9b') ? loadJsonl(CORE) : []
for (const r of existing) done.add(`${r.arm}\u0000${r.id}`)
say(`b121 e2e-ir · N=${N} K=${K} · reader ${READER_MODEL} · judge ${JUDGE_MODEL} · pool ${pool.docs.length} docs · rows ${existing.length} · resume ${done.size} keys`)

// deterministic window: dense + hybrid recalls + bridge re-retrieval (temp-0
// retrieval reproduces byte-identically; verified). Returns everything phase-1
// arms and the ours9b judge pass need.
async function windowFor (item) {
  const baseD = (await selectByDense(POOL, item.question, { corpus: pool.rels, k: K })).candidates.map((c) => relIdx.get(c.rel)).filter((x) => x !== undefined)
  const baseH = (await selectFuse(POOL, item.question, { corpus: pool.rels, k: K })).candidates.map((c) => relIdx.get(c.rel)).filter((x) => x !== undefined)
  let bridge = ''
  const t0 = Date.now()
  try { bridge = String((await chatWithUsage(BRIDGE_MODEL, [{ role: 'user', content: BRIDGE(item.question, partsOf(baseH.map((id) => pool.rels[id]))) }], { maxTokens: 40, think: false })).content ?? '').trim().split('\n')[0].slice(0, 80) } catch {}
  const secBridge = Number(((Date.now() - t0) / 1000).toFixed(2))
  const turn2 = bridge ? (await selectFuse(POOL, bridge, { corpus: pool.rels, k: K })).candidates.map((c) => relIdx.get(c.rel)).filter((x) => x !== undefined) : []
  const windowIds = [...new Set([...baseH, ...turn2])].slice(0, K * 2)
  const rec = {
    recall_dense: bothGold(baseD, item.goldIds) ? 1 : 0,
    recall_hybrid: bothGold(baseH, item.goldIds) ? 1 : 0,
    recall_iterative: bothGold(windowIds, item.goldIds) ? 1 : 0,
    gold_n: item.goldIds.length, retrieved_n: windowIds.length, sec_bridge: secBridge,
  }
  const winRels = windowIds.map((id) => pool.rels[id])
  const winDocs = winRels.map((rel) => ({ rel, content: readDoc(rel) }))
  return { rec, winRels, winDocs }
}

const rowOf = (arm, item, extra) => ({
  arm, id: item.id, i: item.i, type: item.type, question: item.question, gold: item.answer,
  pool_n: N, k: K, reader_model: READER_MODEL,
  ...extra,
})

// ---- phase 1: retrieval + arms ----
for (const item of pool.items) {
  const relevant = ONLY ?? ARMS
  const missing = relevant.filter((a) => !done.has(`${a}\u0000${item.id}`))
  if (!missing.length) continue
  try {
    const written = []
    const { rec, winRels, winDocs } = await windowFor(item)
    const parts = partsOf(winRels)

    if (missing.includes('bare')) {
      const read = await readAnswer(BARE(item.question))
      const answer = read.content ?? ''
      const row = rowOf('bare', item, { ...rec, answer, quote: null, contains_gold: containsGold(answer, item.answer) ? 1 : 0, oracle_correct: null, reader_abstained: 0, parse_failure: 0, score: null, state: null, fail_reason: null, judge_model: null, quote_in_gold: null, sec_reader: Number((read.ms / 1000).toFixed(2)), sec_judge: null, tokens_reader: read.tokens })
      appendFileSync(OUT, JSON.stringify(row) + '\n'); done.add(`bare\u0000${item.id}`); written.push(row)
    }
    if (missing.includes('naive')) {
      const read = await readAnswer(NAIVE(item.question, parts))
      const answer = read.content ?? ''
      const row = rowOf('naive', item, { ...rec, answer, quote: null, contains_gold: containsGold(answer, item.answer) ? 1 : 0, oracle_correct: null, reader_abstained: 0, parse_failure: 0, score: null, state: null, fail_reason: null, judge_model: null, quote_in_gold: null, sec_reader: Number((read.ms / 1000).toFixed(2)), sec_judge: null, tokens_reader: read.tokens })
      appendFileSync(OUT, JSON.stringify(row) + '\n'); done.add(`naive\u0000${item.id}`); written.push(row)
    }
    if (missing.includes('ours')) {
      const read = await readAnswer(PROMPT_V45(item.question, parts), { json: true })
      let parsed = null, abstained = false, answer = 'NOT FOUND', quote = '', parseFailed = false
      try { parsed = parseOneShot(read.content); abstained = Boolean(parsed.notFound); answer = parsed.answer; const asm = assembleOneShot(POOL, item.question, winDocs, parsed); quote = (asm.legs ?? []).map((l) => l.quote).join(' | ') } catch { parseFailed = true }
      const noAnswer = abstained || parseFailed
      let score = null, secJudge = null
      if (!noAnswer) {
        const ev = winDocs.map((d) => { const m = /^# (.*)$/.exec(String(readDoc(d.rel)).split('\n')[0] ?? ''); return `# ${m ? m[1] : d.rel}\n${d.content}` }).join('\n\n')
        const jt0 = Date.now()
        score = await judgeGrade(JUDGE, item.question, ev, answer)
        secJudge = Number(((Date.now() - jt0) / 1000).toFixed(2))
      }
      const { state, fail_reason } = stateOf(noAnswer, score, parseFailed)
      const gText = norm(item.goldIds.map((id) => pool.docs[id].text).join(' '))
      const row = rowOf('ours', item, { ...rec, answer, quote: quote || null, contains_gold: !noAnswer && containsGold(answer, item.answer) ? 1 : 0, oracle_correct: null, reader_abstained: abstained ? 1 : 0, parse_failure: parseFailed ? 1 : 0, score, state, fail_reason, judge_model: noAnswer ? null : JUDGE_MODEL, quote_in_gold: quote ? (gText.includes(norm(quote.slice(0, 60))) ? 1 : 0) : 0, sec_reader: Number((read.ms / 1000).toFixed(2)), sec_judge: secJudge, tokens_reader: read.tokens })
      appendFileSync(OUT, JSON.stringify(row) + '\n'); done.add(`ours\u0000${item.id}`); written.push(row)
    }
    if (missing.includes('ours9b')) {
      const src = coreRows.find((x) => x.arm === 'ours' && x.id === item.id)
      if (!src) say(`[ours9b SKIP] ${item.id} — no ours row in ${OUT} (run the core arms first)`)
      else {
        // window-fidelity backstop: a stored quote must live in a window doc
        const fidelity = src.quote ? (winDocs.some((d) => norm(d.content).includes(norm(String(src.quote).slice(0, 60)))) ? 1 : 0) : null
        if (fidelity === 0) say(`[WINDOW MISMATCH] ${item.id} — recomputed window does not contain the stored quote; row flagged`)
        const noAnswer = Boolean(src.reader_abstained || src.parse_failure)
        let score = null, secJudge = null
        if (!noAnswer) {
          const ev = winDocs.map((d) => { const m = /^# (.*)$/.exec(String(readDoc(d.rel)).split('\n')[0] ?? ''); return `# ${m ? m[1] : d.rel}\n${d.content}` }).join('\n\n')
          const jt0 = Date.now()
          score = await judgeGrade(JUDGE9B, item.question, ev, src.answer)
          secJudge = Number(((Date.now() - jt0) / 1000).toFixed(2))
        }
        const { state, fail_reason } = stateOf(noAnswer, score, Boolean(src.parse_failure))
        const row = rowOf('ours9b', item, {
          ...rec, window: winRels, window_fidelity: fidelity,
          answer: src.answer, quote: src.quote, contains_gold: src.contains_gold, oracle_correct: src.oracle_correct,
          reader_abstained: src.reader_abstained, parse_failure: src.parse_failure,
          score, state, fail_reason, judge_model: noAnswer ? null : JUDGE9B.model,
          quote_in_gold: src.quote_in_gold, sec_reader: src.sec_reader, sec_judge: secJudge, tokens_reader: src.tokens_reader,
        })
        appendFileSync(OUT, JSON.stringify(row) + '\n'); done.add(`ours9b\u0000${item.id}`); written.push(row)
      }
    }
    const brief = written.map((r) => `${r.arm[0]}:${r.arm === 'ours' || r.arm === 'ours9b' ? r.state?.slice(0, 2) : ''}c${r.contains_gold}`).join(' ')
    say(`[${String(item.i + 1).padStart(3, '0')}/${N}] ${item.id.slice(0, 8)} ${item.type} rec d${rec.recall_dense}h${rec.recall_hybrid}i${rec.recall_iterative} win${rec.retrieved_n} ${brief}`)
  } catch (err) {
    say(`[ERROR ${item.i + 1}/${N}] ${item.id} ${err?.message ?? err} — will retry on next chunk`)
  }
}

// ---- phase 2: deepseek strict oracle on shown rows ----
const checkpoint = (all) => { const tmp = OUT + '.tmp'; writeFileSync(tmp, all.map((r) => JSON.stringify(r)).join('\n') + '\n'); renameSync(tmp, OUT) }
let all = loadJsonl(OUT)
// deferred while answering is incomplete, so chunk time buys items first;
// the oracle then runs in dedicated chunks at the end (resumable as ever).
const answering = pool.items.some((it) => (ONLY ?? ARMS).some((a) => !done.has(`${a}\u0000${it.id}`)))
if (answering) say(`phase 2 deferred — ${all.length} rows so far, answering incomplete`)
let pending = answering ? [] : all.filter((r) => r.oracle_correct == null)
if (pending.length && !HAS_KEY) {
  say('phase 2: oracle skipped — no hosted credentials (~/.local/share/opencode/auth.json); rows left unlabeled')
  pending = []
}
if (pending.length) say(`phase 2: oracle for ${pending.length} rows`)
let filled = 0
const skipped = []
for (const r of pending) {
  const shown = r.arm === 'ours' ? r.state !== 'not_found' : true
  try {
    r.oracle_correct = shown ? (await oracleStrict(r.question, r.gold, r.answer) ? 1 : 0) : 0
    filled++
    if (filled % 10 === 0) { checkpoint(all); say(`oracle ${filled}/${pending.length} (${r.arm} ${r.id.slice(0, 8)} → ${r.oracle_correct})`) }
  } catch (err) {
    skipped.push(`${r.arm}:${r.id}`)
    say(`[ORACLE SKIP ${skipped.length}] ${r.arm} ${r.id} ${err?.message ?? err} — row stays null (unlabeled)`)
  }
}
if (filled) checkpoint(all)
if (skipped.length) say(`oracle skipped ${skipped.length} row(s), left unlabeled: ${skipped.join(' ')}`)

// ---- summary ----
all = loadJsonl(OUT)
const s = summarize(all, pool.items.length)
say(`\n=== b121 summary · ${all.length} rows · ${pct(all.filter((r) => r.oracle_correct != null).length, all.length)} oracle-labeled ===`)
say(`recall@${K} both-gold (n=${s.recall.n}): dense ${pct(s.recall.dense, s.recall.n)} · hybrid ${pct(s.recall.hybrid, s.recall.n)} · iterative ${pct(s.recall.iterative, s.recall.n)}`)
for (const [t, v] of Object.entries(s.byType)) say(`  by type ${t}: n=${v.n} d${v.dense} h${v.hybrid} i${v.iterative}`)
const shownRows = (arm) => all.filter((r) => r.arm === arm && (!['ours', 'ours9b'].includes(arm) || r.state !== 'not_found'))
for (const arm of ARMS) {
  const a = s.arms[arm]
  if (!a) continue
  const sh = shownRows(arm)
  say(`${arm.padEnd(6)} contains ${pct(a.contains, a.n)} · shown ${a.shown} · oracle(shown) ${pct(sh.filter((r) => r.oracle_correct).length, sh.length)}${a.states ? ` · states nf${a.states.not_found} uv${a.states.unverified} vf${a.states.verified}` : ''}`)
}
for (const [state, v] of Object.entries(s.crossTab)) say(`  gate×contains ${state}: n=${v.n} contains=${pct(v.contains, v.n)} oracle=${pct(v.oracle_correct, v.oracle_labeled)}`)
if (all.some((r) => r.arm === 'ours9b')) {
  const s9 = summarize(all.filter((r) => r.arm === 'ours9b'), pool.items.length, ['ours9b'])
  const a = s9.arms.ours9b
  const sh9 = shownRows('ours9b')
  say(`ours9b  contains ${pct(a.contains, a.n)} · shown ${a.shown} · oracle(shown) ${pct(sh9.filter((r) => r.oracle_correct).length, sh9.length)} · states nf${a.states.not_found} uv${a.states.unverified} vf${a.states.verified}`)
  for (const [state, v] of Object.entries(s9.crossTab)) say(`  gate9b×contains ${state}: n=${v.n} contains=${pct(v.contains, v.n)} oracle=${pct(v.oracle_correct, v.oracle_labeled)}`)
  const kimi = new Map((coreRows.length ? coreRows : all).filter((r) => r.arm === 'ours').map((r) => [r.id, r.state]))
  const agree = { exact: 0, n: 0 }
  const trans = {}
  for (const r of all.filter((r) => r.arm === 'ours9b')) {
    const k = kimi.get(r.id); if (!k) continue
    agree.n++; if (k === r.state) agree.exact++
    const key = `${k}→${r.state}`; trans[key] = (trans[key] ?? 0) + 1
  }
  say(`judge agreement kimi vs 9b: exact ${pct(agree.exact, agree.n)} · transitions ${JSON.stringify(trans)}`)
  const mism = all.filter((r) => r.arm === 'ours9b' && r.window_fidelity === 0).length
  if (mism) say(`WINDOW MISMATCHES: ${mism} row(s) — compare with care`)
}
say(`wrote ${OUT}`)
