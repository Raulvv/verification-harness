#!/usr/bin/env node
// The whole safety net in one command: unit tests for every pure layer, the
// battery's frozen-contract guard, and the gate drills.
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.test.mjs')) out.push(p)
  }
  return out
}
const dirs = ['kit/test'].filter((d) => existsSync(join(REPO, d)))
if (!dirs.length) throw new Error('kit gate: no test dir found (kit/test missing?)')
const files = dirs.flatMap((d) => walk(join(REPO, d)))
console.log(`running ${files.length} test files…`)
execFileSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: REPO })
console.log('\ngate drills:')
execFileSync(process.execPath, [join(REPO, 'kit/bin/verify.mjs'), '--self-test'], { stdio: 'inherit', cwd: REPO })
