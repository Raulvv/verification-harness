// Shared CLI argument parsing — one home (RN-K05). Every bin carried its own
// copy of `arg`/`includes`; this is that pair plus the flag-group parser the
// score/verify CLIs need.
export const makeArgs = (argv) => ({
  argv,
  arg: (k) => {
    const i = argv.indexOf('--' + k)
    return i >= 0 ? argv[i + 1] : null
  },
  has: (k) => argv.includes('--' + k),
})

// Fail loud on unknown flags: a typo (`--quote.`) must never silently become
// the default behavior — same guard class as the unknown-retriever refusal in
// resolve.mjs. Keys are camelCase (the CLI parser camel-cases
// `--judge-evidence`); booleans must arrive bare, because a value means the
// flag swallowed the next token (`--minimal-receipt "question"`).
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
export function validateFlags(flags, valid, { booleans = [] } = {}) {
  const unknown = Object.keys(flags).filter((k) => !valid.includes(k))
  if (unknown.length) {
    throw new Error(`unknown flag: --${unknown.map(kebab).join(', --')} — valid flags: --${valid.map(kebab).join(', --')} (see \`retrieval-kit --help\`)`)
  }
  const valued = booleans.filter((b) => flags[b] !== undefined && flags[b] !== true)
  if (valued.length) {
    throw new Error(`--${valued.map(kebab).join(', --')} is a bare flag — it takes no value`)
  }
}

// The ask surface (one-off + resolveAsk + printing). Any `--x` outside this
// list is refused instead of silently ignored.
export const ASK_FLAGS = [
  'aggregate', 'apiKey', 'apiKeyEnv', 'baseUrl', 'corpus', 'embedModel', 'files',
  'grounding', 'hi', 'judge', 'judgeBaseUrl', 'judgeCmd', 'judgeEvidence', 'json',
  'lo', 'maxQuotesPerDoc', 'minimalReceipt', 'model', 'noAbsence', 'noGrounding', 'quote', 'retriever', 'source', 'spec',
  'sufficient', 'table', 'tier', 'unverified',
]
export const ASK_BOOLEAN = ['aggregate', 'json', 'minimalReceipt', 'noAbsence', 'noGrounding', 'quote', 'source', 'sufficient', 'unverified']

// The config surface (runConfig).
export const CONFIG_FLAGS = [
  'absence', 'apiKey', 'apiKeyEnv', 'at', 'baseUrl', 'corpus', 'embedModel',
  'model', 'noAbsence', 'retriever', 'reset', 'show', 'source', 'tier',
]
export const CONFIG_BOOLEAN = ['noAbsence', 'reset', 'show', 'source']

// Collect `--multi a b c` groups, `--single value` options and bare
// positionals, preserving order. Behaviour matches the hand-rolled loops it
// replaces (a multi flag consumes non-`--` tokens until the next flag).
export function parseFiles(argv, { multi = [], single = [] } = {}) {
  const groups = Object.fromEntries(multi.map((k) => [k, []]))
  const options = {}
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--') && multi.includes(a.slice(2))) {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) groups[a.slice(2)].push(argv[++i])
    } else if (a.startsWith('--') && single.includes(a.slice(2))) {
      options[a.slice(2)] = argv[++i]
    } else if (!a.startsWith('--')) {
      positionals.push(a)
    }
  }
  return { groups, options, positionals }
}
