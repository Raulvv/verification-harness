import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const manifest = JSON.parse(readFileSync('bench/ooh-MANIFEST.json', 'utf8'))
const bad = []
for (const f of manifest.public_files ?? []) {
  let buf
  try { buf = readFileSync(f.path) } catch { bad.push(`${f.path} (missing)`); continue }
  const sha = createHash('sha256').update(buf).digest('hex')
  if (buf.length !== f.bytes || sha !== f.sha256) bad.push(`${f.path} (bytes ${buf.length}/${f.bytes}, sha ${sha}/${f.sha256})`)
}
if (bad.length) {
  console.error(`manifest check — ${bad.length} stale file(s):`)
  for (const b of bad) console.error('  ' + b)
  process.exit(1)
}
console.log(`manifest check OK — ${manifest.public_files.length} public files`)
