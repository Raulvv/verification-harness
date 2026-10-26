// Citation legs: "<title> (<date>) · <path:line>" — parsing the path, the
// title and the date; a bare legacy path is accepted too. Legs are
// delimited by their PATHS, never by words (a title may contain "and",
// colons, em-dashes, anything).
// oxlint-disable-next-line no-useless-escape -- `\[`/`\]`/`\/` keep the class
// unambiguous; removing them breaks parseCite (proven red by the suite).
const PATH_RE = /[\w@.\-\/\[\]()%]+\.[A-Za-z0-9]+(?::\d+(?:-\d+)?)?/g

export function splitLegs(locator, quote) {
  const clean = (s) => s.replace(/^[|;,\s]+/, '').replace(/[|;,\s]+$/, '').trim()
  const isLocator = (t) => t.includes('/') || t.includes(':') || /\.(?:md|markdown|html?|txt|json|ya?ml)$/i.test(t)
  const found = [...(locator ?? '').matchAll(PATH_RE)].filter((m) => isLocator(m[0]))
  let paths
  if (found.length >= 1) {
    paths = []
    for (let i = 0; i < found.length; i++) {
      const start = i === 0 ? 0 : found[i - 1].index + found[i - 1][0].length
      const end = found[i].index + found[i][0].length
      paths.push(clean((locator ?? '').slice(start, end)))
    }
  } else {
    paths = (locator ?? '').split(/\s*(?:;|\band\b|\|)\s*/).map(clean).filter(Boolean)
  }
  const byPipe = (quote ?? '').split(/\s+\|\s+/).map(clean).filter(Boolean)
  const bySemi = (quote ?? '').split(/\s*(?:;|\band\b)\s+/).map(clean).filter(Boolean)
  let quotes = byPipe
  if (bySemi.length > 1 && bySemi.length === paths.length && byPipe.length !== paths.length) quotes = bySemi
  return { paths: paths.filter(Boolean), quotes: quotes.length ? quotes : [quote ?? ''] }
}

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }

// "Sep 2026" / "September 2026" / "2026-09" / "2026-09-19" -> YYYY-MM;
// a bare year is imprecise (the maintainer rule: month and year, never year)
export function citeDate(leg) {
  const isoFull = /\((\d{4})-(\d{2})(?:-\d{2})?\)/.exec(leg ?? '')
  if (isoFull) return { raw: isoFull[0].slice(1, -1), norm: isoFull[1] + '-' + isoFull[2], imprecise: false }
  const named = /\(([A-Za-z]{3,9})\.?\s+(\d{4})\)/.exec(leg ?? '')
  if (named) {
    const mon = MONTHS[named[1].slice(0, 3).toLowerCase()]
    if (mon) return { raw: named[0].slice(1, -1), norm: named[2] + '-' + mon, imprecise: false }
  }
  const yearOnly = /\((\d{4})\)/.exec(leg ?? '')
  if (yearOnly) return { raw: yearOnly[1], norm: '', imprecise: true }
  return { raw: '', norm: '', imprecise: false }
}

// Month YYYY for display (the maintainer rule: month and year, never year)
export function monthYear(isoOrRaw) {
  const m = /(\d{4})-(\d{2})/.exec(isoOrRaw ?? '')
  if (!m) return isoOrRaw ?? ''
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return names[Number(m[2]) - 1] + ' ' + m[1]
}

export function parseCite(leg) {
  const d = citeDate(leg)
  const date = d.raw
  const all = [...(leg ?? '').matchAll(PATH_RE)]
  const pick = (all.filter((m) => m[0].includes('/') || m[0].includes(':')).pop() ?? all.pop())?.[0] ?? ''
  const path = pick.trim() || (leg ?? '').trim()
  const title = (leg ?? '').replace(/\([^)]*\d{4}[^)]*\)/g, '').replace(path, '').replace(/[·—–,|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { title, date, dateNorm: d.norm, dateImprecise: d.imprecise, path }
}
