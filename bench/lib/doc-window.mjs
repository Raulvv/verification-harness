import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { selectByReference } from '../../kit/lib/retrieval/window.mjs'
import { WINDOW_STOP } from '../../kit/lib/text/stopwords.mjs'

const HEAD_CHARS = 6000
const terms = (question) => [...new Set(String(question).toLowerCase().match(/[a-z0-9]+/g) ?? [])]
  .filter((w) => w.length >= 5 && !WINDOW_STOP.has(w))

const excerpt = (text, question, limit) => {
  const head = text.slice(0, Math.min(HEAD_CHARS, limit))
  if (head.length >= limit) return head
  const lower = head.toLowerCase()
  const missing = terms(question).filter((t) => !lower.includes(t))
  if (!missing.length) return head
  const seen = new Set()
  const tail = []
  for (const line of text.slice(head.length).split('\n')) {
    const l = line.toLowerCase()
    if (!missing.some((t) => l.includes(t))) continue
    const key = line.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    tail.push(key)
    if (head.length + tail.join('\n').length >= limit) break
  }
  if (!tail.length) return head
  return head + '\n\n[question-relevant excerpts]\n' + tail.join('\n')
}

export function windowDocs(corpusRoot, question, { k = 3, docChars = 20000, mode = 'excerpt' } = {}) {
  const root = resolve(corpusRoot)
  const limit = Number.isFinite(docChars) && docChars > 0 ? docChars : Infinity
  return selectByReference(root, question).candidates.slice(0, k)
    .map((c) => {
      const text = readFileSync(join(root, c.rel), 'utf8')
      const content = mode === 'full' ? text.slice(0, limit)
        : mode === 'head' ? text.slice(0, limit)
          : excerpt(text, question, limit)
      return { rel: c.rel, content }
    })
}
