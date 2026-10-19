// The sufficiency judge — the model check the mechanical gate cannot do:
// "does the retrieved evidence actually support this answer?" The gate proves a
// citation exists; this decides whether the claim is answered by it. INSUFFICIENT
// ⇒ the system abstains. Judge reliability scales with capability (measured:
// PoKéAPI N=8, a 9B self-family judge accepted fabrications → 5/8, a 27B judge
// matched an independent judge → 7/8), so the judge is explicit, never assumed.
import { chatWithUsage } from '../model.mjs'
import { execFileSync } from 'node:child_process'

export const SUFFICIENCY_PROMPT = (question, evidence, answer) => [
  'You are a strict verifier. Decide whether the EVIDENCE supports the ANSWER to the QUESTION.',
  'QUESTION: ' + question,
  'EVIDENCE:\n' + String(evidence ?? '').slice(0, 12000),
  'ANSWER: ' + answer,
  'SUFFICIENT if the evidence contains the facts the answer states (wording may differ).',
  'INSUFFICIENT if the answer states anything the evidence does not support, answers a different question, or the evidence is silent on it.',
  'Reply with exactly one word: SUFFICIENT or INSUFFICIENT.',
].join('\n')

export function parseVerdict(text) {
  const s = String(text ?? '').toLowerCase()
  return s.includes('insufficient') ? 'INSUFFICIENT' : s.includes('sufficient') ? 'SUFFICIENT' : '?'
}

// MiniCheck-style grounding models (e.g. Ollama `bespoke-minicheck`) take a
// `Document:`/`Claim:` pair and answer Yes/No — the same sufficiency question,
// no chat scaffold. Auto-detected from the judge's model id.
export const isMinicheck = (model) => /minicheck/i.test(String(model ?? ''))
export const minicheckPrompt = (evidence, answer) => `Document: ${String(evidence ?? '').slice(0, 12000)}\nClaim: ${answer}`
export function parseMinicheck(text) {
  const s = String(text ?? '').toLowerCase()
  if (/\byes\b/.test(s)) return 'SUFFICIENT'
  if (/\bno\b/.test(s)) return 'INSUFFICIENT'
  return '?'
}

export async function judgeSufficiency(judge, question, evidence, answer, opts = {}) {
  const chat = opts._chat ?? ((msgs, o) => chatWithUsage(judge, msgs, o))
  const mini = isMinicheck(judge?.model)
  const content = mini ? minicheckPrompt(evidence, answer) : SUFFICIENCY_PROMPT(question, evidence, answer)
  const res = await chat([{ role: 'user', content }], { maxTokens: mini ? 8 : 600, think: false })
  return mini ? parseMinicheck(res.content) : parseVerdict(res.content)
}

// A generic COMMAND judge: run `cmd`, feed `{question,evidence,answer}` as JSON on
// stdin, read `SUFFICIENT`/`INSUFFICIENT` on stdout. Any external grounding
// detector plugs in this way (LettuceDetect, an NLI cross-encoder, a hosted API).
export function judgeByCommand(cmd, question, evidence, answer, { cwd = process.cwd() } = {}) {
  const out = execFileSync('sh', ['-c', cmd], {
    input: JSON.stringify({ question, evidence, answer }),
    encoding: 'utf8',
    cwd,
    maxBuffer: 1 << 20,
  })
  return parseVerdict(out)
}

// A GRADED judge (1–5 support), forced through a strict JSON schema so the
// verdict is a number the model cannot dress up as prose — no regex, no
// reasoning leakage (measured: a bare prompt makes reasoning models emit
// reasoning and truncate before the digit; the schema fixes it). Requires a
// judge that honors `json_schema` (glm/kimi do; deepseek returns empty).
export const GRADE_PROMPT = (question, evidence, answer) => [
  'Grade how well the EVIDENCE supports the ANSWER to the QUESTION.',
  '5 = fully entailed; 4 = mostly; 3 = partially; 2 = weakly; 1 = not supported.',
  'QUESTION: ' + question,
  'EVIDENCE:\n' + String(evidence ?? '').slice(0, 12000),
  'ANSWER: ' + answer,
  'Return the score as JSON.',
].join('\n')

export const GRADE_SCHEMA = {
  type: 'object',
  properties: { score: { type: 'integer', minimum: 1, maximum: 5 } },
  required: ['score'],
  additionalProperties: false,
}

export async function judgeGrade(judge, question, evidence, answer, opts = {}) {
  const chat = opts._chat ?? ((msgs, o) => chatWithUsage(judge, msgs, o))
  const res = await chat([{ role: 'user', content: GRADE_PROMPT(question, evidence, answer) }], { maxTokens: 800, think: false, jsonSchema: GRADE_SCHEMA })
  let n = NaN
  try { n = Number(JSON.parse(res.content ?? '{}')?.score) } catch { /* not JSON → null */ }
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}
