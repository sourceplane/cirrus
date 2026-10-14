# Proof set — five open-source Vercel projects

These five repositories are the skill's acceptance suite. They were chosen to
span every archetype and difficulty band, and between them they exercise
every Vercel feature class in [feature-map.md](feature-map.md) except Vercel
Queues (`elie222/inbox-zero` is the alternate for that). Scores come from
`scripts/inventory.mjs` run on shallow clones taken 2026-10-07.

| # | Repo | ★ | License | Archetype | Score | Exercises | Status |
|---|---|---|---|---|---|---|---|
| 1 | [vercel/platforms](https://github.com/vercel/platforms) | ~6.7k | none in tree | A2 kv-backed | 2 | Upstash→KV, wildcard-subdomain middleware, Next 16 `proxy.ts`, `revalidatePath`→OpenNext KV/DO cache, analytics removal | **Proven** |
| 2 | [vercel/commerce](https://github.com/vercel/commerce) | ~14.3k | MIT | A1 stateless | 2 | `'use cache'`/`cacheTag`/`revalidateTag` via webhook, PPR, `next/image` (Shopify CDN), `next/og`, canary pin | Path below |
| 3 | [nextjs/saas-starter](https://github.com/nextjs/saas-starter) | ~16.2k | MIT | B sql-backed | 3 | Drizzle pg→sqlite, D1 + `db-migrate`, Stripe (fetch client + async webhooks), JWT cookie middleware, runtime secrets | Path below |
| 4 | [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) | ~21k | Apache-2.0 | B sql-backed | 4 | Blob→R2, Redis→DO/KV, `@vercel/functions` geo/ip/waitUntil, `maxDuration` streaming, Auth.js, AI Gateway, BotID, OTel, uuid/json on D1 | Path below |
| 5 | [dubinc/dub](https://github.com/dubinc/dub) | ~24.9k | AGPL-3.0 + `ee/` | B sql-backed (monorepo) | 5 | 25 crons → cron worker, Edge Config→KV, QStash/Workflow→Queues/Workflows, Prisma **MySQL**→D1 (87 models, interactive tx), `after`, edge runtime, strangler phasing | Phase plan below |

The Supabase archetype (C) is covered by `vercel/nextjs-subscription-payments`
(~7.7k★, MIT, **archived**, score 3: enums, jsonb, RLS, a plpgsql trigger).
It is a sixth fixture rather than a headline proof because it is archived on
Next 14, which is below the adapter's peer range.

---

## 1. vercel/platforms — PROVEN

Migrated end-to-end; the result is in [examples/platforms/](examples/platforms/).

**Changes.**
- The app moved to `apps/web` with `git mv`, inside a pnpm + turbo workspace,
  plus `intent.yaml` and `kiox.yaml`; `ci.yml` and `tooling/wire/render.mjs`
  were copied from Cirrus.
- `@upstash/redis` → `lib/kv.ts` on the `TENANTS` KV binding: `keys` + `mget`
  became a paginated `list({ prefix })`.
- `@vercel/analytics` and `@vercel/speed-insights` were deleted, along with
  the `*.vercel.app` preview-host branch in the proxy.
- `proxy.ts` → `middleware.ts` (edge). Node-runtime proxy failed the OpenNext
  bundle.
- `/admin` was made `force-dynamic`. Upstream prerendered it at build by
  reading Redis during `next build`, which is impossible with bindings.
- `open-next.config.ts` uses `kvIncrementalCache` + `doShardedTagCache` +
  `doQueue`, because `revalidatePath` is used.
- Next was pinned to 16.3.8 with `@opennextjs/cloudflare` 1.20.9.
- `infra/terraform/cloudflare-kv` is the Cirrus KV root with two namespaces,
  adoption blocks, and a `wiring` output.
- The web component is **`cloudflare-worker-turbo`** with wiring parameters.
  The assets type's schema rejects them.

**Evidence (each rung run, not inferred).**

| Rung | Result |
|---|---|
| Residue gate | upstream: ✗ 6 violations; migrated: ✓ |
| `tsc --noEmit` | ✓ |
| `next build` + `opennextjs-cloudflare build` | ✓ (after the two fixes above, each a real failure first) |
| fixture render + `wrangler deploy --dry-run --env stage/prod` | ✓ both. Bindings: TENANTS, NEXT_INC_CACHE_KV, 2 DOs, WORKER_SELF_REFERENCE, ASSETS; 1.28 MB gzip |
| `wrangler dev` on workerd | ✓ `/` 200 · `acme.localhost` renders tenant 🚀 from KV · `/admin` lists it · unknown tenant 404 · `/admin` on a tenant host 307 |
| `orun validate` | ✓ (note: it passed even with the invalid assets-type parameters) |
| `orun plan` | first ✗ (`additionalProperties … wranglerTemplate not allowed`), ✓ after G3 retype; DAG kv.stage → web.stage → web.prod |
| `orun run --dry-run --runner github-actions` | ✓ 5 jobs |
| `orun run --job web.dev.verify-deploy` (local) | secrets resolved via `ORUN_SECRET_WIRING_CLOUDFLARE_KV`; stopped at `actions/setup-node` download (sandbox GitHub egress), so the lane's steps were run by hand above |
| Server-action write path, DO revalidation, live deploy | **not run**: no Cloudflare account in the sandbox, and DOs do not run under local `wrangler dev` |

**Bonus finding.** Next 16.4.0 is inside the adapter's peer range, but at
runtime it fails with `Unexpected loadManifest(/.next/server/preview-props.json)`.
So pin the *tested* pair, not just any version the range allows.

## 2. vercel/commerce — path

1. **G0.** `next@15.6.0-canary.60` → pin a stable release ≥15.5.27 the adapter
   supports. `experimental.useCache`/`ppr` are canary-only: if the stable pin
   drops them, rewrite `'use cache'` + `cacheTag/cacheLife` in
   `lib/shopify/index.ts` to `unstable_cache(fn, keys, { tags, revalidate })`
   and record the downgrade (D1 in `decisions.md`).
2. **G4.** `r2IncrementalCache` wrapped in `withRegionalCache`, plus
   `doShardedTagCache` + `doQueue`; add an `infra/terraform/cloudflare-r2` root
   with an `adopt.tf`. The Shopify webhook → `app/api/revalidate` →
   `revalidateTag` path is the acceptance test: update a product in Shopify,
   and the PDP must change without a redeploy.
3. **VC-IMAGE.** Cloudflare Images binding (`images.binding: IMAGES`) with the
   existing `remotePatterns` for `cdn.shopify.com`, or `unoptimized` plus
   Shopify's own CDN transforms (`?width=`).
4. **VC-ENVVARS.** `process.env.VERCEL_PROJECT_PRODUCTION_URL` in
   `lib/utils.ts` → a per-env `SITE_URL` var.
5. Component: `cloudflare-worker-turbo` (it binds R2/DO). `SHOPIFY_*` tokens →
   `optionalSecretEnv` + `runtimeSecrets`.

## 3. nextjs/saas-starter — path

1. **G0.** Pin the canary (`15.6.0-canary.59`) to a supported stable; remove
   `experimental.ppr`/`clientSegmentCache` if the stable pin rejects them.
2. **Schema.** `lib/db/schema.ts` `pgTable` → `sqliteTable`: `serial` →
   `integer().primaryKey({ autoIncrement: true })`; `timestamp().defaultNow()`
   → ISO text with `$defaultFn`; `varchar` → `text`. There are no enums, jsonb,
   or arrays (the inventory found no D1 blockers).
3. **Driver.** `lib/db/drizzle.ts`: `postgres(POSTGRES_URL)` →
   `drizzle(cf().DB, { schema })` per request. Delete the `dotenv` import and
   `lib/db/setup.ts` (it shells out to Docker or Postgres).
4. **Migrations.** `drizzle-kit generate --dialect sqlite` →
   `packages/db/src/migrations/010_core/up.sql`; manifest + Cirrus runner +
   `infra/db-migrate` + `infra/terraform/cloudflare-d1`. `seed.ts` becomes a
   stage-only migration or a one-off `wrangler d1 execute`.
5. **Stripe.** `lib/payments/stripe.ts` → `createFetchHttpClient`; the webhook
   route → `constructEventAsync` + `createSubtleCryptoProvider` on `req.text()`.
6. **Auth.** `jose` + `bcryptjs` already run on workerd. `AUTH_SECRET`,
   `STRIPE_*` → runtime secrets; `BASE_URL` → a per-env var.
7. **Acceptance:** sign up, create a team, invite a member, then Stripe test
   checkout → webhook → `teams.subscriptionStatus` is updated in D1.

## 4. vercel/ai-chatbot — path (two PRs)

**PR 1: runtime.**
- G0: 16.2.10 → 16.3.8, and `proxy.ts` → `middleware.ts`.
- `@vercel/functions`: `geolocation(request)` → `getCloudflareContext().cf`,
  and `ipAddress` → `cf-connecting-ip`; replace the `Geo` type locally.
- Delete `maxDuration`. Streaming works on Workers; set `limits.cpu_ms` if
  the tool calls are CPU-heavy.
- Delete `@vercel/otel` (enable `observability`) and `@vercel/analytics`.
  Replace BotID with Turnstile, or remove it and record the decision.
- AI Gateway → the direct provider SDK or Cloudflare AI Gateway. The model
  key becomes a runtime secret.

**PR 2: data.**
- Drizzle schema: 14 `uuid().defaultRandom()` → `text().$defaultFn(crypto.randomUUID)`;
  `json()` → `text({ mode: "json" })`; `boolean` → `integer({ mode: "boolean" })`;
  `timestamp` → ISO text.
- `@vercel/blob` `put` in `api/files/upload` → R2 `UPLOADS.put`, plus a
  `GET /api/files/[key]` reader, or an R2 public custom domain.
- `redis` (resumable streams and rate limit) → the Rate Limiting binding for
  `lib/ratelimit.ts`. For resumable streams, use a Durable Object keyed by
  stream id, or disable them via the existing `REDIS_URL`-absent path and
  record that.
- Auth.js: `bcrypt-ts` is fine. Users and sessions go through Drizzle on D1;
  guest users unchanged.
- Acceptance: guest chat, a file upload round-trip, reloading mid-stream
  (resume behaviour as decided), and the rate limit triggering.

## 5. dubinc/dub — phase plan (score 5: stop and propose)

The skill must **not** attempt a single PR here; Step 2 routes it to
[migration-phases.md](migration-phases.md). dub is already a pnpm + turbo
monorepo, so P1 only adds `intent.yaml`, `kiox.yaml`, and the per-app
`component.yaml` files, which makes it the cleanest test of a strangler
migration.

| Phase | dub specifics |
|---|---|
| P0 | G0: `apps/web` next 15.5.8 → ≥15.5.27. G1: there is no Cloudflare MySQL. Either convert PlanetScale MySQL → D1 (87 models, 55 enums → TEXT+CHECK, 19 arrays → JSON, 3 `FULLTEXT` → FTS5, `$transaction` in ~82 files → G2 rewrites), or record a time-boxed Hyperdrive exception (Hyperdrive also fronts MySQL). |
| P1 | `apps/web` as `cloudflare-worker-turbo`; strip the 8 `runtime = "edge"` exports; `@vercel/og` → `next/og`. |
| P2 | `cloudflare-kv` (Edge Config, Upstash cache), `cloudflare-r2` (logos, OG assets), `cloudflare-d1`, and a Queues terraform root. |
| P3 | A store interface per service: Edge Config reads in middleware → KV; Upstash Redis → KV/DO; Tinybird analytics stays an external SaaS (record it). |
| P4 | 25 `vercel.json` crons → `apps/cron` worker (route map + `CRON_SECRET`). Crons with `maxDuration: 600` → Queues consumers. QStash/`@upstash/workflow` → Cloudflare Queues/Workflows. `waitUntil` (≈185 files) → `ctx.waitUntil` via one codemod on the import. |
| P5 | Data move (MySQL → D1 transform), then link-redirect traffic cutover per domain. |
| P6 | Delete `vercel.json` and the Vercel projects; the gate runs with zero waivers. |

Acceptance for the skill on dub is that it **produces this plan and refuses a
big-bang PR**, and that the P1 PR is green under `orun plan` with every
remaining coupling waived in `decisions.md`.
