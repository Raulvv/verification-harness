// The one recursive corpus walker (RN-K05). Window selection, locate and the
// adapters all traverse a corpus tree; they differed only in which suffixes
// count. Dotfiles and `node_modules` are always skipped; depth is bounded — a
// corpus is a tree, not a filesystem. `.meta.json` sidecars are never corpus
// documents.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export function walkFiles(dir, { extensions = ['.md'], maxDepth = 6, includeMetaJson = false, out = [] } = {}) {
  const walk = (d, depth) => {
    if (depth > maxDepth) return out
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (!includeMetaJson && /\.meta\.json$/i.test(e.name)) continue
      else if (extensions.some((x) => p.toLowerCase().endsWith(x))) out.push(p)
    }
    return out
  }
  return walk(dir, 0)
}
