// Natural language -> reducer spec. The model may propose a spec; it never
// computes the answer. Every proposal is schema-validated before the
// deterministic reducer runs. Invalid or undefined questions are refused.
const FIELDS = new Set([
  'annual', 'outlook_pct', 'jobs', 'change', 'jobs2033', 'annual_openings', 'education',
])
const NUMERIC = new Set([...FIELDS].filter((f) => f !== 'education'))
const OPS = new Set(['count', 'sum', 'max', 'min', 'topk', 'diff'])
const CMP = new Set(['>', '>=', '<', '<=', '=', '!='])
const STATUS = new Set(['answerable', 'needs_specification', 'not_formalizable', 'reader'])
const CANDIDATE = new Set(['paid', 'all', 'select'])

export const SCHEMA = { FIELDS, NUMERIC, OPS, CMP, STATUS, CANDIDATE }

const FIELD_DOC = `Fields:
- annual: 2023 median annual pay in USD (46 of 48 rows)
- outlook_pct: projected employment growth, 2023-2033, percent
- jobs: employment in 2023
- change: projected employment change, 2023-2033
- jobs2033: projected employment in 2033 (jobs + change)
- annual_openings: projected annual openings
- education: typical entry-level education (string)`

const RULES = `Rules:
- "above", "more than", "faster than", "exceeds" -> ">"
- "at least", "no less than" -> ">="; "below", "fewer than", "less than" -> "<"
- "at most", "no more than" -> "<="; "exactly", "equal to" -> "="
- "not", "excluding", "does not require" -> "!="
- "top three" / "three highest" -> op "topk", k 3. "top five" -> k 5.
- "how many more X does A have than B" -> op "diff", select [A, B], result A - B.
- "earnings", "pay", "salary" -> annual. "openings", "positions available" -> annual_openings.
- "employment trend", "growing" -> change > 0 or outlook_pct > 0; prefer change > 0 when employment is named.
- "this year", "currently" -> the 2023 snapshot. "by 2033" -> jobs2033.
- Candidate set: "paid" when pay is required (the default); "all" only when pay is irrelevant; "select" only for diff.
- filters are ANDed. Use only fields above. Do not invent fields.
- If a question is answerable from one or two documents (one occupation, one education level, one partial fact), return status "reader" instead of a spec.
- If "best", "worst", or "recommended" has no named measure, or criteria conflict, or the time is outside the snapshot (e.g. 2026, "next year"), return "needs_specification" with a reason.
- If the corpus has no measure at all (stress, prestige, work-life balance, personal advice), return "not_formalizable".
- Never put an answer, a count, or a computed number in the JSON. Only the spec.`

export function buildPrompt({ question, titles }) {
  return [
    'Translate the question into a JSON spec for a deterministic reducer over a fixed table of occupations.',
    'Return ONLY a JSON object. No prose, no code fences.',
    'Schema:',
    '{"status":"answerable|needs_specification|not_formalizable|reader",',
    ' "candidateSet":"paid|all|select","op":"count|sum|max|min|topk|diff",',
    ' "field":"<field>","filters":[{"field":"<field>","op":">|>=|<|<=|=|!=","value":<number|string>}],',
    ' "k":<integer or null>,"select":["<title>","<title>"] or null,"reason":"<short>"}',
    '',
    FIELD_DOC,
    '',
    RULES,
    '',
    'Occupation titles (use these exact strings for diff select):',
    titles.map((t) => `- ${t}`).join('\n'),
    '',
    `Question: ${question}`,
  ].join('\n')
}

// Validate a proposed spec against the declared schema and the table.
// Returns { ok, spec, error }.
export function validateSpec(raw, titles = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'spec is not an object' }
  }
  const status = raw.status ?? 'answerable'
  if (!STATUS.has(status)) return { ok: false, error: `bad status ${status}` }
  if (status !== 'answerable') {
    return {
      ok: true,
      spec: { status, reason: String(raw.reason ?? '').slice(0, 300) },
    }
  }
  const candidateSet = raw.candidateSet ?? 'paid'
  if (!CANDIDATE.has(candidateSet)) return { ok: false, error: `bad candidateSet ${candidateSet}` }
  const op = raw.op
  if (!OPS.has(op)) return { ok: false, error: `bad op ${op}` }
  const field = raw.field
  if (!FIELDS.has(field)) return { ok: false, error: `bad field ${field}` }

  const filters = raw.filters ?? []
  if (!Array.isArray(filters)) return { ok: false, error: 'filters is not an array' }
  const seen = new Set()
  for (const f of filters) {
    if (!f || typeof f !== 'object') return { ok: false, error: 'filter is not an object' }
    if (!FIELDS.has(f.field)) return { ok: false, error: `bad filter field ${f.field}` }
    if (seen.has(f.field)) return { ok: false, error: `duplicate filter field ${f.field}` }
    seen.add(f.field)
    if (!CMP.has(f.op)) return { ok: false, error: `bad filter op ${f.op}` }
    if (NUMERIC.has(f.field)) {
      const v = typeof f.value === 'string' ? Number(f.value.replace(/[$,%]/g, '')) : Number(f.value)
      if (!Number.isFinite(v)) return { ok: false, error: `filter ${f.field} needs a number` }
      f.value = v
    } else if (typeof f.value !== 'string' || !f.value.trim()) {
      return { ok: false, error: `filter ${f.field} needs a string` }
    }
  }

  const spec = { status, candidateSet, op, field, filters, k: null, select: null }
  if (op === 'topk') {
    if (!(Number.isInteger(raw.k) && raw.k >= 1 && raw.k <= 10)) {
      return { ok: false, error: 'topk needs integer k between 1 and 10' }
    }
    spec.k = raw.k
  }
  if (op === 'diff') {
    if (!Array.isArray(raw.select) || raw.select.length !== 2) {
      return { ok: false, error: 'diff needs exactly two selected titles' }
    }
    for (const t of raw.select) {
      if (typeof t !== 'string' || !titles.includes(t)) {
        return { ok: false, error: `unknown occupation title ${String(t)}` }
      }
    }
    if (candidateSet !== 'select') return { ok: false, error: 'diff needs candidateSet select' }
    spec.select = raw.select
  }
  if (candidateSet === 'select' && op !== 'diff') {
    return { ok: false, error: 'select is only valid for diff' }
  }
  return { ok: true, spec }
}

const parseJson = (text) => {
  const block = String(text ?? '').match(/\{[\s\S]*\}/)
  if (!block) throw new Error('no JSON object in response')
  return JSON.parse(block[0])
}

export async function extractSpec({ question, chat, titles = [] }) {
  const t0 = Date.now()
  const messages = [{ role: 'user', content: buildPrompt({ question, titles }) }]
  let raw = ''
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chat(messages, { maxTokens: 700 })
    raw = r.content ?? ''
    try {
      const parsed = parseJson(raw)
      const checked = validateSpec(parsed, titles)
      if (!checked.ok) {
        lastError = checked.error
        messages.push({ role: 'assistant', content: raw })
        messages.push({ role: 'user', content: `Invalid spec: ${checked.error}. Return only a corrected JSON object.` })
        continue
      }
      return { ...checked.spec, source: 'extractor', raw, usage: r.usage ?? {}, ms: Date.now() - t0 }
    } catch (e) {
      lastError = String(e.message ?? e)
      messages.push({ role: 'assistant', content: raw })
      messages.push({ role: 'user', content: `That was not valid JSON (${lastError}). Return only the JSON object.` })
    }
  }
  return { status: 'needs_specification', source: 'extractor', error: lastError, raw, usage: {}, ms: Date.now() - t0 }
}

export const isRefusal = (text) => /^\s*(NEEDS_SPECIFICATION|NOT_FORMALIZABLE)\b/i.test(String(text ?? ''))
