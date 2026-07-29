# cloudflare-native — implementation plan (CN0–CN6)

One PR per milestone. Each merges with the workspace type-checking, linting,
and the `@saas/db-tests` suite green. Read `design.md` first — it is the
contract these milestones implement.

---

## CN0 — Genesis

**Scope.** Fork `sourceplane/lumen` @ `e1fbee6` into `sourceplane/cirrus`,
rebrand, and make the repo workable before any platform bootstrap exists.

- Genesis commit is the verbatim tracked tree, so every later diff is the
  transformation and nothing else.
- `tooling/rebrand/rebrand.mjs` applied: `cirrus` / `Cirrus` / `cirrus.app`.
- `intent.yaml` workspace set to an unresolvable placeholder — inheriting the
  baseline's workspace id would make Cirrus CI claim another tenant's
  workspace. Failing loudly is the safe direction.
- **`verify.yml`**: a plain GitHub Actions workflow running install →
  typecheck → lint → test → build. The orun-driven `ci.yml` needs a linked
  workspace and connected integrations; until then it is gated behind the
  `ORUN_CI` repository variable so PR checks are meaningful from commit one.
- Fix the inherited `tests/db` tsconfig gap that silently skipped the
  integrations suite (missing `paths` entries → `TS2307`).
- This epic's four documents.

**Done when.** `verify.yml` is green on a PR into `main`, and no file outside
`FORKING.md` and the provenance note mentions the baseline's brand.

---

## CN1 — Dialect core

**Scope.** `packages/db/src/d1/` and `packages/db/src/sql/`.

- `createD1Executor(db: D1Database)` implementing `SqlExecutor`, mapping
  `.all()` results onto `{ rows, rowCount }`. `rowCount` is `meta.changes` for
  writes without `RETURNING`, `results.length` otherwise — the distinction the
  repositories' `rowCount === 0` conflict checks depend on.
- `atomic()` over `D1Database.batch()` (design.md §1, §6) with a
  `StatementQueue` that records `(sql, params)` pairs.
- `@saas/db/sql`: `nowIso()`, `parseJson()`, `toBool()`, `toNumber()`,
  `isUniqueViolation()`, `isForeignKeyViolation()`, `constraintTarget()`.
- A `FakeD1Database` in `@saas/testing` so worker tests can exercise the
  binding shape without Miniflare.
- `postgres` and `pg` leave `packages/db`'s dependencies. The Hyperdrive
  adapter and executor are deleted in CN4, when the last import goes.

**Done when.** New unit tests cover the executor, the queue, and every helper,
including the D1 error-string shapes; the existing 552 assertions still pass.

---

## CN2 — Schema

**Scope.** `packages/db/src/migrations/**`, `manifest.ts`, `runner/`.

- All twenty migrations rewritten as SQLite DDL per design.md §2–§3:
  flattened `context_table` names, ISO-text timestamps, `INTEGER` booleans and
  money, JSON as `TEXT`, `COMMENT ON` prose demoted to `--` comments, every
  index and CHECK preserved.
- `manifest.ts` regenerated with fresh sha256 checksums.
- `D1ApiAdapter` (REST `query` endpoint) added to the runner; the Supabase
  Management-API and `pg` adapters deleted. `plan`/`apply` semantics unchanged.
- A migration lint asserting the naming rule and rejecting Postgres-only
  keywords, wired into `pnpm lint`.
- Because this schema has no deployed instance yet, the migrations are
  **rewritten in place** rather than layered as `200_*` fixups. A baseline
  should ship the schema it means, not a fossil record of its port.

**Done when.** The lint passes, migration tests assert the flattened names and
the checksums match, and `wrangler d1 execute --local --file` applies the whole
manifest to an empty database without error.

---

## CN3 — Repositories

**Scope.** All eleven `packages/db/src/*/repository.ts` (~5,900 lines) and the
`tests/db` suites.

Ported context by context, smallest first, so the pattern is proven before it
is applied at scale: `support` → `projects` → `notifications` → `config` →
`events` → `metering` → `identity` → `billing` → `webhooks` → `membership` →
`integrations`.

Per context: `$N` → `?N`, schema-qualified names → flattened, `now()` →
bound parameters, upserts to `excluded`, `row_to_json` → `json_object`,
mappers through `parseJson`/`toBool`/`toNumber`, error classification through
`@saas/db/sql`.

**Done when.** Every `tests/db` suite passes against the ported SQL, with the
assertions updated to the new dialect (they assert SQL text, so they are the
ratchet); no `packages/db/src/*/repository.ts` contains `$1`, a `.`-qualified
table name, or `now()`.

---

## CN4 — Bindings

**Scope.** Thirteen workers.

- `env.PLATFORM_DB: D1Database` replaces `Hyperdrive`; `wrangler.template.jsonc`
  gains a `d1_databases` block and loses `hyperdrive`.
- Every `createSqlExecutor(env.PLATFORM_DB)` becomes `createD1Executor`, and
  every `executor.transaction(...)` call site moves to one of design.md §6's
  three patterns — the ~15 sites are the real work here, not the binding swap.
- `component.yaml`: `WIRING_CLOUDFLARE_HYPERDRIVE` → `WIRING_CLOUDFLARE_D1`,
  `dependsOn: cloudflare-hyperdrive` → `cloudflare-d1`, fixtures updated.
- `packages/db/src/hyperdrive/` deleted; `postgres` leaves the lockfile.
- Health handlers report the D1 binding instead of a connection string.

**Done when.** No `Hyperdrive`, `connectionString`, or `postgres` import
remains outside history; every worker type-checks and `wrangler deploy
--dry-run` succeeds for each.

---

## CN5 — Provisioning

**Scope.** `infra/`.

- `infra/terraform/cloudflare-d1`: one `cloudflare_d1_database` per
  environment, following the established `adopt.tf` pattern — a `data
  "external"` lookup that short-circuits when the address is already in
  platform state and otherwise imports the existing database by name, so a
  re-run on a live account converges instead of colliding.
- Outputs `database_id` and `database_name`, lease-published as
  `WIRING_CLOUDFLARE_D1` on the project/env rung (SEC-JOB), exactly as
  `cloudflare-kv` already does.
- `infra/terraform/supabase` and `infra/terraform/cloudflare-hyperdrive`
  deleted.
- `infra/db-migrate` retargeted: `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` + `WIRING_CLOUDFLARE_D1` in, all four
  `SUPABASE_*` keys out. The token template needs **D1 Write**.

**Done when.** `orun validate` passes, no component references Supabase or
Hyperdrive, and the D1 root plans cleanly against a real account.

---

## CN6 — Bootstrap

**Scope.** `flows/`, `repo-blueprint.yaml`, `BOOTSTRAP.md`, `FORKING.md`,
`README.md`, `specs/core/`.

- Preflight polls **two** integrations (GitHub, Cloudflare) instead of three;
  the Supabase reconnect gate, org-id fact, and region input disappear.
- `flows/phases/03-infrastructure` provisions KV + D1.
- `repo-blueprint.yaml` drops `supabaseRegion` and the Supabase operator
  checklist items.
- `specs/core/access-and-infra.md` and `domain-model.md` describe the D1
  topology; the sizing rule from README.md §"What we give up" is written down
  as guidance, including the per-tenant-database escape hatch.
- A `docs/data-model.md` mapping each bounded context to its tables, which is
  the thing a fork actually reads first.

**Done when.** A reader can go from an empty Cloudflare account to a deployed
Cirrus with no step mentioning a second vendor.

---

## Sequencing note

CN1 → CN2 → CN3 → CN4 is a hard chain: the interface, then the schema, then
the queries, then the bindings. CN5 is independent of CN1–CN4 and could land
in parallel; it is sequenced last-but-one only so that a half-migrated tree is
never pointed at real infrastructure. CN6 is documentation and flow work that
depends on CN5's component names being final.
