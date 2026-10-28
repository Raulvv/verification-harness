// Mechanical arm scoring. Handles scalar and object golds; no model calls.
import { ABSTAIN_TERMS, norm, numbersIn } from '../../kit/lib/receipts/text.mjs'

const hasAbstain = (t) => ABSTAIN_TERMS.some((m) => norm(t).includes(m)) || /\b(?:do|does) not (?:provide|state|list|report|include|contain|specify)\b/i.test(t)
export const leadAbstain = (t) => /^\s*(not found|no record|cannot find|nowhere|not documented|not stated)\b/i.test(t)
const valueIn = (text, v) => typeof v === 'number'
  ? numbersIn(text).includes(String(v)) || numbersIn(text).includes(String(v).replace(/(\d)(?=(\d{3})+$)/g, '$1'))
  : norm(text).includes(norm(String(v)))
const goldIn = (text, gold) => {
  if (gold && typeof gold === 'object') {
    if (gold.winner != null && !norm(text).includes(norm(String(gold.winner)))) return false
    for (const [k, v] of Object.entries(gold)) {
      if (k === 'winner' || v == null) continue
      if (typeof v === 'number' && !valueIn(text, v)) return false
      if (typeof v === 'string' && !valueIn(text, v)) return false
    }
    return true
  }
  return valueIn(text, gold)
}

export function score(item, text) {
  const abstained = leadAbstain(text) || (item.condition === 'unanswerable' && hasAbstain(text))
  if (item.condition === 'unanswerable') return { shown: !abstained, correct: abstained, falseAccept: !abstained }
  if (item.condition === 'partial') {
    const stated = (item.gold?.parts ?? []).filter((p) => p.status === 'stated')
    const gotStated = stated.every((p) => valueIn(text, p.value))
    const flagged = hasAbstain(text)
    return { shown: !leadAbstain(text), correct: gotStated && flagged, falseAccept: !leadAbstain(text) && !flagged }
  }
  const ok = !abstained && goldIn(text, item.gold)
  return { shown: !abstained, correct: ok, falseAccept: !abstained && !ok }
}

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]
  const p = k / n, d = 1 + z * z / n
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}
