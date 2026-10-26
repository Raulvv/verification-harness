// Structural guard: the kit/lib module graph must stay acyclic and must not
// reach into bin/. It freezes the shape ahead of the separation-of-concerns
// refactor and catches an accidental import cycle afterwards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LIB = join(REPO, 'kit', 'lib')

function modules(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) modules(p, out)
    else if (e.name.endsWith('.mjs')) out.push(p)
  }
  return out
}

// adjacency: module -> set of lib modules it imports
function graph(mods) {
  const set = new Set(mods.map((p) => resolve(p)))
  const edges = new Map()
  for (const abs of mods) {
    const src = readFileSync(abs, 'utf8')
    const deps = new Set()
    const pats = [
      /\bfrom\s+['"](\.[^'"]+)['"]/g,          // import x from './y'
      /\bimport\s+['"](\.[^'"]+)['"]/g,        // import './y'  (side effect)
      /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g, // await import('./y')
    ]
    for (const re of pats) for (const m of src.matchAll(re)) {
      const dep = resolve(dirname(abs), m[1])
      if (set.has(dep)) deps.add(dep)
    }
    edges.set(resolve(abs), deps)
  }
  return edges
}

export function findCycle(edges) {
  const color = new Map([...edges.keys()].map((k) => [k, 0])) // 0 white, 1 grey, 2 black
  const stack = []
  let cycle = null
  const visit = (n) => {
    if (cycle) return
    color.set(n, 1)
    stack.push(n)
    for (const d of edges.get(n) ?? []) {
      if (color.get(d) === 1) { cycle = [...stack.slice(stack.indexOf(d)), d]; return }
      if (color.get(d) === 0) { visit(d); if (cycle) return }
    }
    stack.pop()
    color.set(n, 2)
  }
  for (const n of edges.keys()) { if (color.get(n) === 0) visit(n); if (cycle) break }
  return cycle
}

const mods = modules(LIB)
const edges = graph(mods)

test('structure: the lib graph is acyclic', () => {
  const c = findCycle(edges)
  assert.equal(c, null, 'cycle: ' + (c ?? []).map((p) => relative(REPO, p)).join(' -> '))
})

test('structure: the cycle detector is non-vacuous', () => {
  const a = '/a', b = '/b', c = '/c'
  assert.deepEqual(findCycle(new Map([[a, new Set([b])], [b, new Set([c])], [c, new Set([a])]])), [a, b, c, a])
  assert.equal(findCycle(new Map([[a, new Set([b, c])], [b, new Set([c])], [c, new Set()]])), null)
})

test('structure: lib never imports bin', () => {
  for (const abs of mods) {
    const src = readFileSync(abs, 'utf8')
    assert.ok(!/(?:from|\()\s*['"][^'"]*\/bin\//.test(src), `lib imports bin: ${relative(REPO, abs)}`)
  }
})
