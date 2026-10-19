// Mechanical per-hop check (B108/B111/B113's "the fix must be mechanical").
//
// A multi-hop answer is only complete when the receipt shows byte-verbatim
// evidence from EVERY source document the question's hops need. Removing one
// hop leaves the other hop's evidence in place, so the LLM judge still grades
// the surviving half "supported" — the partial-support blind spot. Byte
// containment of the receipt's cited documents is not that judge: a removed
// document cannot be cited, so the missing hop is detected mechanically.
//
// This module is a BENCH experiment (like lib/judge.mjs, lib/coverage.mjs): it
// measures whether the mechanical check can close the blind spot. It is not
// yet a shipped kit primitive — the open problem is the hop DECOMPOSITION (how
// the machine learns which documents the question needs), which this check
// deliberately takes as input rather than solving.

// The temp-corpus filename a document id becomes (matches private-run.mjs /
// hotpot-fresh.mjs rel generation).
export function normalizeRel(id) {
  return String(id).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.md'
}

// requiredIds: the source documents each hop needs (raw doc ids, e.g. [docA, docB]).
// citedRels:   the documents the receipt actually cites (legs' rels — ALREADY the
//              normalized `.md` filenames produced by the temp-corpus writer).
// Returns the required ids whose rel is NOT cited (empty ⇒ every hop covered).
export function hopsMissing(requiredIds, citedRels) {
  const cited = new Set(citedRels ?? [])
  return (requiredIds ?? []).map(normalizeRel).filter((r) => !cited.has(r))
}

export function hopsCovered(requiredIds, citedRels) {
  return hopsMissing(requiredIds, citedRels).length === 0
}
