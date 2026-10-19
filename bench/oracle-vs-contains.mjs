#!/usr/bin/env node
// Oracle vs the model-free contains-gold proxy — backs B103(a): agreement
// 88.1%, Cohen's kappa 0.522 on the 4B answered-answerable (n=286). The
// token-F1 comparison lives in oracle-vs-f1.mjs (unusable at 12.2%).
//
//   node bench/oracle-vs-contains.mjs
import { readFileSync } from 'node:fs'

const rows = readFileSync('unified.jsonl', 'utf8').trim().split('\n').map(JSON.parse)
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const containsGold = (t, g) => { const x = norm(t), y = norm(g); return !!y && (x.includes(y) || y.split(' ').every((w) => x.includes(w))) }

const answered = rows.filter((r) => r.run_id.startsWith('b95') && r.condition === 'answerable' && !r.reader_abstained && !r.parse_failure && r.answer)
const pairs = answered.map((r) => [containsGold(r.answer, r.gold_answer) ? 1 : 0, r.oracle_correct])
const n = pairs.length
const po = pairs.filter(([a, b]) => a === b).length / n
const p1 = pairs.filter(([a]) => a).length / n
const q1 = pairs.filter(([, b]) => b).length / n
const pe = p1 * q1 + (1 - p1) * (1 - q1)
const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe)
console.log(`oracle vs contains-gold: n=${n} agreement ${(po * 100).toFixed(1)}% · Cohen's kappa ${kappa.toFixed(3)}`)
