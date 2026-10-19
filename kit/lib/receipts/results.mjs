// Result-file reader shared by the score/verify CLIs (RN-K05). A results file
// is either a bare array or an object carrying `.final` / `.rows`.
import { readFileSync } from 'node:fs'

export function readResults(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(j) ? j : (j.final ?? j.rows ?? [])
}
