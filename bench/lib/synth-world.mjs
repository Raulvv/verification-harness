// The deterministic synthetic world (shared by synth2.mjs and iterative.mjs).
const SYL1 = ['vel', 'qar', 'zor', 'mel', 'tor', 'nab', 'kil', 'ras', 'dun', 'fen', 'lor', 'vash', 'gim', 'bex', 'olen', 'cyr', 'dal', 'mar', 'sund', 'wel', 'brim', 'hox', 'irn', 'jek', 'kald', 'lum', 'myr', 'nix', 'osr', 'peld']
const SYL2 = ['mora', 'zak', 'ius', 'dor', 'pek', 'lon', 'gar', 'vic', 'sha', 'ton', 'grad', 'holm', 'vik', 'stad', 'burg', 'field', 'mere', 'wick', 'ford', 'land', 'ova', 'ium', 'esh', 'ara']
const SYL3 = ['ax', 'or', 'ith', 'un', 'esk', 'om', 'yr', 'ad', 'el', 'us', 'ik', 'en']
const REG = ['Ashen Coast', 'Verdant Reach', 'Cobalt Plains', 'Hollow Vale', 'Amber Steppe', 'Iron Fjords', 'Silent Dunes', 'Glimmer Marsh']
const cap = (x) => x[0].toUpperCase() + x.slice(1)

export function world(Q, D) {
  let s = 42
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const usedNames = new Set()
  const name = () => { let n; do { n = cap(pick(SYL1) + pick(SYL2) + (rnd() < 0.5 ? pick(SYL3) : '')) } while (usedNames.has(n)); usedNames.add(n); return n }
  const person = () => cap(pick(SYL1)) + ' ' + cap(pick(SYL2)) + cap(pick(SYL3))
  const founders = Array.from({ length: Math.ceil(D * 0.7) }, person)
  const docs = Array.from({ length: D }, () => {
    const n = name(), founder = pick(founders), region = pick(REG)
    const year = 1500 + Math.floor(rnd() * 520)
    const pop = (10 + Math.floor(rnd() * 4990)) * 1000
    const elev = 10 + Math.floor(rnd() * 2990)
    return { title: n, text: `${n} is a settlement in the ${region} region. It was founded in ${year} by ${founder}. As of the 2020 census, ${n} had a population of ${pop.toLocaleString('en-US')} inhabitants. The settlement lies at an elevation of ${elev} metres.`, founder, year, pop }
  })
  const byFounder = new Map()
  for (const d of docs) { if (!byFounder.has(d.founder)) byFounder.set(d.founder, []); byFounder.get(d.founder).push(d) }
  const shared = [...byFounder.values()].filter((ds) => ds.length === 2)
  const questions = []
  for (let i = 0; i < Q; i++) {
    const d = docs[Math.floor(rnd() * docs.length)]
    const kind = i % 4
    if (kind === 0) questions.push({ id: `q${i}`, kind: 'year', question: `In what year was ${d.title} founded?`, gold: String(d.year), goldPages: [d.title] })
    else if (kind === 1) questions.push({ id: `q${i}`, kind: 'founder', question: `Who founded ${d.title}?`, gold: d.founder, goldPages: [d.title] })
    else if (kind === 2) questions.push({ id: `q${i}`, kind: 'population', question: `What was the population of ${d.title} in the 2020 census?`, gold: d.pop.toLocaleString('en-US'), goldPages: [d.title] })
    else {
      const ds = shared[Math.floor(rnd() * shared.length)] ?? [d]
      questions.push({ id: `q${i}`, kind: 'multi-hop', question: `Besides ${ds[0].title}, which other settlement did ${ds[0].founder} found?`, gold: (ds[1] ?? ds[0]).title, goldPages: [ds[0].title, (ds[1] ?? ds[0]).title] })
    }
  }
  return { docs, questions }
}
