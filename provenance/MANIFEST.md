# Migration manifest — chain of custody

Every artifact under `provenance/` was migrated on **2026-11-09** from a
private development repository so that this repository is independently
verifiable. Source hashes are recorded so the migration itself can be audited
against the origin. Two redaction passes were applied to the migrated copies:
(1) identity scrub — commit hash/subject columns blanked in `spend.csv`,
origin names removed; (2) private-corpus redaction — the private corpus's
name appears as “private wiki” in the extracts. Nothing outside this
repository is needed to verify any claim in `PROVENANCE.md`.

| Migrated artifact | Source artifact (private origin) | Source SHA-256 | Migrated SHA-256 | Transform |
|---|---|---|---|---|
| `provenance/data/spend.csv` | `metrics/spend.csv` | `0ab5fb43d3164983…` | `f474fc1f67692ecf…` | sanitized: hash+subject columns blanked; numeric columns identical |
| `provenance/data/naruto-batch.json` | `bench/results/naruto-batch.json` | `054352c5ed42e20d…` | `054352c5ed42e20d…` | verbatim |
| `provenance/data/naruto-golden-meta.json` | `naruto-experiment/golden.json` | `98a6964c04040a7c…` | `4e6099e3a8e4672b…` | extracted corpus description; source labeled generically |
| `provenance/data/crossover-100.json` | `bench/results/crossover-100.json` | `3a9424389bbcc564…` | `3a9424389bbcc564…` | verbatim |
| `provenance/data/final-arms-100.json` | `bench/results/final-arms-100.json` | `16b66127c2d742c0…` | `16b66127c2d742c0…` | verbatim |
| `provenance/data/tier-b-hotpot-300-judged.jsonl` | `bench/results/tier-b-hotpot-300-judged.jsonl` | `f78c01e95b6f2f9b…` | `f78c01e95b6f2f9b…` | verbatim |
| `provenance/data/abstentionbench-items.jsonl` | `bench/results/abstentionbench-items.jsonl` | `fba17017bc1e6a1b…` | `fba17017bc1e6a1b…` | verbatim |
| `provenance/data/abstentionbench-arms.jsonl` | `bench/results/abstentionbench-arms.jsonl` | `1fc21af0b708232f…` | `1fc21af0b708232f…` | verbatim |
| `provenance/data/abstentionbench-items-musique.jsonl` | `bench/results/abstentionbench-items-musique.jsonl` | `fdc030264a9004f4…` | `fdc030264a9004f4…` | verbatim |
| `provenance/data/abstentionbench-arms-musique.jsonl` | `bench/results/abstentionbench-arms-musique.jsonl` | `98ec83dc4c509ce3…` | `98ec83dc4c509ce3…` | verbatim |
| `provenance/data/abstentionbench-judged.jsonl` | `bench/results/abstentionbench-judged.jsonl` | `482f394da3ec42d9…` | `482f394da3ec42d9…` | verbatim |
| `provenance/data/abstentionbench-judged-blind.jsonl` | `bench/results/abstentionbench-judged-blind.jsonl` | `63dea9f8a46a50bd…` | `63dea9f8a46a50bd…` | verbatim |
| `provenance/data/abstentionbench-judged-musique.jsonl` | `bench/results/abstentionbench-judged-musique.jsonl` | `f07e1877c6c331d0…` | `f07e1877c6c331d0…` | verbatim |
| `provenance/data/abstentionbench-judged-musique-blind.jsonl` | `bench/results/abstentionbench-judged-musique-blind.jsonl` | `a0ee5a85aaa6116d…` | `a0ee5a85aaa6116d…` | verbatim |
| `provenance/data/squad54-audit.tsv` | `bench/squad54-audit.tsv` | `126cc1291ccbe5f9…` | `126cc1291ccbe5f9…` | verbatim |
| `provenance/tools/citation-audit.mjs` | `bench/citation-audit.mjs` | `b86c8a94493566e5…` | `1439eee1a54e26df…` | paths adjusted: bench/results/ -> data/ |
| `provenance/tools/citation-minimality.mjs` | `bench/citation-minimality.mjs` | `fc8bb4a6e02be2db…` | `9f8d79b5dc66f312…` | paths adjusted: bench/results/ -> data/ |
| `provenance/sources/RESULTS-extract.md` | `bench/RESULTS.md` | `674384ca6908b57c…` | `aa4fa088c9ee9c38…` | verbatim section extracts; private-corpus name redacted |
| `provenance/sources/STATUS-extract.md` | `bench/STATUS.md` | `93dc66172883e53a…` | `ecaba847e2a59bc5…` | verbatim section extracts; private-corpus name redacted |
| `provenance/sources/BENCHMARKS-extract.md` | `bench/BENCHMARKS.md` | `58a7a8b4253b418b…` | `6f623b685832d37a…` | verbatim section extract |
| `provenance/sources/CLAIMS-extract.md` | `bench/CLAIMS.md` | `8dd089b7746f3ef9…` | `181f58ce3bf93b86…` | verbatim extract (lines 1-30) |
| `provenance/sources/LEDGER-extract.md` | `docs/epicas/retrieval-claims-ledger.md` | `b085fe49d255a071…` | `f2b527b643d7b60e…` | verbatim B-entry rows (B58, B107, B110, B113, B118); names redacted |

Full hashes:

- `provenance/data/spend.csv`: source `0ab5fb43d316498392dfa5a8bdaa7662dc7becd09d2615474a60326616d14cc9`, migrated `f474fc1f67692ecf0ac9bd4452699254c9a29f5ab0738bd2d2b43733e7cbddd9`
- `provenance/data/naruto-batch.json`: source `054352c5ed42e20d65dc03f1c59792d3520e1b034c49a235ca9b4caab784d329`, migrated `054352c5ed42e20d65dc03f1c59792d3520e1b034c49a235ca9b4caab784d329`
- `provenance/data/naruto-golden-meta.json`: source `98a6964c04040a7c5484ba51e4effd733b7f2ee98392dde594676c1db7e83e95`, migrated `4e6099e3a8e4672ba91f3529532d7aa7a153d2dac7c79987b1378e33c67e78d2`
- `provenance/data/crossover-100.json`: source `3a9424389bbcc564d1d0d0cd263dcfab8eb6232dcb5c406911f5f079b5d166e3`, migrated `3a9424389bbcc564d1d0d0cd263dcfab8eb6232dcb5c406911f5f079b5d166e3`
- `provenance/data/final-arms-100.json`: source `16b66127c2d742c0ed59fc718d693ad92da997914f03afc7146146ad84ef079b`, migrated `16b66127c2d742c0ed59fc718d693ad92da997914f03afc7146146ad84ef079b`
- `provenance/data/tier-b-hotpot-300-judged.jsonl`: source `f78c01e95b6f2f9bf6c4a256a3efa96be0bb63052e9908dfa73529819131b216`, migrated `f78c01e95b6f2f9bf6c4a256a3efa96be0bb63052e9908dfa73529819131b216`
- `provenance/data/abstentionbench-items.jsonl`: source `fba17017bc1e6a1b8fa38925830cc174b380b499dad06331f30c157470bd9fd1`, migrated `fba17017bc1e6a1b8fa38925830cc174b380b499dad06331f30c157470bd9fd1`
- `provenance/data/abstentionbench-arms.jsonl`: source `1fc21af0b708232fb3476e9e00195cf077b9bb27f3d41e291d68d5da39ea0af5`, migrated `1fc21af0b708232fb3476e9e00195cf077b9bb27f3d41e291d68d5da39ea0af5`
- `provenance/data/abstentionbench-items-musique.jsonl`: source `fdc030264a9004f47f37dee976252a4629e089685335b2179a8e8f622cdfb5de`, migrated `fdc030264a9004f47f37dee976252a4629e089685335b2179a8e8f622cdfb5de`
- `provenance/data/abstentionbench-arms-musique.jsonl`: source `98ec83dc4c509ce332ba0489c6071a2514cfb8da2c99a0f745940b3a47faaad7`, migrated `98ec83dc4c509ce332ba0489c6071a2514cfb8da2c99a0f745940b3a47faaad7`
- `provenance/data/abstentionbench-judged.jsonl`: source `482f394da3ec42d9a9a858253e71824515684ad0bca806839e6dc8271e2d1988`, migrated `482f394da3ec42d9a9a858253e71824515684ad0bca806839e6dc8271e2d1988`
- `provenance/data/abstentionbench-judged-blind.jsonl`: source `63dea9f8a46a50bd8c092fce48400e2f164cb492f2eeb11d711faaf731816d75`, migrated `63dea9f8a46a50bd8c092fce48400e2f164cb492f2eeb11d711faaf731816d75`
- `provenance/data/abstentionbench-judged-musique.jsonl`: source `f07e1877c6c331d05b2529b26f9497a83ca43df48ba9dc1aa535b3c9ff5584b3`, migrated `f07e1877c6c331d05b2529b26f9497a83ca43df48ba9dc1aa535b3c9ff5584b3`
- `provenance/data/abstentionbench-judged-musique-blind.jsonl`: source `a0ee5a85aaa6116db42603462d3143c1f1db2b5f196b4252929fd8a4cbcd874c`, migrated `a0ee5a85aaa6116db42603462d3143c1f1db2b5f196b4252929fd8a4cbcd874c`
- `provenance/data/squad54-audit.tsv`: source `126cc1291ccbe5f9e9bab6c810abdce8f3bb7dfd15e0ff21749135509ca37b0f`, migrated `126cc1291ccbe5f9e9bab6c810abdce8f3bb7dfd15e0ff21749135509ca37b0f`
- `provenance/tools/citation-audit.mjs`: source `b86c8a94493566e58426371d23fc08f0c176b7a964ebbe5609595662d05d1e3d`, migrated `1439eee1a54e26dfd6aede0ab689e754b6660a4a069ba115305eebe5e2c20066`
- `provenance/tools/citation-minimality.mjs`: source `fc8bb4a6e02be2db12534840805c2ceebd98481164978b265782f99ec01c615e`, migrated `9f8d79b5dc66f31296d5853adda50c1cadc39c4b7f1da62d92e8843abfa9e8b4`
- `provenance/sources/RESULTS-extract.md`: source `674384ca6908b57c9a8bb7fbbcdc0a5384392c25a3fade9ce12ae0f94f7b8bd9`, migrated `aa4fa088c9ee9c387184545a6bf1ee9de65cc299d6fb21a7d70e90b071112f5b`
- `provenance/sources/STATUS-extract.md`: source `93dc66172883e53a3bdb85ae952ffadc4bf29112d34ad4680ba25bbd2876f5a1`, migrated `ecaba847e2a59bc5d3ac61b478e113e52b8b2d55c83c966322c6617fd733aed0`
- `provenance/sources/BENCHMARKS-extract.md`: source `58a7a8b4253b418bddea85470031f7a919ef15152cd759ac9c5ce40a2232bcbe`, migrated `6f623b685832d37af4641d1025795fb435eaeb890dd485c283d9c48c88908666`
- `provenance/sources/CLAIMS-extract.md`: source `8dd089b7746f3ef9f9be758fe2bd0712a898176963d85dcd8a51873909b544f5`, migrated `181f58ce3bf93b867798b733a1453ba831e67b56f88657d8021b1a4a5c839226`
- `provenance/sources/LEDGER-extract.md`: source `b085fe49d255a071ff54f8cf878516df174589c3790c5ec661a7fe8aeec1378b`, migrated `f2b527b643d7b60e343d05b2436e6b21fa71cdb7d3d2f9219f07495aff6a6e8d`
