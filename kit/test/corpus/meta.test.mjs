// Title/date resolution: the sidecar > front-matter > H1 > filename ladder,
// and the date ladder (meta > git > mtime).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTitle, resolveDate, resolveMeta } from '../../lib/corpus/meta.mjs'

test('resolveTitle ladder: sidecar > front matter > markdown H1 > HTML H1 > filename', () => {
  assert.equal(resolveTitle('# Ignored\n', 'file.md', { title: 'Sidecar Wins' }), 'Sidecar Wins')
  assert.equal(resolveTitle('---\ntitle: "Front Matter"\n---\n# H1\n', 'file.md', {}), 'Front Matter')
  assert.equal(resolveTitle('intro\n# Markdown H1 **bold**\n', 'file.md', {}), 'Markdown H1 **bold**')
  assert.equal(resolveTitle('<h1 align="center">Html Title</h1>\n', 'file.md', {}), 'Html Title')
  assert.equal(resolveTitle('no heading at all', 'the_filename.md', {}), 'the_filename')
})

test('resolveDate: sidecar first, file mtime as fallback, iso-shaped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meta-'))
  writeFileSync(join(dir, 'a.md'), 'x')
  writeFileSync(join(dir, 'b.md'), 'x')
  const withMeta = resolveDate(dir, 'a.md', { updated: '2024-05-06T12:00:00Z' })
  assert.deepEqual(withMeta, { date: '2024-05-06', source: 'meta' })
  const plain = resolveDate(dir, 'b.md', {})
  assert.match(plain.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(['git', 'mtime'].includes(plain.source))
  const missing = resolveDate(dir, 'ghost.md', {})
  assert.ok(['git', 'mtime', 'none'].includes(missing.source))
  rmSync(dir, { recursive: true, force: true })
})

test('resolveMeta combines both and reads sidecars from disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meta-'))
  writeFileSync(join(dir, 'p.md'), '# Page\nbody')
  writeFileSync(join(dir, 'p.md.meta.json'), JSON.stringify({ title: 'Page From Disk', updated: '2023-01-02' }))
  const m = resolveMeta(dir, 'p.md')
  assert.equal(m.title, 'Page From Disk')
  assert.equal(m.date, '2023-01-02')
  assert.equal(m.dateSource, 'meta')
  rmSync(dir, { recursive: true, force: true })
})
