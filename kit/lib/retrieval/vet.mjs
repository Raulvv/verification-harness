// Pass 2 of the double pass (maintainer design, 2026-09-28): the matcher
// selects by words; REASONING vets whether each match's phrase/paragraph
// fits the question. Two bars, a width governor — measured 2026-09-28:
// wide windows + topic-rich distractors = drift (f-2→asyncDispose,
// f-1→Routes, f-3→Errors). So: the SOFT bar ("fits the context") runs
// first; only if more than 3 survive — the width where drift was
// measured — the TIGHT bar ("necessarily contained") focuses the window.
// On any error the matches are KEPT (recall-fail-open; a broken judge
// never starves the window).
import { chatWithUsage } from '../model.mjs'

const VET_BARS = {
  soft: 'Does each snippet FIT THE CONTEXT of the question — is it about the question\'s subject, even as background or an example? Discard ONLY a snippet about a different matter entirely. When unsure, keep it.',
  tight: 'Would a correct answer to the QUESTION necessarily contain the fact stated in this snippet? YES: a required piece. NO: merely related — same topic, different matter, or filler.',
}
const VET_SCHEMA = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'object', properties: { doc: { type: 'integer' }, relevant: { type: 'boolean' } }, required: ['doc', 'relevant'] } } },
  required: ['verdicts'],
}

export async function pruneByRelevance(m, question, matches, opts = {}) {
  const chat = opts._chat ?? ((msgs, o) => chatWithUsage(m, msgs, o))
  const usage = { prompt_tokens: 0, completion_tokens: 0, cost: 0 }
  const addUsage = (u) => {
    if (!u) return
    usage.prompt_tokens += u.prompt_tokens ?? 0
    usage.completion_tokens += u.completion_tokens ?? 0
    usage.cost += u.cost ?? 0
  }
  const vet = async (set, bar) => {
    if (!set.length) return { kept: set, dropped: [] }
    const prompt = [
      'The QUESTION: ' + question,
      'Below are document snippets a word-matcher selected. ' + VET_BARS[bar],
      'Return ONLY JSON: {"verdicts": [{"doc": <number>, "relevant": true|false}, ...]} — one verdict per snippet.',
      ...set.map((x, i) => `${i + 1}: ${x.rel} :: ${x.snippet}`),
    ].join('\n')
    let verdicts = []
    try {
      const res = await chat([{ role: 'user', content: prompt }], { maxTokens: 800, think: false, format: VET_SCHEMA })
      addUsage(res.usage)
      verdicts = JSON.parse(String(res.content ?? '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')).verdicts ?? []
    } catch { return { kept: set, dropped: [] } }
    const kept = []
    const dropped = []
    set.forEach((x, i) => {
      const v = verdicts.find((d) => Number(d.doc) === i + 1)
      if (!v || v.relevant === true) kept.push(x)
      else dropped.push(x.rel)
    })
    return { kept, dropped }
  }
  const first = await vet(matches, 'soft')
  if (first.kept.length <= 3) return { ...first, usage }
  const second = await vet(first.kept, 'tight') // the width governor
  return { kept: second.kept, dropped: [...first.dropped, ...second.dropped], usage }
}
