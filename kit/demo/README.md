# Hero demo — the receipt machine, offline

Runs the **real** receipt machinery on **recorded** model answers. No model, no
network, no API key — deterministic, seconds, on a clean machine.

```sh
node kit/demo/demo.mjs
```

## The three acts

1. **An honest citation resolves.** A recorded answer names a file and a quote;
   the machine lifts the quote from the file and the gate re-checks it
   byte-for-byte → **verified**.
2. **A fabricated citation is rejected.** A recorded answer invents a sentence
   that no file contains; `rehomeLegs` **drops** it (it never enters a receipt),
   and if the lying citation is presented anyway the gate rejects it with the
   reason.
3. **An honest refusal.** A question the corpus cannot answer comes back
   `NOT FOUND` with **no** receipt — the machine does not invent evidence.

## What is real, what is recorded

- **Real:** the entire machine — `parseOneShot` → `rehomeLegs` →
  `assembleOneShot` → `verify` — and the corpus (`corpus/`).
- **Recorded:** the three model answers (`model-outputs.json`), so the demo is
  deterministic and needs no model. The live path is the normal CLI:

  ```sh
  node kit/bin/sync.mjs --config retrieval.config.json
  node kit/bin/ask.mjs --golden golden/golden.json --config retrieval.config.json
  ```

The receipt's `Source` line is resolved from each file's own metadata
(`<file>.meta.json`, else git, else mtime), never hand-written — which is why
the fabricated citation in Act 2 cannot be papered over with a correct-looking
header.

Guard: `kit/test/demo.test.mjs` asserts all three acts, so the demo cannot go
stale if the machine changes.
