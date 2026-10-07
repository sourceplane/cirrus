---
name: vercel-to-orun
description: Convert a Vercel-hosted project (Next.js on Vercel, optionally with Vercel KV/Blob/Postgres/Edge Config/crons, Supabase, Prisma or Drizzle) into an Orun component-native, Cloudflare-only desired-state repo shaped like sourceplane/cirrus — Workers + Static Assets via OpenNext, D1, KV, R2, Terraform components, db-migrate, and CI that only runs `orun plan` / `orun run`. Use when asked to migrate, port, re-platform, or "move off Vercel" a repo onto Orun / Cloudflare, to assess how hard such a migration is, or to plan one.
---

# Vercel → Orun platform-discipline migration

You are converting a repository that deploys to Vercel into a repository that
obeys the Orun golden path used by `sourceplane/cirrus`:

- **Desired state, not scripts.** `intent.yaml` is the control plane; every
  deployable unit is a `component.yaml`; behaviour comes from typed
  compositions (`oci://ghcr.io/sourceplane/stack-tectonic`); CI only runs
  `orun plan` and `orun run`.
- **Cloudflare is the only provider.** Workers (+ Static Assets) for compute,
  D1 for SQL, KV for key/value, R2 for objects, Cron Triggers for schedules.
  A second provider is an *exception* that must be recorded, never a default.
- **No resource IDs or secrets in git.** Wrangler configs are rendered from a
  committed `wrangler.template.jsonc` with `@@wiring(<component>/<env>:<key>)@@`
  tokens; secrets are `secret://…` references resolved by orun per run.

The work is a pipeline with hard gates. Do the steps in order and do not skip
a gate because the next step "looks obvious".

---

## Step 0 — Ground yourself (read, don't guess)

1. Read the target repo's `README`, root `package.json`, `vercel.json`,
   `next.config.*`, `.env.example`, and its schema/migrations directory.
2. If a Cirrus checkout is available, read `specs/core/orun-golden-path.md`,
   `intent.yaml`, and one component of each type you will create
   (`apps/web-console-next/component.yaml`, `apps/billing-worker/component.yaml`,
   `infra/terraform/cloudflare-d1/component.yaml`, `infra/db-migrate/component.yaml`).
3. **Read the composition schemas you will target.** They are not vendored:
   ```bash
   orun compositions <type>      # e.g. cloudflare-worker-turbo (no --long in orun ≥2.75)
   ls ~/.orun/cache/compositions/*/compositions/<type>/   # schema.yaml, jobs/, profiles/
   ```
   A parameter not in the schema does not exist (`additionalProperties: false`).
   Never invent one. Gate G3 says what to do when you need one that is missing.
4. Start from the proven worked example,
   [references/examples/platforms/](references/examples/platforms/), and the
   per-repo paths in [references/proof-set.md](references/proof-set.md).

## Step 1 — Inventory (deterministic)

Run the scanner. It reads the target as data and never executes it:

```bash
node <skill-dir>/scripts/inventory.mjs <target-repo>            # markdown
node <skill-dir>/scripts/inventory.mjs <target-repo> --json --out inventory.json
```

It emits: archetype, difficulty (1–5), version warnings, and findings keyed
by rule id (`VC-*`). **Every `VC-*` id has exactly one row in
[references/feature-map.md](references/feature-map.md)** — that row is the
replacement. Commit the markdown report as `docs/migration/inventory.md` in the
migrated repo; it is the baseline the residue gate (Step 7) diffs against.

After editing the scanner, run `node <skill-dir>/scripts/selftest.mjs` (21
fixture checks). Then confirm by hand what regex cannot see: where each finding is *used*
(`grep -rn` the evidence paths), and any provider called over plain `fetch`.

## Step 2 — Classify and size

| Archetype | Means | Data plane you will build |
|---|---|---|
| `A1:stateless` | No server-side store (headless CMS / commerce API) | none, or R2 + D1 only for the OpenNext cache |
| `A2:kv-backed` | Redis / Upstash / Edge Config only | `cloudflare-kv` |
| `B:sql-backed` | Postgres/MySQL via Prisma, Drizzle, Kysely, raw driver | `cloudflare-d1` + `db-migrate` (+ KV/R2 as found) |
| `C:supabase-backed` | Supabase DB + Auth (+ RLS, triggers) | Gate G1 decides |

| Score | Delivery shape |
|---|---|
| 1–2 | One PR: scaffold + port + infra. |
| 3 | Two PRs: (1) scaffold + OpenNext build green with stores stubbed behind fixtures, (2) data plane + cutover. |
| 4 | Phased per [references/migration-phases.md](references/migration-phases.md); each phase is a green PR. |
| 5 | **Stop and propose.** Write the phase plan and the exception list; do not start a big-bang port. Large monorepos (dub, cal.com, documenso) migrate app-by-app. |

## Step 3 — Decision gates (write each decision into `docs/migration/decisions.md`)

- **G0 — Next.js version.** Pin a Next release the adapter is **tested**
  with, not merely one inside its peer range, and land the pin first as its
  own commit. (`@opennextjs/cloudflare` 1.20.9 declares
  `next >=15.5.27 <16 || >=16.3.8`. The proof ran 16.3.8. 16.4.0 is in range,
  builds, and then 500s at runtime.) The scanner flags pre-releases and
  out-of-range versions. Delete every `export const runtime = "edge"`; OpenNext
  on Workers runs the Node runtime.
- **G1 — Supabase / managed Postgres.** Choose and record one:
  - *Replace (default, in discipline):* D1 + explicit tenant predicates in the
    repository layer instead of RLS; triggers/functions become application
    code in the same request; auth → Auth.js or Better Auth on D1.
  - *Exception (Lumen precedent):* keep Postgres behind **Hyperdrive**. Allowed
    only when the inventory reports D1 blockers that cannot be rewritten in
    scope (`plpgsql`, `full-text`, heavy `interactive-tx`, `rls-policies` you
    cannot re-express). Record it in `docs/migration/decisions.md` as a
    second-provider exception with an exit plan.
- **G2 — Interactive transactions.** D1 has no interactive transaction
  (statements run in order, no rollback). For every `$transaction(async …)` /
  `.transaction(async …)` the inventory lists, rewrite to `db.batch([...])`, a
  single statement with `RETURNING`, or an `ON CONFLICT` upsert. If one
  cannot be rewritten, that is a G1 exception, not a silent downgrade.
- **G3 — Composition type.** Verified against stack-tectonic 0.18.1:
  - App binds nothing and holds no secrets → `cloudflare-workers-assets-turbo`
    (the Cirrus console shape).
  - App binds KV/D1/R2/DO or holds secrets → **`cloudflare-worker-turbo`**. The
    assets type's schema rejects `wranglerTemplate`/`wiring*`/`runtimeSecrets`.
    An OpenNext build is a Worker plus an assets dir, and the worker type's
    `wrangler deploy` ships both. Its verify lane renders the fixture *before*
    `buildCommand`, which the OpenNext build needs.
  - Optional, later: a `sourceplane/stack-tectonic` PR adding wiring to the
    assets type. Never smuggle bindings or secrets through `buildCommand`.
- **G4 — Caching.** If `VC-ISR` or `VC-USE-CACHE` fired, the app needs a real
  OpenNext cache (R2 incremental cache + D1 tag cache + DO queue). An empty
  `defineCloudflareConfig({})` silently turns ISR into SSR-every-request and
  `revalidateTag` into a no-op.

## Step 4 — Scaffold the Orun shape

Target tree (create only what the archetype needs):

```text
intent.yaml  kiox.yaml  kiox.lock  package.json  pnpm-workspace.yaml  turbo.json
.github/workflows/ci.yml          # orun plan / orun run only (copy Cirrus ci.yml)
apps/web/                         # the Next app, moved here (git mv — keep history)
  component.yaml  wrangler.template.jsonc  wiring.fixture.json  open-next.config.ts
apps/cron/                        # only if VC-CRON: scheduled worker
apps/api/                         # only if G3 chose the Cirrus split
packages/db/                      # only if B/C: schema, migrations/NNN_name/up.sql, runner
infra/terraform/cloudflare-d1/    # only if B/C or G4
infra/terraform/cloudflare-kv/    # only if A2 or KV findings
infra/terraform/cloudflare-r2/    # only if VC-BLOB or G4
infra/db-migrate/component.yaml   # only if B/C
docs/migration/{inventory.md,decisions.md,runbook.md}
```

Rules:
- Single-package Vercel repos become a pnpm + turbo workspace. Convert
  npm/yarn/bun lockfiles with `pnpm import`, then `pnpm install`.
- `git mv` the app into `apps/web`; do not copy-and-delete.
- Delete `vercel.json` and `.vercel/` only after every key is ported (Step 5).
- Copy templates from [references/templates.md](references/templates.md) and
  fill the placeholders. Keep Cirrus's comment discipline: every non-obvious
  parameter carries a one-line *why*.
- Pin `kiox.yaml`, `ci.yml` `version:`, and the `intent.yaml` stack-tectonic
  tag to what Cirrus pins today; never `:latest`.

## Step 5 — Port, rule by rule

Walk the inventory findings from highest weight down. For each `VC-*` id,
apply its row in [references/feature-map.md](references/feature-map.md) and
tick it in `docs/migration/inventory.md`. For SQL archetypes, follow
[references/postgres-to-d1.md](references/postgres-to-d1.md) for schema,
migrations, and query rewrites.

Rules the proof turned up the hard way. Each one was a real failure first:

- **Bindings are request-time.** A Vercel page that read its store during
  `next build` (static prerender) now fails the build with `getCloudflareContext
  has been called in sync mode`. Make that route dynamic
  (`export const dynamic = "force-dynamic"`). Do not stub the store.
- **`proxy.ts` → `middleware.ts`** (Next 16). Node-runtime proxy breaks the
  OpenNext bundle (`middleware.js.nft.json` ENOENT). Rename the file and the
  `proxy` export.
- **`output: "standalone"` + `outputFileTracingRoot: <repo root>`** in
  `next.config` when the build script runs `next build` itself before
  `opennextjs-cloudflare build --skipNextBuild` (else `pages-manifest.json`
  ENOENT). Call `initOpenNextCloudflareForDev()` so `next dev` sees bindings.
- **DO-backed caches need** `WORKER_SELF_REFERENCE` and a `migrations` entry
  (`new_sqlite_classes: ["DOQueueHandler","DOShardedTagCache"]`) in every env
  of the template.

Bindings are always read through one accessor so code stays testable:

```ts
// apps/web/src/lib/cf.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
export const cf = () => getCloudflareContext().env as CloudflareEnv;
```

Generate `CloudflareEnv` with `wrangler types --env-interface CloudflareEnv`
against the fixture-rendered config; do not hand-write binding types.

## Step 6 — Data move (only when there is production data)

Write `docs/migration/runbook.md` with the exact commands and a rollback for
each store. Patterns: Postgres → `pg_dump --data-only --inserts` → transform
(types per `postgres-to-d1.md`) → `wrangler d1 execute <db> --remote --file`
in ≤ 100 KB chunks; Upstash/Redis → `SCAN` → `wrangler kv bulk put`; Vercel
Blob → list + stream into R2 (S3 API with `aws4fetch` or `rclone`). Freeze
writes (or dual-write) for the cutover window; verify row counts and
checksums before flipping DNS.

## Step 7 — Validation ladder (cheapest first; stop at the first red)

1. **Residue gate:** `node <skill-dir>/scripts/inventory.mjs . --gate` exits
   non-zero while any of these remain: a forbidden coupling, a *tracked*
   wrangler config with literal IDs, a missing `component.yaml`/`intent.yaml`/
   `kiox.yaml`, `vercel.json`, an empty OpenNext cache under ISR, or CI that
   calls wrangler, terraform, or vercel directly. It waives only
   `exception: VC-…` lines in `docs/migration/decisions.md`. (Control: Cirrus
   itself passes.)
2. `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test`
3. `pnpm --filter <web> build` (`next build && opennextjs-cloudflare build`).
4. Render the fixture config (`node tooling/wire/render.mjs --template … --map wiring.fixture.json --out wrangler.jsonc`)
   then `wrangler deploy --dry-run --config wrangler.jsonc --env stage`.
5. Local behaviour: seed local stores (`wrangler kv key put --local …`,
   `wrangler d1 execute --local --file …`), run
   `wrangler dev --config wrangler.jsonc`, and exercise the acceptance
   checks in `proof-set.md` (tenant hosts via `-H "Host: x.localhost:8787"`).
   Durable Objects do not run under local dev: say so rather than claiming
   revalidation works.
6. Orun: `orun validate --intent intent.yaml`, then **`orun plan`**: it is
   the step that validates component parameters against the composition
   schema; `validate` passed an invalid component in the proof. Then
   `orun plan --view dag` and
   `orun run --plan plan.json --dry-run --runner github-actions`. Check that
   the DAG matches `dependsOn`: infra → db-migrate → web → cron, and stage
   before prod. To execute a lane locally, supply secrets as
   `ORUN_SECRET_<LAST_PATH_SEGMENT>` (e.g. `ORUN_SECRET_WIRING_CLOUDFLARE_KV`).
7. PR → verify lanes green → merge → deploy lanes → smoke on stage, then prod.

Report each rung's actual result. A rung you could not run (no credentials,
no kiox) is reported as *not run*, never as passed.

## Step 8 — PR description (golden-path format)

State: which layers changed (intent / component / composition / CI / docs);
component types and profiles added; environments and `dependsOn` edges; the
`kiox -- orun …` commands run and their results; the DAG; the inventory
before/after (score, remaining findings); every G1–G4 decision and exception;
the operator checklist (Cloudflare token with D1 Write, repo allow-listed in
the workspace, runtime secrets to seed with `orun secrets set`).

---

## Never

- Leave `vercel.json`, `@vercel/*` runtime packages, or `VERCEL_*` env reads in
  the migrated tree (`@vercel/og` → `next/og` is a rename, not an exception).
- Call `wrangler`, `terraform`, `pnpm`, or `turbo` from `ci.yml`.
- Commit `wrangler.jsonc` with D1/KV/R2 IDs, or any secret value.
- Keep a second provider (Upstash, Neon, Supabase, PlanetScale) without a
  recorded G1 exception.
- Downgrade a transaction, an RLS policy, or ISR silently — each is a
  decision with a line in `decisions.md`.
- Claim a rung passed that you did not run.
