// Shared answer judge for the bench: the model-free "contains the gold"
// shortcut first, then two cross-family local judges (qwen3.5:9b +
// granite4:3b) so a single self-judge bias can't decide a result. Used by
// judge-tier-b.mjs and score-selection-e2e.mjs.
import { chatWithUsage } from '../../kit/index.mjs'

const base = { baseUrl: 'http://localhost:11434/v1', apiKey: 'local' }
export const JUDGES = { qwen: { ...base, model: 'qwen3.5:9b' }, granite: { ...base, model: 'granite4:3b' } }

export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(a|an|the)\b/g, ' ').replace(/\s+/g, ' ').trim()

export const containsGold = (text, gold) => {
  const t = norm(text), g = norm(gold)
  if (!g) return false
  return t.includes(g) || g.split(' ').every((w) => t.includes(w))
}

export const judgePrompt = (q, gold, ans, evidence = []) => [
  'You grade whether a system answer correctly answers a question.',
  'Gold answer: ' + gold,
  evidence.length ? 'Supporting evidence: ' + evidence.join(' ') : null,
  'System answer: ' + ans,
  'The question was: ' + q,
  'Reply YES if the system answer gives the same answer as the gold — wording may differ, extra context is fine, and a LESS SPECIFIC but correct answer counts (e.g. "horror film" is correct for a gold "South Korean horror film"; "Manchester United" is correct for a gold "Manchester United and the England national team").',
  'Reply NO if it gives a different answer, contradicts the gold, or does not answer the question at all.',
  'Reply with exactly one word: YES or NO.',
].filter(Boolean).join('\n')

export async function ask(model, q, gold, ans, evidence = []) {
  try {
    const res = await chatWithUsage(model, [{ role: 'user', content: judgePrompt(q, gold, ans, evidence) }], { maxTokens: 4, think: false })
    return /^\s*yes\b/i.test(String(res.content ?? '')) ? 1 : 0
  } catch { return 0 }
}

// contains is a fast, model-free pass; only the misses go to the judges.
export async function judgeAnswer(q, gold, ans, evidence = []) {
  const contains = containsGold(ans, gold) ? 1 : 0
  const qwen = contains ? 1 : await ask(JUDGES.qwen, q, gold, ans, evidence)
  const granite = contains ? 1 : await ask(JUDGES.granite, q, gold, ans, evidence)
  return { contains, qwen, granite }
}

// SUFFICIENCY (different question from correctness): do the passages the
// system itself returned as quotes actually back its answer? This is the gap
// the mechanical gate does NOT check — a quote can exist byte-verbatim yet not
// support the claim.
export const supportPrompt = (q, answer, quotes) => [
  'You check whether the quoted passages a system returned actually support its answer.',
  'Question: ' + q,
  'System answer: ' + answer,
  'Quoted passages: ' + (quotes.join(' || ') || '(none)'),
  'If the quoted passages are enough to support the answer\'s claims (same facts; wording may differ), reply YES.',
  'If they do not support the answer (missing, off-topic, or the answer says more than they show), reply NO.',
  'Reply with exactly one word: YES or NO.',
].join('\n')

export async function askSupport(model, q, answer, quotes) {
  try {
    const res = await chatWithUsage(model, [{ role: 'user', content: supportPrompt(q, answer, quotes) }], { maxTokens: 4, think: false })
    return /^\s*yes\b/i.test(String(res.content ?? '')) ? 1 : 0
  } catch { return 0 }
}

export async function judgeSupport(q, answer, quotes) {
  return { qwen: await askSupport(JUDGES.qwen, q, answer, quotes), granite: await askSupport(JUDGES.granite, q, answer, quotes) }
}
