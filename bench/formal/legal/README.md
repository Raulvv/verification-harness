# Legal playbook demo (synthetic)

This is a **synthetic** contract and playbook for the EPIC-FORMAL-003 proof of
concept. It is not legal advice and contains no client data.

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
