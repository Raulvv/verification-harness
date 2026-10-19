// Pure core for bench/e2e-ir.mjs (b121): pool building from HotpotQA rows,
// recall arithmetic, run summaries. No fs, no model calls — unit-tested in
// scripts/e2e-ir-core.test.js. Conventions match bench/iterative-hotpot.mjs
// (dedup key, goldIds restricted to the item's own paragraphs, rel slugs).

export const dedupKey = (title, text) => (title + '\u0000' + text).toLowerCase()

export const slugRel = (title, i, taken) => {
  const base = String(title).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `doc${i}`
  let rel = `${base}.md`, k = 1
  while (taken.has(rel)) rel = `${base}_${k++}.md`
  taken.add(rel)
  return rel
}

// rows: HotpotQA distractor rows. Returns the shared doc pool (deduped across
// rows — a paragraph that is gold for one question and distractor for another
// is ONE doc) plus per-item metadata with goldIds = the ids of the item's own
// paragraphs whose title is in supporting_facts (iterative-hotpot convention).
export function buildPool (rows) {
  const docs = []
  const key2id = new Map()
  const items = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const ownIds = []
    r.context.title.forEach((t, j) => {
      const text = (r.context.sentences[j] ?? []).join(' ')
      const key = dedupKey(t, text)
      let id = key2id.get(key)
      if (id == null) { id = docs.length; key2id.set(key, id); docs.push({ title: t, text }) }
      ownIds.push(id)
    })
    const goldTitles = new Set((r.supporting_facts?.title ?? []).map((t) => String(t).toLowerCase()))
    items.push({
      i,
      id: r.id ?? String(i),
      type: r.type ?? 'bridge',
      question: r.question,
      answer: r.answer,
      goldIds: ownIds.filter((id) => goldTitles.has(String(docs[id].title).toLowerCase())),
    })
  }
  const taken = new Set()
  const rels = docs.map((d, i) => slugRel(d.title, i, taken))
  return { docs, rels, items }
}

export const bothGold = (retrievedIds, goldIds) =>
  Array.isArray(goldIds) && goldIds.length > 0 && goldIds.every((g) => retrievedIds.includes(g))

export function summarize (rows, items, gatedArms = ['ours']) {
  const arms = {}
  const recall = { dense: { both: 0 }, hybrid: { both: 0 }, iterative: { both: 0 } }
  const byType = {}
  const seenItem = new Set()
  for (const r of rows) {
    const a = (arms[r.arm] ??= { n: 0, shown: 0, contains: 0, oracle_correct: 0, oracle_labeled: 0, states: { not_found: 0, unverified: 0, verified: 0 } })
    a.n++
    const shown = gatedArms.includes(r.arm) ? r.state !== 'not_found' : true
    if (shown) a.shown++
    if (r.contains_gold) a.contains++
    if (r.oracle_correct != null) { a.oracle_labeled++; if (r.oracle_correct) a.oracle_correct++ }
    if (gatedArms.includes(r.arm) && r.state) a.states[r.state]++
    if (!seenItem.has(r.id)) {
      seenItem.add(r.id)
      const t = r.type ?? 'unknown'
      const bt = (byType[t] ??= { n: 0, dense: 0, hybrid: 0, iterative: 0 })
      bt.n++
      if (r.recall_dense) { bt.dense++; recall.dense.both++ }
      if (r.recall_hybrid) { bt.hybrid++; recall.hybrid.both++ }
      if (r.recall_iterative) { bt.iterative++; recall.iterative.both++ }
    }
  }
  // gate × contains cross-tab (ours only): does the state split the right way?
  const crossTab = {}
  for (const r of rows) {
    if (!gatedArms.includes(r.arm)) continue
    const s = (crossTab[r.state] ??= { n: 0, contains: 0, oracle_correct: 0, oracle_labeled: 0 })
    s.n++
    if (r.contains_gold) s.contains++
    if (r.oracle_correct != null) { s.oracle_labeled++; if (r.oracle_correct) s.oracle_correct++ }
  }
  const recallN = items ?? seenItem.size
  return { arms, recall: { n: recallN, dense: recall.dense.both, hybrid: recall.hybrid.both, iterative: recall.iterative.both }, byType, crossTab }
}

export const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : `${a}/${b}`)
