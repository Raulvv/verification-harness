// The one-shot output contract: JSON in, a real parse or a loud throw.
export function parseOneShot(out) {
  let v
  try { v = JSON.parse(String(out ?? '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')) } catch { throw new Error('oneshot parse: not JSON (' + String(out ?? '').slice(0, 60) + ')') }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('oneshot parse: not an object')
  if (typeof v.answer !== 'string' || !v.answer.trim()) throw new Error('oneshot parse: empty answer')
  const rawSources = Array.isArray(v.sources) ? v.sources : []
  // sentence tier: sources are {doc, anchor} — the anchor becomes the quote to
  // lift (rehomeLegs expands it to the full verbatim sentence).
  const anchorQuotes = rawSources
    .filter((s) => s && typeof s === 'object' && typeof s.anchor === 'string' && s.anchor.trim())
    .map((s) => ({ doc: Number(s.doc), quote: s.anchor.trim() }))
  const quotes = Array.isArray(v.quotes) && v.quotes.length
    ? v.quotes.filter((q) => q && typeof q.quote === 'string' && q.quote.trim())
    : anchorQuotes
  const sources = rawSources.map((s) => (s && typeof s === 'object' ? Number(s.doc) : s)).filter((s) => Number.isInteger(s) && s > 0)
  return { answer: v.answer.trim(), quotes, sources, notFound: v.not_found === true || /^not found/i.test(v.answer) }
}
