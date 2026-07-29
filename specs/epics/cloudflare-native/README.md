# Epic: cloudflare-native

**Make the data plane Cloudflare.** Cirrus is the Lumen baseline with Postgres
removed: Cloudflare **D1** becomes the system of record, Hyperdrive and Supabase
are deleted, and the whole product — runtime, data, provisioning, state, CI
credentials — lives inside one Cloudflare account plus a GitHub repo.

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** |
| Cluster | **CN** (CN0–CN6) |
| Baseline | `sourceplane/lumen` @ `e1fbee6` (genesis commit) |
| Owner(s) | `packages/db`, all `apps/*-worker`, `infra/`, `flows/`, `specs/core/` |
| Target branch | `main` |
| End-state target | `curl https://<api-edge>/health` green on stage + prod with **zero** non-Cloudflare infrastructure: no Supabase project, no Hyperdrive config, no AWS account, no external Postgres |

## Thesis

Lumen is already 90% Cloudflare. Twelve bounded-context Workers, an edge API,
a Next.js console on Workers Static Assets, KV for idempotency, Cloudflare
Email Service for delivery, and — since the de-AWS work — Terraform state and
CI secrets on the Orun control plane. One thing is not Cloudflare: **the
database**. Supabase hosts Postgres, Hyperdrive pools it, and every Worker
opens a TCP socket per request through `postgres.js`.

That single dependency is responsible for a disproportionate share of the
baseline's operational cost and complexity:

- **A second vendor** in the bootstrap contract — an OAuth connection, an org
  id, a management-API token, a region choice, and a `random_password` that
  cannot be adopted (first apply rotates the DB password and re-wires every
  consumer).
- **A pooling layer that exists only to hide TCP from Workers.** Hyperdrive is
  a Cloudflare product whose entire job here is to make a non-Cloudflare
  database usable from a Worker.
- **Per-request client construction.** A module-scoped pool is impossible in
  Workers ("Cannot perform I/O on behalf of a different request"), so every
  request pays connection setup, and `nodejs_compat` ships in every bundle.
- **Two provisioning graphs** — `supabase` → `cloudflare-hyperdrive` → every
  worker — where one binding would do.

D1 removes all four. It is a first-party binding: no connection string, no
pool, no `nodejs_compat` for the driver, no second vendor in the bootstrap
contract, and provisioning collapses to one Terraform resource whose id is
wired the same way KV's already is.

## What we give up, deliberately

This is a real trade, and the baseline should be honest about it:

| Postgres affordance | D1 reality | How Cirrus copes |
|---|---|---|
| Interactive transactions (`BEGIN` … app logic … `COMMIT`) | None. `batch()` is atomic but pre-declared | Repositories expose intent-shaped methods; multi-statement units become a single `batch()` or one CTE statement. `SqlExecutor.transaction` is replaced by `atomic(statements)` — see CN1 |
| Schemas (`identity.users`) | Single namespace | Flattened `identity_users`; the bounded-context prefix survives as a naming rule enforced in review and by a migration lint |
| Rich types: `uuid`, `jsonb`, `timestamptz`, `numeric` | `TEXT`/`INTEGER`/`REAL`/`BLOB` | UUID → `TEXT`, JSON → `TEXT` + `json_*` functions, timestamps → **ISO-8601 UTC `TEXT`** (sorts lexicographically, round-trips through `new Date()` unchanged), money → `INTEGER` minor units |
| `now()`, `interval`, `date_trunc` | `strftime`/`datetime`/`julianday` | Portability helpers in `@saas/db/sql`, one place to change |
| Unbounded database size | A per-database storage ceiling ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)) | Documented as the baseline's tenancy ceiling with a per-tenant-database escape hatch (CN6 §"Scaling past one database") |
| Read replicas via connection string | Sessions API / read replication | Out of scope for the baseline; noted as the growth path |

The storage ceiling is the one that decides whether this baseline is right for
a given product. For a control-plane-shaped SaaS — users, orgs, projects, RBAC,
audit, metering rollups, billing mirrors — it is far away. For a product that
stores customer *payloads* in the platform database, it is not, and R2 plus a
pointer column is the answer. CN6 writes this down as a sizing rule rather
than leaving it as folklore.

## Approach

Bottom-up, one reviewable PR per milestone, each merging green:

1. **CN0 — Genesis.** Fork, rebrand, epic, and CI that works before a
   platform workspace exists.
2. **CN1 — Dialect core.** `@saas/db/d1`: a `D1Database`-backed `SqlExecutor`
   behind the *same* interface the eleven repositories already depend on, plus
   the portability helpers. Nothing else changes yet.
3. **CN2 — Schema.** Twenty migrations translated to SQLite DDL; the migration
   runner gains a D1 REST adapter and loses the Supabase and `pg` ones.
4. **CN3 — Repositories.** ~5,900 lines of SQL ported context by context, with
   the existing 552-assertion suite as the ratchet.
5. **CN4 — Bindings.** Thirteen Workers move from `Hyperdrive` to `D1Database`;
   `postgres` leaves the dependency tree.
6. **CN5 — Provisioning.** `infra/terraform/cloudflare-d1` replaces the
   `supabase` and `cloudflare-hyperdrive` components.
7. **CN6 — Bootstrap.** Flows, blueprint, and docs describe a two-integration
   world (GitHub + Cloudflare).

The order is deliberate: the interface (CN1) lands before the schema (CN2)
lands before the queries (CN3) land before the bindings (CN4). Each milestone
leaves the tree type-checking and the suite green, so a bisect through this
epic is meaningful.

## Read order

1. `README.md` (this file) — thesis and trade-offs.
2. `design.md` — the dialect contract: type mapping, naming, atomicity,
   and the row-mapping rules every repository follows.
3. `implementation-plan.md` — CN0–CN6, each with scope and "done when".
4. `risks-and-open-questions.md` — what could still bite.
5. `IMPLEMENTATION-STATUS.md` — live progress, updated per merged PR.
