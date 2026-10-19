// The one-shot prompt contract + schema, and the window-hygiene filter.
const ONESHOT_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'the answer prose — or, if the documents do not answer, EXACTLY "NOT FOUND — the corpus does not state <the fact>" and nothing else' },
    quotes: { type: 'array', items: { type: 'object', properties: { doc: { type: 'integer' }, quote: { type: 'string' } }, required: ['doc', 'quote'] } },
    not_found: { type: 'boolean' },
  },
  required: ['answer', 'quotes', 'not_found'],
}

const ONESHOT_SCHEMA_NOQUOTE = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'the answer prose — or, if the documents do not answer, EXACTLY "NOT FOUND — the corpus does not state <the fact>" and nothing else' },
    not_found: { type: 'boolean' },
  },
  required: ['answer', 'not_found'],
}

const ONESHOT_SCHEMA_SOURCE = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'the answer prose — or, if the documents do not answer, EXACTLY "NOT FOUND — the corpus does not state <the fact>" and nothing else' },
    sources: { type: 'array', items: { type: 'integer' } },
    not_found: { type: 'boolean' },
  },
  required: ['answer', 'sources', 'not_found'],
}

const ONESHOT_SCHEMA_SENTENCE = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'the answer prose — or, if the documents do not answer, EXACTLY "NOT FOUND — the corpus does not state <the fact>" and nothing else' },
    sources: { type: 'array', items: { type: 'object', properties: { doc: { type: 'integer' }, anchor: { type: 'string' } }, required: ['doc', 'anchor'] } },
    not_found: { type: 'boolean' },
  },
  required: ['answer', 'sources', 'not_found'],
}

const PROMPT = (question, parts, compact = false) => [
  'Answer ONE question from the documents below. This is synthesis: answer freely in your own words.',
  'Answer ONLY the question asked. Documents that do not bear on it must be ignored — never summarize them, never widen the topic.',
  compact
    ? 'KEEP IT SHORT: answer in under 80 words. Quotes: at most 2 lines each, never paste code blocks.'
    : 'Quotes: at most 3 lines each — short passages, never paste large code blocks.',
  'Return ONLY a JSON object: {"answer": "<your answer in prose — or NOT FOUND if the documents do not answer it>", "quotes": [{"doc": <document number>, "quote": "<supporting passage copied VERBATIM from that document>"}], "not_found": <true|false>}',
  'Every claim, step or number in your answer must be supported by at least one quote — copied EXACTLY, never paraphrased, no added prefixes. One quote per claim; name the document number it comes from.',
  'If the documents do not answer the question, the "answer" field must be EXACTLY: NOT FOUND — the corpus does not state <the fact the question asks>. Nothing more — no clarifications, no "while the documents mention". Never name, quote, or summarize what else the documents mention; an abstention carries no receipts.',
  '  GOOD abstention: "NOT FOUND — the corpus does not state the SLA duration."',
  '  BAD abstention (never do this): "NOT FOUND. While the documents mention SLA agreements, ..."',
  'Answer ONLY what the documents STATE. Silence is not a negative: if the documents never say the thing does not exist, answer NOT FOUND — never answer "No, …" by inference from what is missing.',
  'When a source states a change over time (historically / previously / used to / currently), carry BOTH sides of the split — the era is part of the answer.',
  'When documents disagree, say what each says, referencing its document number.',
  'Question: ' + question,
  ...parts,
].join('\n')

// The same answer contract WITHOUT the quote requirement — the no-quote arm of
// the "does quoting change the answer?" probe. Every answer rule (abstention,
// era split, disagreement) is byte-identical to PROMPT; only the verbatim-quote
// demand and the quotes field are dropped, so the two prompts differ by exactly
// one variable. Opt-in via `--prompt noquote`; not the product default.
const PROMPT_NOQUOTE = (question, parts, compact = false) => [
  'Answer ONE question from the documents below. This is synthesis: answer freely in your own words.',
  'Answer ONLY the question asked. Documents that do not bear on it must be ignored — never summarize them, never widen the topic.',
  compact ? 'KEEP IT SHORT: answer in under 80 words.' : null,
  'Return ONLY a JSON object: {"answer": "<your answer in prose — or NOT FOUND if the documents do not answer it>", "not_found": <true|false>}',
  'If the documents do not answer the question, the "answer" field must be EXACTLY: NOT FOUND — the corpus does not state <the fact the question asks>. Nothing more — no clarifications, no "while the documents mention". Never name, quote, or summarize what else the documents mention; an abstention carries no receipts.',
  '  GOOD abstention: "NOT FOUND — the corpus does not state the SLA duration."',
  '  BAD abstention (never do this): "NOT FOUND. While the documents mention SLA agreements, ..."',
  'Answer ONLY what the documents STATE. Silence is not a negative: if the documents never say the thing does not exist, answer NOT FOUND — never answer "No, …" by inference from what is missing.',
  'When a source states a change over time (historically / previously / used to / currently), carry BOTH sides of the split — the era is part of the answer.',
  'When documents disagree, say what each says, referencing its document number.',
  'Question: ' + question,
  ...parts,
].filter(Boolean).join('\n')

// The middle tier: answer + the source document(s), no verbatim quote. Same
// answer rules as PROMPT; instead of copying a quote the model names the
// document number(s) its answer draws on, and the machine renders the Source
// line. Opt-in via `--prompt source`.
const PROMPT_SOURCE = (question, parts, compact = false) => [
  'Answer ONE question from the documents below. This is synthesis: answer freely in your own words.',
  'Answer ONLY the question asked. Documents that do not bear on it must be ignored — never summarize them, never widen the topic.',
  compact ? 'KEEP IT SHORT: answer in under 80 words.' : null,
  'Return ONLY a JSON object: {"answer": "<your answer in prose — or NOT FOUND if the documents do not answer it>", "sources": [<document number(s) your answer draws on>], "not_found": <true|false>}',
  'List the document number(s) your answer draws on — a number or numbers only, never copied text.',
  'If the documents do not answer the question, the "answer" field must be EXACTLY: NOT FOUND — the corpus does not state <the fact the question asks>. Nothing more — no clarifications, no "while the documents mention". Never name, quote, or summarize what else the documents mention; an abstention carries no receipts.',
  '  GOOD abstention: "NOT FOUND — the corpus does not state the SLA duration."',
  '  BAD abstention (never do this): "NOT FOUND. While the documents mention SLA agreements, ..."',
  'Answer ONLY what the documents STATE. Silence is not a negative: if the documents never say the thing does not exist, answer NOT FOUND — never answer "No, …" by inference from what is missing.',
  'When a source states a change over time (historically / previously / used to / currently), carry BOTH sides of the split — the era is part of the answer.',
  'When documents disagree, say what each says, referencing its document number.',
  'Question: ' + question,
  ...parts,
].filter(Boolean).join('\n')

// The sentence tier: between source (doc number) and full (verbatim quote).
// The model must copy a SHORT distinctive phrase (3-10 words) EXACTLY from the
// sentence that supports each claim — so it still has to find the exact
// sentence (grounding, like full), but never copies the whole sentence (cost,
// like source). Hypothesis under test: grounding comes from claim→sentence
// precision, not from verbatim length.
const PROMPT_SENTENCE = (question, parts, compact = false) => [
  'Answer ONE question from the documents below. This is synthesis: answer freely in your own words.',
  'Answer ONLY the question asked. Documents that do not bear on it must be ignored — never summarize them, never widen the topic.',
  compact ? 'KEEP IT SHORT: answer in under 80 words.' : null,
  'Return ONLY a JSON object: {"answer": "<your answer in prose — or NOT FOUND if the documents do not answer it>", "sources": [{"doc": <document number>, "anchor": "<a short distinctive phrase (3-10 words) from the sentence that supports the claim>"}], "not_found": <true|false>}',
  'Every claim, step or number in your answer must be supported by at least one source. For each, name the document number AND copy a short distinctive phrase (3 to 10 words) EXACTLY from the sentence that supports the claim — the phrase locates the sentence, you never copy the whole sentence. One source per claim.',
  'If the documents do not answer the question, the "answer" field must be EXACTLY: NOT FOUND — the corpus does not state <the fact the question asks>. Nothing more — no clarifications, no "while the documents mention". Never name, quote, or summarize what else the documents mention; an abstention carries no receipts.',
  '  GOOD abstention: "NOT FOUND — the corpus does not state the SLA duration."',
  '  BAD abstention (never do this): "NOT FOUND. While the documents mention SLA agreements, ..."',
  'Answer ONLY what the documents STATE. Silence is not a negative: if the documents never say the thing does not exist, answer NOT FOUND — never answer "No, …" by inference from what is missing.',
  'When a source states a change over time (historically / previously / used to / currently), carry BOTH sides of the split — the era is part of the answer.',
  'When documents disagree, say what each says, referencing its document number.',
  'Question: ' + question,
  ...parts,
].filter(Boolean).join('\n')

// The v4.5 structural scaffold: one instruction, shared byte-for-byte by every
// v4.5 tier so a measurement of one is a measurement of the scaffold itself.
const SCAFFOLD = 'Before answering, reason structurally: if the question compares two things, state each one\'s relevant property explicitly and then compare; if it requires connecting facts across documents, work through the chain step by step. Then give the final answer.'

// v4.5 — structured reasoning + the same receipt contract. A structural
// instruction scaffolds the reasoning (compare / chain) while every claim
// still carries a byte-verbatim quote. Measured (HotpotQA, big window, qwen3.5
// 4B/9B): +12.5pp over PROMPT with 0 regressions (bench/RESULTS.md §Recovery
// pass → §Precision-preserving). Opt-in via `--prompt v45`; the answer schema
// is PROMPT's (answer + quotes + not_found).
const PROMPT_V45 = (question, parts, compact = false) =>
  SCAFFOLD + '\n\n' + PROMPT(question, parts, compact)

// v4.5 on the `source` contract: the same scaffold, but the answer schema is
// PROMPT_SOURCE's (answer + source doc numbers + not_found; no verbatim quote).
// The shipped default since 2026-10-04 (`--prompt source-v45`). Kept separate
// from PROMPT_V45 because the two receipt contracts are not interchangeable:
// the scaffold is the variable under test, the contract underneath is what the
// product ships.
const PROMPT_SOURCE_V45 = (question, parts, compact = false) =>
  SCAFFOLD + '\n\n' + PROMPT_SOURCE(question, parts, compact)

// window hygiene: raw transcripts (timecode-heavy) poison the decode —
// measured: three answers degenerated to "51.487", a Jags_LOPS timecode
const transcriptish = (content) => (content.match(/\d{1,2}:\d{2}:\d{2}/g) ?? []).length >= 3

export { ONESHOT_SCHEMA, ONESHOT_SCHEMA_NOQUOTE, ONESHOT_SCHEMA_SENTENCE, ONESHOT_SCHEMA_SOURCE, PROMPT, PROMPT_NOQUOTE, PROMPT_SENTENCE, PROMPT_SOURCE, PROMPT_SOURCE_V45, PROMPT_V45, transcriptish }
