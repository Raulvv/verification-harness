#!/usr/bin/env node
// Coverage for the kit's own offline suite, with a floor (RN-K07). Same file
// discovery as bin/test.mjs, with V8 coverage on. Runs no model, no network.
//
//   node kit/bin/coverage.mjs
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Recorded 2026-10-06 (references in kit/README.md). Raise, never lower.
const FLOOR = { statements: 95, branches: 75 }

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.test.mjs')) out.push(p)
  }
  return out
}
const files = walk(join(REPO, 'kit', 'test'))
console.log(`coverage over ${files.length} test files…`)

let out = ''
try {
  out = execFileSync(process.execPath, ['--test', '--experimental-test-coverage', ...files], { cwd: REPO, encoding: 'utf8' })
} catch (e) {
  process.stdout.write(String(e.stdout ?? ''))
  process.stderr.write(String(e.stderr ?? ''))
  console.error('kit coverage: the suite is red — a floor over a red suite is meaningless')
  process.exit(1)
}
process.stdout.write(out)

const m = out.match(/all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/)
if (!m) {
  console.error('kit coverage: could not read the "all files" summary line')
  process.exit(1)
}
const [statements, branches] = [Number(m[1]), Number(m[2])]
console.log(`\nkit coverage floor: statements ${statements}% (>= ${FLOOR.statements}%), branches ${branches}% (>= ${FLOOR.branches}%)`)
if (statements < FLOOR.statements || branches < FLOOR.branches) {
  console.error('kit coverage REGRESSED below the floor — raise the tests, do not lower the floor')
  process.exit(1)
}
