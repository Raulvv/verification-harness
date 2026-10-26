# Confluence fixtures — probe dumps of 2026-09-28

Provenance: the bounded probe of a real Confluence space (hypothesis
[`2026-09-25_system-3.0-any-source.md`](../../../../docs/hypotheses/2026-09-25_system-3.0-any-source.md)
§3.1) against `twg` v1.3.3. Per the testing doctrine (epic
[`retrieval-confluence-source.md`](../../../../archive/epicas/retrieval-confluence-source.md)
§8.4): **envelope shapes and metadata values are verbatim dumps;
free-text prose is redacted.** Nothing here is hand-invented. Before
publication the two identifying query strings were sanitized: the space
key became `DEMO` and the CQL title term became `Fixture topic`
(including their URL-encoded forms in `next`/`self` links); everything
else stands as dumped.

| file | dumped by | notes |
|---|---|---|
| `content-list.p1.json` | `twg confluence content list --space DEMO --content-type page --limit 5 -o json` | 5 results; titles redacted to `Fixture Page One..Five`; ids, `spaceId`, `snapshotToken`, `nextCursor` verbatim |
| `content-list.p2.json` | — | **boundary case, not a dump**: a last page in the same envelope shape (`results: []`, no `nextCursor`). The probe never captured a real last page (conduct rule: no extra queries) |
| `page-get.md.json` | `twg confluence content get <id> --detail full --format md --include-metadata -o json --output-summary none` | full envelope; `lossyConversion`/`lostFeatures` verbatim (the declared md loss is part of the contract); `body.value` prose redacted to neutral markdown with the same structure; `authorId` zeroed |
| `page-get.html.json` | derived from `page-get.md.json` + `page-body.html` | **the named assumption materialized** (below): same dumped envelope, `body` swapped to `{format: "html", value: <page-body.html>}` |
| `page-body.html` | `twg confluence content get <id> --detail full --format html --body-only` | tags/attributes verbatim (`data-type="panel-success"`, `data-local-id`), text nodes redacted |
| `versions.json` | `twg confluence content versions list --id <id> --limit 3 -o json --output-summary none` | numbers/`createdAt`/`minorEdit`/`message` verbatim; `authorId` zeroed |
| `search.json` | `twg confluence search query --cql 'space = DEMO AND type = page AND title ~ "Fixture topic"' --limit 10 -o json` (full envelope) | 2 of 14 results kept (array length is not shape); titles/excerpts/URL slugs redacted; `lastModified`, `friendlyLastModified`, `nextCursor`, `totalSize` verbatim; `request.cql`/`data.cqlQuery` kept — **our** query, not their content |
| `search-page2.json` | derived from `search.json` | **boundary case, not a dump**: a search last page in the same envelope shape (`results: []`, no `nextCursor`); same caveat as `content-list.p2.json` |

**Redacted values**: page/result titles → `Fixture …`; body prose →
neutral sentences; `authorId` → `000000000000000000000000` (shape kept);
real hostname → `fixture.atlassian.net`; space key → `DEMO`; CQL title
term → `Fixture topic`. **Kept verbatim**: numeric
ids, `spaceId`, `snapshotToken`, all ISO dates, cursors,
`lossyConversion`/`lostFeatures`, envelope keys and nesting.

**Named assumption** (epic §6): the non-`--body-only` **html** envelope
was never dumped (the probe used `--body-only`); parsers must treat
`data.body.value` as an opaque string and not assume `body.format`'s
surrounding keys beyond the dumped md case. Verify at Iteration 3's
spot-check before asserting on it.
