// Natural language -> reducer spec. The model may propose a spec; it never
// computes the answer. Every proposal is schema- and grounding-validated
// before the deterministic reducer runs. Invalid or undefined questions are
// refused.
const FIELDS = new Set([
  'annual', 'outlook_pct', 'jobs', 'change', 'jobs2033', 'annual_openings', 'education',
])
const NUMERIC = new Set([...FIELDS].filter((f) => f !== 'education'))
const OPS = new Set(['count', 'sum', 'max', 'min', 'topk', 'diff'])
const CMP = new Set(['>', '>=', '<', '<=', '=', '!='])
const STATUS = new Set(['answerable', 'needs_specification', 'not_formalizable', 'reader'])
const CANDIDATE = new Set(['paid', 'all', 'select'])
const ORDER = new Set(['asc', 'desc'])

// Declared vocabulary: a proposed field must be licensed by a phrase from the
// question that contains one of these words. Undeclared measures (inflation,
// stress, prestige) have no entry, so they cannot be mapped silently.
const VOCAB = {
  annual: ['pay', 'pays', 'paid', 'salary', 'salaries', 'earnings', 'wage', 'wages', 'compensation', 'earn'],
  outlook_pct: ['growth', 'grow', 'grows', 'growing', 'outlook', 'increase', 'projected growth'],
  jobs: ['employment', 'employed', 'jobs', 'workforce', 'workers'],
  change: ['employment change', 'change', 'decline', 'declines', 'loss', 'losses', 'shrink'],
  jobs2033: ['2033', 'projected employment', 'employment in 2033'],
  annual_openings: ['openings', 'opening', 'positions', 'opportunities', 'hiring', 'jobs available'],
  education: ['education', 'degree', 'degrees', 'diploma', 'credential', 'schooling'],
}

const EDUCATION_SYNONYMS = {
  "Bachelor's degree": ['bachelor', 'bachelors', 'undergraduate'],
  "Master's degree": ['master', 'masters', 'graduate degree'],
  'Doctoral or professional degree': ['doctoral', 'doctorate', 'phd', 'professional degree'],
  "Associate's degree": ['associate', 'associates', 'two year degree'],
  'High school diploma or equivalent': ['high school', 'diploma', 'ged'],
  'No formal educational credential': ['no formal education', 'no degree', 'no credential'],
  'Postsecondary nondegree award': ['postsecondary', 'certificate', 'nondegree'],
}

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

export const SCHEMA = { FIELDS, NUMERIC, OPS, CMP, STATUS, CANDIDATE, ORDER, VOCAB }

const FIELD_DOC = `Fields (the only allowed values):
- annual: 2023 median annual pay in USD (46 of 48 rows)
- outlook_pct: projected employment growth, 2023-2033, percent
- jobs: employment in 2023
- change: projected employment change, 2023-2033
- jobs2033: projected employment in 2033 (jobs + change)
- annual_openings: projected annual openings
- education: typical entry-level education (string)`

const RULES = `You are a router, not an answerer. Never answer the question and never
compute a value. Every response must be one JSON object, including refusals.

Grounding is mandatory. For every field used (the op field and every filter),
put an exact phrase from the question in "grounding". The phrase must contain a
word from that field's vocabulary:
- annual: pay, salary, earnings, wage, compensation
- outlook_pct: growth, grow, outlook, increase
- jobs: employment, employed, jobs, workforce
- change: employment change, change, decline, loss
- jobs2033: 2033, projected employment
- annual_openings: openings, positions, opportunities, hiring
- education: education, degree, diploma, credential

If the question uses a measure with no vocabulary entry (inflation, wage
growth, stress, prestige, work-life balance), return needs_specification. Do not
map it onto a similar-sounding field.

Rules:
- "above", "more than", "faster than", "exceeds" -> ">"
- "at least", "no less than" -> ">="; "below", "fewer than", "less than" -> "<"
- "at most", "no more than" -> "<="; "exactly", "equal to" -> "="
- "not", "excluding", "does not require" -> "!="
- "top three" / "three highest" -> op "topk", k 3, order "desc".
- "two worst" / "five lowest" -> op "topk", k 2, order "asc".
- "how many more X does A have than B" -> op "diff", select [A, B], result A - B.
- "earnings", "pay", "salary" -> annual. "openings", "positions available" ->
  annual_openings. "people employed" -> jobs; "by 2033" -> jobs2033.
- "this year", "currently" -> the 2023 snapshot.
- Candidate set: "paid" when pay is required (the default); "all" only when pay
  is irrelevant; "select" only for diff.
- filters are ANDed. Use only fields above. Do not invent fields.
- A question about one occupation (or one or two facts) is "reader", even when
  part of it is missing from the corpus. The reader reports the missing part.
  Example: "What is the pay for X, and its pay in Florida?" -> reader.
  Example: "What is X's growth, and how many X were employed in 2010?" -> reader.
- Only aggregations over many rows get a spec.
- "best", "worst", or "recommended" with no named measure is
  needs_specification. An aggregate targeting a future time outside the snapshot
  (2026, "next year") is needs_specification. Historical values like 2010 are
  reader absences.
- An unsupported entity type (industry, when the table is occupations) is
  needs_specification or reader, never a silent substitution.
- If the corpus has no measure at all (stress, prestige, personal advice),
  return "not_formalizable".`

export function buildPrompt({ question, titles }) {
  return [
    'Translate the question into a JSON spec for a deterministic reducer over a fixed table of occupations.',
    'Return ONLY a JSON object. No prose, no code fences.',
    'Schema:',
    '{"status":"answerable|needs_specification|not_formalizable|reader",',
    ' "candidateSet":"paid|all|select","op":"count|sum|max|min|topk|diff",',
    ' "field":"<field>","filters":[{"field":"<field>","op":">|>=|<|<=|=|!=","value":<number|string>}],',
    ' "k":<integer or null>,"select":["<title>","<title>"] or null,',
    ' "order":"asc|desc","grounding":{"<field>":"<exact phrase from the question>"},',
    ' "reason":"<short>"}',
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

const norm = (s) => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const numbersIn = (question) => {
  const out = new Set()
  const t = String(question).toLowerCase().replace(/,/g, '')
  for (const m of t.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*([km])?/g)) {
    let v = Number(m[1])
    if (m[2] === 'k') v *= 1000
    if (m[2] === 'm') v *= 1000000
    out.add(v)
  }
  for (const [w, v] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) out.add(v)
  }
  return out
}

const WORST = /\b(worst|fewest|lowest|least|smallest|bottom)\b/i
const BEST = /\b(best|most|highest|largest|top)\b/i

const phraseOk = (field, phrase, question) => {
  if (typeof phrase !== 'string' || !norm(phrase)) return `grounding missing for ${field}`
  if (!norm(question).includes(norm(phrase))) return `grounding phrase for ${field} is not in the question`
  const vocab = VOCAB[field] ?? []
  if (!vocab.some((w) => norm(phrase).includes(norm(w)))) {
    return `grounding phrase for ${field} does not name that field`
  }
  return null
}

// Validate a proposed spec against the schema, the table, and the question.
export function validateSpec(raw, titles = [], question = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'spec is not an object' }
  }
  const status = raw.status ?? 'answerable'
  if (!STATUS.has(status)) return { ok: false, error: `bad status ${status}` }
  if (status !== 'answerable') {
    return { ok: true, spec: { status, reason: String(raw.reason ?? '').slice(0, 300) } }
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

  const order = raw.order ?? 'desc'
  if (!ORDER.has(order)) return { ok: false, error: `bad order ${order}` }
  const spec = { status, candidateSet, op, field, filters, k: null, select: null, order }
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

  // Grounding: every field must be licensed by a phrase from the question.
  const grounding = raw.grounding
  if (!grounding || typeof grounding !== 'object') return { ok: false, error: 'grounding is required' }
  const fieldErr = phraseOk(field, grounding[field], question)
  if (fieldErr) return { ok: false, error: fieldErr }
  const nums = numbersIn(question)
  for (const f of spec.filters) {
    const err = phraseOk(f.field, grounding[f.field], question)
    if (err) return { ok: false, error: err }
    if (NUMERIC.has(f.field) && !nums.has(Number(f.value))) {
      return { ok: false, error: `value ${f.value} for ${f.field} is not in the question` }
    }
    if (f.field === 'education') {
      const q = norm(question)
      const direct = q.includes(norm(f.value))
      const syn = (EDUCATION_SYNONYMS[f.value] ?? []).some((w) => q.includes(norm(w)))
      if (!direct && !syn) return { ok: false, error: `education value ${f.value} is not in the question` }
    }
  }
  if (op === 'topk') {
    if (!nums.has(spec.k)) return { ok: false, error: `top-k ${spec.k} is not in the question` }
    if (WORST.test(question) && spec.order !== 'asc') return { ok: false, error: 'worst/fewest needs order asc' }
    if (BEST.test(question) && spec.order !== 'desc') return { ok: false, error: 'best/most needs order desc' }
  }
  if (op === 'diff') {
    for (const t of spec.select) {
      if (!norm(question).includes(norm(t))) return { ok: false, error: `title ${t} is not in the question` }
    }
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
  const messages = [
    { role: 'system', content: 'You are a JSON-only router. You never answer the question. Every reply is exactly one JSON object.' },
    { role: 'user', content: buildPrompt({ question, titles }) },
  ]
  let raw = ''
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    // The router prompt is long and the provider bills hidden reasoning
    // against max_tokens; 700 returned empty content (all reasoning). 4000
    // leaves room for the JSON on the hardest questions.
    const r = await chat(messages, { maxTokens: 4000, format: 'json' })
    raw = r.content ?? ''
    try {
      const parsed = parseJson(raw)
      const checked = validateSpec(parsed, titles, question)
      if (!checked.ok) {
        lastError = checked.error
        messages.push({ role: 'assistant', content: raw })
        messages.push({ role: 'user', content: `Invalid spec: ${checked.error}. Return only a corrected JSON object with grounding phrases copied from the question.` })
        continue
      }
      return { ...checked.spec, source: 'extractor', raw, usage: r.usage ?? {}, ms: Date.now() - t0 }
    } catch (e) {
      lastError = String(e.message ?? e)
      messages.push({ role: 'assistant', content: raw })
      messages.push({ role: 'user', content: `You answered instead of routing (${lastError}). Do not answer. Return only one JSON object, e.g. {"status":"reader","reason":"single-occupation fact"}.` })
    }
  }
  return { status: 'needs_specification', source: 'extractor', error: lastError, raw, usage: {}, ms: Date.now() - t0 }
}

export const isRefusal = (text) => /^\s*(NEEDS_SPECIFICATION|NOT_FORMALIZABLE)\b/i.test(String(text ?? ''))
