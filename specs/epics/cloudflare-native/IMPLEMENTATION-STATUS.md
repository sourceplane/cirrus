# cloudflare-native — implementation status

Updated on every merged milestone PR.

| Milestone | Status | PR | Notes |
|---|---|---|---|
| CN0 — Genesis | In progress | — | Fork, rebrand, epic, pre-bootstrap CI |
| CN1 — Dialect core | Not started | — | |
| CN2 — Schema | Not started | — | |
| CN3 — Repositories | Not started | — | |
| CN4 — Bindings | Not started | — | |
| CN5 — Provisioning | Not started | — | |
| CN6 — Bootstrap | Not started | — | |

## Baseline inventory (what the port has to move)

Measured on the genesis tree, so progress is against a known denominator.

| Surface | Count |
|---|---|
| Migrations | 20 files, 2,028 lines of Postgres DDL |
| Bounded contexts (schemas → prefixes) | 12 |
| Repositories | 11 files, 5,880 lines |
| `$N` placeholders | ~725 |
| Schema-qualified table references | ~200 |
| `ON CONFLICT` clauses | 36 |
| `RETURNING` clauses | 77 |
| `now()` in queries | 82 |
| `executor.transaction` call sites | ~15 |
| Workers bound to `PLATFORM_DB` | 13 |
| `tests/db` assertions | 578 (552 before CN0 restored the silently-skipped integrations suite) |
