// Hop-coverage judge (experiment). Before scoring support, the judge must
// ENUMERATE the atomic facts the question needs and mark each as supported or
// not. If any required fact is missing from the evidence, the score is capped
// low — so a well-supported but incomplete answer (a removed hop) cannot be
// graded "verified". Contrast with the flat GRADE_PROMPT, which grades the
// answer's support and is blind to a missing hop (B108).
import { chatWithUsage } from '../../kit/lib/model.mjs'

export const COVERAGE_PROMPT = (question, evidence, answer) => [
  'You are a strict verifier for a question that may need several facts.',
  'Step 1: list every atomic FACT the QUESTION needs to be answered (its hops).',
  'Step 2: mark each fact supported=true only if the EVIDENCE states it.',
  'Step 3: score how well the EVIDENCE supports the ANSWER:',
  '  5 = every required fact is present and the answer follows;',
  '  1 = any required fact is missing or unsupported (even if part of the evidence supports the answer).',
  'QUESTION: ' + question,
  'EVIDENCE:\n' + String(evidence ?? '').slice(0, 12000),
  'ANSWER: ' + answer,
  'Return JSON: required_facts (each with fact + supported) and score.',
].join('\n')

export const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    required_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact: { type: 'string' }, supported: { type: 'boolean' } },
        required: ['fact', 'supported'],
        additionalProperties: false,
      },
    },
    score: { type: 'integer', minimum: 1, maximum: 5 },
  },
  required: ['required_facts', 'score'],
  additionalProperties: false,
}

export async function judgeCoverage(judge, question, evidence, answer, opts = {}) {
  const chat = opts._chat ?? ((msgs, o) => chatWithUsage(judge, msgs, o))
  const res = await chat([{ role: 'user', content: COVERAGE_PROMPT(question, evidence, answer) }], { maxTokens: 1200, think: false, jsonSchema: COVERAGE_SCHEMA })
  let parsed = null
  try { parsed = JSON.parse(res.content ?? '{}') } catch { return null }
  const n = Number(parsed?.score)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  // enforce the cap: any unsupported required fact caps the score at 1
  const facts = Array.isArray(parsed?.required_facts) ? parsed.required_facts : []
  const unsupported = facts.filter((f) => f && f.supported === false).length
  return { score: unsupported > 0 ? Math.min(n, 1) : n, facts: facts.length, unsupported }
}
