// opencode-go key resolution for bench runners. Two consumers with different
// needs share one file: the reader route (used only when READER_HOSTED) and
// the hosted accuracy oracle in private-run — which needs the key even for a
// local reader, or every answered answerable record silently scores
// correct=0 (the bug this helper exists to make un-repeatable: gating key
// loading on the reader being hosted). So: whenever the auth file exists,
// the key loads; null means "no credentials here" (air-gapped local runs),
// never a silent wrong label — callers fail loud.
import { readFileSync, existsSync } from 'node:fs'

export function opencodeKey(home) {
  const p = home + '/.local/share/opencode/auth.json'
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))?.['opencode-go']?.key ?? null
}
