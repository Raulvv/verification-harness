# Legal verification

Two legal artifacts live here:

1. **Synthetic playbook demo** — a small contract and playbook for the
   EPIC-FORMAL-003 proof of concept. It is not legal advice and contains no
   client data.
2. **CUAD clause-presence pilot** — a public-benchmark adapter over 510 real
   commercial contracts and 41 expert-labeled clause categories. See
   [`CUAD-PILOT.md`](CUAD-PILOT.md) and [`cuad/README.md`](cuad/README.md).

The synthetic demo:

```bash
cd bench/formal
.venv/bin/python -m formal.legal \
  --contract legal/contract.md \
  --playbook legal/playbook.json
```

Each rule returns:

- `ENTAILED` — the clause satisfies the rule
- `CONTRADICTION` — the clause violates the rule
- `INCOMPLETE` — the fact is missing or ambiguous
- `NEEDS_SPECIFICATION` — the rule is not closed
- `NOT_FOUND_IN_CORPUS` — the required clause/document is absent from a declared
  corpus, with a coverage receipt

The demo uses deterministic extraction for six fields: governing law, liability
cap months, notice days, renewal months, data protection presence, and assignment
consent. The real legal pilot replaces this with a measured legal extractor and
an expert-reviewed playbook.
