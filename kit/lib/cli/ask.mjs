// `ask` — resolve the workspace, run the one-shot machine, and print the answer
// with a machine-checked receipt (RN-G01/G04). Pure orchestration; the model
// boundary stays injectable so the command is testable offline.
import { spawnSync } from 'node:child_process'
import { askOneShot } from '../answer/oneshot.mjs'
import { askAggregate } from '../answer/aggregate.mjs'
import { verify } from '../receipts/gate.mjs'
import { parseAnswer, ABSTAIN_TERMS } from '../receipts/text.mjs'
import { ungroundedTerms } from '../receipts/grounding.mjs'
import { judgeSufficiency, judgeByCommand, judgeGrade } from '../receipts/sufficiency.mjs'
import { judgeEvidenceFor } from '../receipts/evidence.mjs'
import { runAbsence, shouldRunAbsence } from '../answer/absence.mjs'
import { resolveAsk } from './resolve.mjs'
import { validateFlags, ASK_FLAGS, ASK_BOOLEAN } from '../cli.mjs'

// Formal path: delegate to an external deterministic verifier. The kit stays
// standalone — it never hardcodes the parent repo's Python package. The caller
// supplies the command (or RETRIEVAL_FORMAL_CMD). Protocol: JSON on stdin,
// JSON on stdout with {answer, verdict, assumptions, citations, ...}.
function gateFormalCitations(formal, { question, corpus }) {
  const citations = formal.citations ?? []
  if (!citations.length) return formal
  if (!corpus) {
    return {
      ...formal,
      citations: citations.map((c) => ({ ...c, gate: { passed: null, why: 'ungated: no --corpus supplied' } })),
    }
  }
  return {
    ...formal,
    citations: citations.map((c) => {
      const rel = c.rel ?? (c.slug ? `${c.slug}.md` : '')
      if (!rel || !c.quote) return { ...c, gate: { passed: false, why: 'ungated: missing rel or quote' } }
      const gate = verify(
        { id: 'formal-cite', question, not_found: false },
        '',
        corpus,
        { citations: [{ title: c.title, date: '', rel, quote: c.quote }] },
      )
      return { ...c, gate: { passed: gate.mechanicalPass, why: gate.why } }
    }),
  }
}

async function runFormalAsk({ question, flags, env, cwd, formalFn }) {
  const started = Date.now()
  if (formalFn) {
    const out = await formalFn({ question, flags, env, cwd })
    const formal = gateFormalCitations(out.formal ?? {}, { question, corpus: flags.corpus })
    return { ...out, formal, question: out.question ?? question, ms: out.ms ?? (Date.now() - started) }
  }
  const cmd = flags.formalCmd ?? env.RETRIEVAL_FORMAL_CMD
  if (!cmd) {
    throw new Error('--formal needs --formal-cmd <cmd> or RETRIEVAL_FORMAL_CMD (the command must read JSON on stdin and write JSON on stdout)')
  }
  const payload = JSON.stringify({ question, no_defaults: flags.noDefaults === true })
  const r = spawnSync('sh', ['-c', cmd], {
    input: payload,
    encoding: 'utf8',
    cwd: flags.formalCwd ?? cwd,
    maxBuffer: 1 << 20,
  })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`formal command exited ${r.status}: ${r.stderr ?? ''}`)
  let formal
  try {
    formal = JSON.parse(r.stdout)
  } catch {
    throw new Error('formal command did not emit JSON')
  }
  formal = gateFormalCitations(formal, { question, corpus: flags.corpus })
  return { question, formal, ms: Date.now() - started }
}

export async function runAsk({ question, flags = {}, env = process.env, cwd = process.cwd(), probe, chat, embed, judgeFn, gradeFn, formalFn } = {}) {
  if (!question || !String(question).trim()) throw new Error('no question — usage: retrieval-kit ask "<question>"')
  validateFlags(flags, ASK_FLAGS, { booleans: ASK_BOOLEAN })
  if (flags.maxQuotesPerDoc != null) {
    const n = Number(flags.maxQuotesPerDoc)
    if (!Number.isInteger(n) || n < 1) throw new Error('--max-quotes-per-doc must be a positive integer')
  }
  if (flags.formal || flags.formalCmd) {
    return runFormalAsk({ question, flags, env, cwd, formalFn })
  }
  const started = Date.now()
  const r = await resolveAsk({ flags, env, cwd, probe })
  const read = async (docs) => {
    const t0 = Date.now()
    const out = await askOneShot(r.model, r.corpusRoot, String(question).trim(), {
      retriever: r.retriever,
      promptStyle: r.tier,
      corpus: r.corpusFiles ?? undefined,
      minimizeReceipt: flags.minimalReceipt === true,
      maxQuotesPerDoc: flags.maxQuotesPerDoc != null ? Number(flags.maxQuotesPerDoc) : undefined,
      ...(Array.isArray(docs) ? { docs } : {}),
      _chat: chat,
      _embed: embed,
    })
    const receipt = out.final?.text ?? ''
    const gateItem = { id: 'q', question, not_found: out.parsed?.notFound ?? true }
    const gate = verify(gateItem, receipt, r.corpusRoot, { citations: out.citations })
    const text = gate.mechanicalPass ? (parseAnswer(receipt).proposed || receipt) : 'NOT FOUND (gate rejected: ' + gate.why + ')'
    return { ...out, receipt, gate, text, ms: Date.now() - t0 }
  }
  let res = await read()
  let absence = null
  if (r.absence && res.gate?.mechanicalPass && !res.text.startsWith('NOT FOUND (gate rejected') && shouldRunAbsence(res.text)) {
    const first = res
    const a = await runAbsence({ question, docs: res.docs ?? [], corpusRoot: r.corpusRoot, chat, read })
    absence = a.absence
    if (a.fixed) {
      res = { ...a.fixed, absence: a.absence }
      const usage = { ...(res.usage ?? {}) }
      const add = (u) => {
        if (!u) return
        for (const k of ['prompt_tokens', 'completion_tokens', 'total_tokens']) if (u[k] != null) usage[k] = (usage[k] ?? 0) + u[k]
        if (u.cost != null) usage.cost = (usage.cost ?? 0) + u.cost
      }
      add(first.usage)
      add(a.usage)
      res.usage = usage
      res.tokens = (res.tokens ?? 0) + (first.tokens ?? 0) + (a.usage?.total_tokens ?? 0)
      res.ms = (first.ms ?? 0) + (a.ms ?? 0)
    }
  }
  const text = res.final?.text ?? res.receipt ?? ''
  // The gate judges the RECEIPT, not the model's `not_found` flag. A refusal is
  // the refusal *vocabulary* in the Q-line (the gate's own ABSTAIN_TERMS), so an
  // honest "the documents do not state…" is an abstention; a claim with
  // Source/Quote NOT FOUND is not, and is rejected.
  // A reader that produced NO parseable answer has failed — it has not
  // abstained. askOneShot returns a NOT FOUND-shaped fallback in that case; it
  // must never pass the gate as a "correct abstention" (a dead call would look
  // identical to an honest refusal, with 0 tokens).
  const readerError = res.parsed ? null : (res.parseFailures?.[0] ?? 'reader produced no parseable answer')
  const proposed = parseAnswer(text).proposed.toLowerCase()
  let abstained = !readerError && ABSTAIN_TERMS.some((m) => proposed.includes(m))
  // NON-AUTHORITATIVE hint only (a lexical check cannot decide sufficiency).
  let grounding = null
  const useGrounding = flags.grounding !== false && !flags.noGrounding
  if (useGrounding && !readerError && !abstained && Array.isArray(res.docs) && res.docs.length) {
    const missing = ungroundedTerms(parseAnswer(text).proposed, res.docs.map((d) => d.content).join('\n'))
    if (missing.length) grounding = { missing }
  }
  // The sufficiency judge — the model check the gate cannot do. The graded gate
  // (default, opt-in: --sufficient --judge <model>) scores quote→answer support
  // 1–5 (schema-constrained) and bands it (frozen lo/hi, B95): score<lo abstains,
  // lo..hi-1 shows flagged "unverified", >=hi "verified". A command judge or an
  // injected judgeFn keeps the binary SUFFICIENT/INSUFFICIENT contract.
  let sufficiency = null
  let failReason = null
  let state = readerError ? 'error' : abstained ? 'not_found' : null
  if (r.sufficient && !readerError && !abstained && Array.isArray(res.docs) && res.docs.length) {
    const evidence = judgeEvidenceFor(r.judgeEvidence, text, question, res.docs, res.legs)
    const answer = parseAnswer(text).proposed
    if (judgeFn || r.judgeCmd) {
      const verdict = judgeFn
        ? await judgeFn(question, evidence, answer)
        : judgeByCommand(r.judgeCmd, question, evidence, answer, { cwd })
      sufficiency = { judge: r.judgeCmd ?? r.judge.model, verdict }
      if (verdict === 'SUFFICIENT') state = 'verified'
      else if (r.unverified) state = 'unverified' // keep the answer, flag it
      else { abstained = true; state = 'not_found' }
    } else {
      const score = gradeFn ? await gradeFn(question, evidence, answer) : await judgeGrade(r.judge, question, evidence, answer)
      sufficiency = { judge: r.judge.model, score }
      if (score == null) { state = 'unverified'; failReason = 'judge_no_score' } // reader answered, no score → flag, never drop
      else if (score >= r.gateHi) state = 'verified'
      else if (score >= r.gateLo) state = 'unverified'
      else { abstained = true; state = 'not_found' }
      if (r.judge.model === r.modelId) sufficiency.note = `judge == reader (${r.modelId}) — self-preference risk; use a different family`
    }
  }
  const receipt = state === 'not_found' && sufficiency
    ? 'Q: NOT FOUND — the retrieved documents do not support the answer\nSource: NOT FOUND'
    : text
  const item = { id: 'q', question, not_found: abstained, candidates: [] }
  const g = readerError
    ? { mechanicalPass: false, why: `reader failed: ${readerError}` }
    : verify(item, receipt, r.corpusRoot, { citations: res.citations })
  return {
    question, receipt, abstained, state, fail_reason: failReason,
    reader_error: readerError, parse_failures: res.parseFailures ?? [],
    citations: res.citations ?? [],
    gate: { passed: g.mechanicalPass, why: g.why },
    absence, grounding, sufficiency,
    retriever: r.retriever, tier: r.tier, model: r.modelId,
    window: res.window ?? [], tokens: res.tokens ?? null, usage: res.usage ?? null,
    timings: { ...(res.timings ?? {}), absence_ms: absence ? (res.ms ?? 0) : 0 },
    ms: Date.now() - started, // wall time from the ask to the printed answer
  }
}

export function runAggregate({ rows, spec, question = 'aggregate query' } = {}) {
  const r = askAggregate({ rows, spec, question, expected: spec.expected })
  return { question, answer: r.answer, receipt: r.final.text, coverage: r.coverage, aggregate: r.aggregate, citation_breadth: r.citation_breadth, quote: r.quote, legs: r.legs }
}

export function formatAggregate(res, { json = false } = {}) {
  if (json) {
    return JSON.stringify({
      question: res.question, answer: res.answer, receipt: res.receipt,
      coverage: res.coverage, aggregate: res.aggregate, citation_breadth: res.citation_breadth,
      legs: res.legs
    }, null, 2)
  }
  const c = res.coverage
  return `${res.receipt}\n\ncoverage: ${c.candidates}/${c.expected}${c.complete ? ' complete' : ' INCOMPLETE'}`
}

// Human receipt: the evidence grouped by source and section, never a flat
// ` | ` line. The canonical `Q:/Source:/Quote:` receipt stays untouched (gate,
// scorer, stored results); this is presentation only.
function formatEvidence(res) {
  const cites = res.citations ?? []
  if (!cites.length) return null
  const proposed = parseAnswer(res.receipt).proposed
  const docs = new Map()
  for (const c of cites) if (!docs.has(c.document_index)) docs.set(c.document_index, c)
  const out = [`Q: ${proposed}`, '', 'Sources:']
  for (const [n, c] of [...docs.entries()].sort((a, b) => a[0] - b[0])) {
    out.push(`  [${n}] ${c.title} (${c.date || 'unknown'}) · ${c.rel}`)
  }
  out.push('', 'Evidence:')
  for (const c of cites) {
    const label = c.exact
      ? ([c.section, c.kind !== 'prose' ? c.kind : null].filter(Boolean).join(', ') || 'source')
      : 'tolerant match'
    out.push(`  [${c.document_index}] (${label})`)
    if (c.context) out.push(`      context: ${c.context}`)
    for (const line of String(c.quote).split('\n')) out.push(`      ${line}`)
    out.push('')
  }
  return out.join('\n').trimEnd()
}

function formatFormal(res, { json = false } = {}) {
  const f = res.formal
  if (json) {
    return JSON.stringify({ question: res.question, formal: f, ms: res.ms }, null, 2)
  }
  const lines = [`Q: ${res.question}`, `A: ${f.answer}`, '']
  lines.push('Assumptions:')
  const assumptions = f.assumptions ?? []
  if (!assumptions.length) lines.push('  (none)')
  else for (const a of assumptions) lines.push(`  - ${a.human} [${a.source}]`)
  lines.push('', 'Evidence:')
  const cites = f.citations ?? []
  if (!cites.length) lines.push('  (no structured citations)')
  else {
    for (let i = 0; i < cites.length; i++) {
      const c = cites[i]
      const gate = c.gate
        ? c.gate.passed === true
          ? 'gate: verified'
          : c.gate.passed === false
            ? `gate: REJECTED — ${c.gate.why}`
            : 'gate: ungated'
        : 'gate: ungated'
      lines.push(`  [${i + 1}] ${c.title} · ${c.slug} · ${c.field}  (${gate})`)
      for (const line of String(c.quote ?? '').split('\n')) lines.push(`      ${line}`)
    }
  }
  if (f.unresolved?.length) {
    lines.push('', 'Unresolved:')
    for (const u of f.unresolved) lines.push(`  - ${u.kind}:${u.symbol} allowed=${(u.allowed ?? []).join(', ')}`)
  }
  const spec = f.spec_version ? ` · spec ${f.spec_version}` : ''
  const id = f.spec_id ? ` · ${f.spec_id}` : ''
  lines.push('', `formal: ${f.verdict}${spec}${id}`)
  if (f.route?.action) lines.push(`route: ${f.route.action} — ${f.route.reason ?? ''}`)
  return lines.join('\n')
}

export function formatAsk(res, { json = false } = {}) {
  if (res.formal) return formatFormal(res, { json })
  if (json) {
    return JSON.stringify({
      question: res.question, receipt: res.receipt, state: res.state, fail_reason: res.fail_reason ?? null, reader_error: res.reader_error ?? null, parse_failures: res.parse_failures ?? [], retriever: res.retriever, tier: res.tier,
      model: res.model, gate: res.gate, absence: res.absence ?? null, sufficiency: res.sufficiency, citations: res.citations ?? [], window: res.window, tokens: res.tokens,
      usage: res.usage ?? null, timings: res.timings, ms: res.ms,
    }, null, 2)
  }
  const verdict = res.reader_error ? 'not checked' : res.gate.passed ? 'verified' : 'rejected'
  const why = res.gate.why && !res.gate.passed ? ` — ${humanize(res.gate.why)}` : ''
  const cost = res.tokens != null ? ` · ${res.tokens} tok` : ''
  const time = res.ms != null ? ` · ${(res.ms / 1000).toFixed(1)} s` : ''
  const hint = res.grounding ? `\nnote: the answer names ${res.grounding.missing.join(', ')} — not found in the retrieved window (unverified hint)` : ''
  const s = res.sufficiency
  const suff = !s ? ''
    : s.score != null
      ? res.state === 'verified' ? `\nsufficiency: verified (score ${s.score}/5, ${s.judge})`
        : res.state === 'unverified' ? `\nsufficiency: UNVERIFIED (score ${s.score}/5, ${s.judge}) — shown, lower trust`
          : `\nsufficiency: not found (score ${s.score}/5, ${s.judge}) — the evidence does not support the answer; abstained`
      : res.state === 'unverified' ? `\nsufficiency: ${s.verdict} (${s.judge}) — shown but UNVERIFIED`
        : `\nsufficiency: ${s.verdict} (${s.judge}) — the answer was not supported; abstained`
  const note = s?.note ? `\nnote: ${s.note}` : ''
  const body = formatEvidence(res) ?? res.receipt
  return `${body}\n\ngate: ${verdict}${why}   (${res.model} · ${res.retriever} · ${res.tier}${cost}${time})${hint}${suff}${note}`
}

// The gate's reasons are precise but internal; say the same thing for a reader.
function humanize(why) {
  if (/abstained on an answerable item/.test(why)) return 'the answer states a fact but carries no verifiable citation'
  if (/^no source line/.test(why)) return 'the answer carries no citation'
  if (/imprecise date/.test(why)) return 'the citation carries a bare year, not a month and year'
  return why
}
