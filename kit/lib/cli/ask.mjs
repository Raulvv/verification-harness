// `ask` — resolve the workspace, run the one-shot machine, and print the answer
// with a machine-checked receipt (RN-G01/G04). Pure orchestration; the model
// boundary stays injectable so the command is testable offline.
import { askOneShot } from '../answer/oneshot.mjs'
import { askAggregate } from '../answer/aggregate.mjs'
import { verify } from '../receipts/gate.mjs'
import { parseAnswer, ABSTAIN_TERMS } from '../receipts/text.mjs'
import { ungroundedTerms } from '../receipts/grounding.mjs'
import { judgeSufficiency, judgeByCommand, judgeGrade } from '../receipts/sufficiency.mjs'
import { judgeEvidenceFor } from '../receipts/evidence.mjs'
import { resolveAsk } from './resolve.mjs'

export async function runAsk({ question, flags = {}, env = process.env, cwd = process.cwd(), probe, chat, embed, judgeFn, gradeFn } = {}) {
  if (!question || !String(question).trim()) throw new Error('no question — usage: retrieval-kit ask "<question>"')
  const started = Date.now()
  const r = await resolveAsk({ flags, env, cwd, probe })
  const res = await askOneShot(r.model, r.corpusRoot, String(question).trim(), {
    retriever: r.retriever,
    promptStyle: r.tier,
    corpus: r.corpusFiles ?? undefined,
    _chat: chat,
    _embed: embed,
  })
  const text = res.final?.text ?? ''
  // The gate judges the RECEIPT, not the model's `not_found` flag. A refusal is
  // the refusal *vocabulary* in the Q-line (the gate's own ABSTAIN_TERMS), so an
  // honest "the documents do not state…" is an abstention; a claim with
  // Source/Quote NOT FOUND is not, and is rejected.
  const proposed = parseAnswer(text).proposed.toLowerCase()
  let abstained = ABSTAIN_TERMS.some((m) => proposed.includes(m))
  // NON-AUTHORITATIVE hint only (a lexical check cannot decide sufficiency).
  let grounding = null
  const useGrounding = flags.grounding !== false && !flags.noGrounding
  if (useGrounding && !abstained && Array.isArray(res.docs) && res.docs.length) {
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
  let state = abstained ? 'not_found' : null
  if (r.sufficient && !abstained && Array.isArray(res.docs) && res.docs.length) {
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
  const g = verify(item, receipt, r.corpusRoot)
  return {
    question, receipt, abstained, state, fail_reason: failReason,
    gate: { passed: g.mechanicalPass, why: g.why },
    grounding, sufficiency,
    retriever: r.retriever, tier: r.tier, model: r.modelId,
    window: res.window ?? [], tokens: res.tokens ?? null, timings: res.timings ?? null,
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

export function formatAsk(res, { json = false } = {}) {
  if (json) {
    return JSON.stringify({
      question: res.question, receipt: res.receipt, state: res.state, fail_reason: res.fail_reason ?? null, retriever: res.retriever, tier: res.tier,
      model: res.model, gate: res.gate, sufficiency: res.sufficiency, window: res.window, tokens: res.tokens,
      timings: res.timings, ms: res.ms,
    }, null, 2)
  }
  const verdict = res.gate.passed ? 'verified' : 'rejected'
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
  return `${res.receipt}\n\ngate: ${verdict}${why}   (${res.model} · ${res.retriever} · ${res.tier}${cost}${time})${hint}${suff}${note}`
}

// The gate's reasons are precise but internal; say the same thing for a reader.
function humanize(why) {
  if (/abstained on an answerable item/.test(why)) return 'the answer states a fact but carries no verifiable citation'
  if (/^no source line/.test(why)) return 'the answer carries no citation'
  if (/imprecise date/.test(why)) return 'the citation carries a bare year, not a month and year'
  return why
}
