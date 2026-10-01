# 02-foundation — the shared packages

**Lands:** `packages/{contracts,db,shared,testing,cli}` and their suites
`tests/{db,cli}`.

Nothing deploys in this phase. It is what every later phase is built out of:
the Zod contracts the API and the site share, the D1 executor seam and the
repositories, the id/crypto helpers, the test harness, and the owner CLI.

## Why `packages/db` is here and not with the infrastructure

`packages/db` is the *seam*, not the database: the executor that translates
the repositories' numbered `$n` placeholders into D1's positional binds and
matches SQLite's constraint-failure messages. It has no provider dependency
and its suite runs against a real SQLite engine through `node:sqlite`, so it
belongs with the packages that build offline. The database itself is
`03-infrastructure`.

## Verified by

Every package's verify lane green on main. The convergence watch is the gate;
there is no probe, because there is nothing live yet.
