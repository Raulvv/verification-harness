// Shared fake `twg` binary for transport/adapter tests — the single
// mocked boundary (epic §8.3). Records argv to $FAKE_TWG_LOG, counts
// calls in $FAKE_TWG_COUNT, behaves per $FAKE_TWG_SCENARIO. The `ok`
// scenario emits JSON only when `--output-summary none` is present, like
// the real CLI; `adapter` dispatches on the subcommand and serves the
// probe fixtures per requested id.
import { writeFileSync, readFileSync, chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const FAKE_TWG_SCRIPT = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_TWG_LOG"
n=$(cat "$FAKE_TWG_COUNT" 2>/dev/null || echo 0)
n=$((n+1))
echo "$n" > "$FAKE_TWG_COUNT"
case "$FAKE_TWG_SCENARIO" in
  ok)
    if echo "$*" | grep -q -- '--output-summary none'; then cat "$FAKE_TWG_FIXTURE"; else cat "$FAKE_TWG_YAML"; fi ;;
  fail-once)
    if [ "$n" -eq 1 ]; then echo 'transient boom' >&2; exit 1; fi
    cat "$FAKE_TWG_FIXTURE" ;;
  fail-always)
    echo 'permanent boom' >&2; exit 1 ;;
  slow)
    sleep 3; cat "$FAKE_TWG_FIXTURE" ;;
  cursor-endless)
    if [ "$n" -ge 25 ]; then cat "$FAKE_TWG_FIXTURE_END"; else cat "$FAKE_TWG_FIXTURE"; fi ;;
  cursor-then-end)
    if [ "$n" -eq 1 ]; then cat "$FAKE_TWG_FIXTURE"
    elif [ "$n" -ge 25 ]; then echo 'fixture cap' >&2; exit 1
    else cat "$FAKE_TWG_FIXTURE_END"; fi ;;
  cursor-empty)
    echo '{"data":{"results":[],"nextCursor":"cur"}}' ;;
  adapter)
    case "$*" in
      *"search query"*)
        if [ -n "$FAKE_TWG_FAIL_LIST" ]; then echo 'search boom' >&2; exit 1; fi
        case "$*" in
          *--cursor*) cat "$FAKE_TWG_SEARCH_END" ;;
          *) cat "$FAKE_TWG_SEARCH" ;;
        esac ;;
      *"content get"*)
        id=; prev=
        for a in "$@"; do
          if [ "$prev" = "get" ]; then id=$a; fi
          prev=$a
        done
        if [ "$id" = "$FAKE_TWG_FAIL_ID" ]; then echo 'get boom' >&2; exit 1; fi
        if [ -f "$FAKE_TWG_GET_DIR/$id.json" ]; then cat "$FAKE_TWG_GET_DIR/$id.json"
        else echo "no fixture for $id" >&2; exit 1; fi ;;
      *)
        echo 'unknown call' >&2; exit 1 ;;
    esac ;;
esac
`

// Install the fake into a fresh dir; env vars point it at fixtures.
// Returns { dir, logPath, calls, teardown }.
export function installFakeTwg(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'twg-fake-'))
  const bin = join(dir, 'twg')
  writeFileSync(bin, FAKE_TWG_SCRIPT)
  chmodSync(bin, 0o755)
  const saved = { ...process.env }
  process.env.PATH = `${dir}:/bin:/usr/bin` // the fake is the only twg findable
  process.env.FAKE_TWG_LOG = join(dir, 'calls.log')
  process.env.FAKE_TWG_COUNT = join(dir, 'calls.count')
  writeFileSync(process.env.FAKE_TWG_LOG, '')
  Object.assign(process.env, env)
  return {
    dir,
    calls: () => (readFileSyncSafe(process.env.FAKE_TWG_LOG).trim().split('\n').filter(Boolean)),
    teardown: () => {
      process.env = saved
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function readFileSyncSafe(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}
