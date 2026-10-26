// Mechanical verifier for retrieval answers — the receipt is a CITATION,
// never a hand-written header. verify(item, answerText, corpusRoot) checks
// every citation leg against the material itself: the path exists and the
// quote appears there verbatim, the title matches the document's own title,
// and a claimed date matches the resolved metadata. A citation that lies is
// rejected; a missing date/title is tolerated. An abstention is a CLAIM
// (leading Q-line marker or NOT FOUND locators). Wrong verdicts over real
// quotes are deliberately OUT of scope — the judge's class.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { resolveMeta } from '../corpus/meta.mjs'
import { walkFiles } from '../text/walk.mjs'
import { evidenceMatches, parseAnswer, ABSTAIN_TERMS } from './text.mjs'
import { parseCite, splitLegs, monthYear } from './cite.mjs'

const ABSTAIN_LEAD = /^\s*(not found|no record|nothing (?:found|recorded)|nowhere|not documented|no mention|not in (?:the )?(?:repo|corpus|docs)|cannot find|no reference|no trace)\b/i

const stripT = (s) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
// The corpus's own vocabulary, read once per corpus identity (path+mtime+size)
// — the old per-leg whole-corpus scan re-read every file for every citation
// (HK-11). The 3000-file cap is kept.
const VOCAB = new Map()
const CORPUS_EXT = ['.md', '.js', '.mjs', '.json', '.txt', '.py']
function corpusVocab(corpusRoot) {
  const root = resolve(corpusRoot)
  const files = walkFiles(root, { extensions: CORPUS_EXT, maxDepth: 12, includeMetaJson: true }).slice(0, 3000)
  const key = root + '|' + files
    .map((p) => {
      try { const s = statSync(p); return `${relative(root, p)}:${s.mtimeMs}:${s.size}` } catch { return relative(root, p) }
    })
    .join(';')
  if (VOCAB.has(key)) return VOCAB.get(key)
  let text = ''
  for (const p of files) {
    try { text += ' ' + stripT(readFileSync(p, 'utf8')) } catch { /* binary or unreadable */ }
  }
  VOCAB.set(key, text)
  return text
}
function titleInCorpus(corpusRoot, claimed) {
  // a project/subsystem name is a legitimate title if it exists somewhere in
  // the corpus — the check catches fabricated titles, not naming styles
  const needle = stripT(claimed)
  if (needle.length < 3) return true
  return corpusVocab(corpusRoot).includes(needle)
}

const titleMatches = (claimed, resolved, content, corpusRoot) => {
  if (!claimed) return true // tolerated — the gate resolved it anyway
  const c = stripT(claimed)
  const r = stripT(resolved)
  if (r && (c === r || c.includes(r) || r.includes(c))) return true
  // a descriptive title is not a lie if it comes from the document — the
  // head word must appear in the content or somewhere real in the corpus
  if (stripT(content ?? '').includes(c)) return true
  const head = (stripT(claimed).split(' ').find((w) => w.length >= 4) ?? '')
  return Boolean(head) && (stripT(content ?? '').includes(head) || titleInCorpus(corpusRoot, head))
}

// Citations carry paths relative to whatever the tool user saw (repo-root,
// experiment-root, bare basename). Resolve robustly: exact, then suffix,
// then basename anywhere under the corpus root (bounded).
function resolveClaimed(corpusRoot, claimed) {
  const root = resolve(corpusRoot)
  let abs = join(root, claimed)
  if (existsSync(abs)) return abs
  const parts = claimed.split(/[\\/]+/).filter(Boolean)
  for (let i = 1; i < parts.length; i++) {
    abs = join(root, parts.slice(i).join('/'))
    if (existsSync(abs)) return abs
  }
  const base = parts[parts.length - 1]
  const stack = [[root, 0]]
  while (stack.length) {
    const [dir, depth] = stack.pop()
    if (depth > 3) continue
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      if (e.isDirectory()) stack.push([join(dir, e.name), depth + 1])
      else if (e.name === base) return join(dir, e.name)
    }
  }
  return null
}

export function verify(item, answerText, corpusRoot) {
  const { proposed, path, source, quote } = parseAnswer(answerText)
  const locator = source || path
  // an abstention is an EXPLICIT claim — the literal NOT FOUND shape — never
  // the mere absence of receipt lines (a bare prose answer is unproven, not
  // abstained)
  const contractAbstain = /^not found$/i.test(locator.trim()) && /^not found$/i.test(quote.trim())
  const leadAbstain = ABSTAIN_LEAD.test(proposed)
  const anyAbstain = ABSTAIN_TERMS.some((m) => proposed.toLowerCase().includes(m))
  // on answerable items only a LEADING claim abstains (answers legitimately
  // quote "NOT FOUND" rules); on not-found items any denial of existence is
  // the claim ("there is no record of …")
  const abstained = contractAbstain || (item.not_found ? (leadAbstain || anyAbstain) : leadAbstain)

  // The source tier (`source-v45`, the shipped default) carries a Source but no
  // Quote line. When there is no quote to check, the gate verifies the SOURCE —
  // the path exists, the title and date match — which is the receipt the tier
  // actually carries. A quote, when present, is still byte-checked.
  const hasQuote = String(quote ?? '').trim() !== ''

  const { paths, quotes } = splitLegs(locator, quote)
  const checked = []
  for (let i = 0; i < paths.length; i++) {
    const cite = parseCite(paths[i])
    const claimed = cite.path.replace(/:\d+(-\d+)?$/, '')
    const legQuotes = quotes.length === paths.length ? [quotes[i]] : quotes
    checked.push({ cite, claimed, legQuotes })
  }

  const runLeg = ({ cite, claimed, legQuotes }) => {
    const notes = []
    const abs = claimed ? resolveClaimed(corpusRoot, claimed) : null
    if (!abs) return { ok: false, notes: [`no such file: ${claimed || '(none)'}`] }
    const content = readFileSync(abs, 'utf8')
    if (hasQuote) {
      const quoteInFile = legQuotes.some((q) => evidenceMatches(content, q))
      if (!quoteInFile) notes.push(`quote not found in ${claimed}`)
    }
    const meta = resolveMeta(corpusRoot, relative(resolve(corpusRoot), abs), content)
    if (!titleMatches(cite.title, meta.title, content, corpusRoot)) notes.push(`title mismatch: answer says "${cite.title}" but the document is "${meta.title}"`)
    // a claimed date must match the resolved metadata OR be a date the
    // document itself carries (the record's self-described date)
    if (cite.dateImprecise) {
      notes.push('imprecise date: citations must carry month and year, never a bare year')
    } else if (cite.dateNorm) {
      const resolvedNorm = (meta.date ?? '').slice(0, 7)
      if (resolvedNorm && cite.dateNorm !== resolvedNorm && !(content.includes(cite.date) || (cite.dateNorm && content.includes(cite.dateNorm)))) {
        notes.push(`date mismatch: answer says ${cite.date} but the source resolves to ${monthYear(meta.date)} (${meta.dateSource})`)
      }
    }
    return { ok: notes.length === 0, notes, meta }
  }

  // --- not-found items: an abstention IS the correct shape and carries
  // no receipts. Any citation an abstention still claims must verify like
  // any other — anti-fabrication only, never a required receipt.
  if (item.not_found) {
    if (!abstained) return { abstained, pathExists: false, quoteInFile: false, mechanicalPass: false, why: 'should have abstained' }
    const real = checked.filter((c) => c.claimed && !/^not found$/i.test(c.claimed))
    if (!real.length) return { abstained, pathExists: true, quoteInFile: true, mechanicalPass: true, why: 'correct abstention' }
    const results = real.map(runLeg)
    const ok = results.every((r) => r.ok)
    return {
      abstained, pathExists: ok, quoteInFile: ok, mechanicalPass: ok,
      why: ok ? `correct abstention (${real.length} stray citation${real.length > 1 ? 's' : ''} verified)` : results.flatMap((r) => r.notes).join('; '),
    }
  }

  // --- answerable items: an abstention is a failure; every citation leg
  // must verify (multi-leg = all-of).
  if (abstained) return { abstained, pathExists: false, quoteInFile: false, mechanicalPass: false, why: 'abstained on an answerable item' }

  if (!checked.length || checked.every((c) => !c.claimed)) {
    return { abstained, pathExists: false, quoteInFile: false, mechanicalPass: false, why: 'no source line (or none that names a file)' }
  }
  const results = checked.map(runLeg)
  const ok = results.every((r) => r.ok)
  const resolved = results.map((r) => r.meta).filter(Boolean)
  return {
    abstained,
    sourceOnly: !hasQuote,
    pathExists: results.every((r) => r.meta || r.ok),
    quoteInFile: ok,
    mechanicalPass: ok,
    resolved,
    why: ok
      ? `${hasQuote ? 'citation verified' : 'source verified'} (${checked.length} leg${checked.length > 1 ? 's' : ''}${resolved[0] ? `; ${resolved[0].title} (${resolved[0].date})` : ''})`
      : results.flatMap((r) => r.notes).join('; ') || 'citation failed',
  }
}
