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
