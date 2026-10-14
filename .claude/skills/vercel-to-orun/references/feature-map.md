# Feature map — one row per inventory rule

Each `VC-*` id emitted by `scripts/inventory.mjs` has exactly one section
here. **Proven** marks a replacement exercised end-to-end in the
`vercel/platforms` proof (built, dry-run deployed, smoke-tested on workerd).
Everything else is the documented pattern: confirm it against the pinned
adapter or wrangler version when you apply it.

Bindings are read through one accessor (`cf()` → `getCloudflareContext().env`),
and binding types come from `wrangler types --env-interface CloudflareEnv`.

> **Rule: bindings are request-time.** On Vercel, a page with no dynamic API
> is prerendered at `next build`, and it can read Redis/Postgres *during the
> build*. On Workers, bindings exist only inside a request. Every route that
> reads a binding must be dynamic (`export const dynamic = "force-dynamic"`,
> or `await connection()`), or use `getCloudflareContext({ async: true })` in
> SSG. **Proven:** `vercel/platforms` `/admin` failed `next build` until it
> was made dynamic.

---

## Vercel platform services

### VC-KV — `@vercel/kv`
→ **Workers KV** (`cloudflare-kv` terraform component, `kv_namespaces` binding).
`kv.get(k)` → `env.X.get(k, "json")`; `kv.set(k, v, { ex })` →
`env.X.put(k, JSON.stringify(v), { expirationTtl })`; `kv.keys(p*)` +
`mget` → `env.X.list({ prefix })`, paginated by cursor, then `get`. KV is
eventually consistent (~60 s across locations) and caps at 1 write/s per key.
Counters, locks, and rate limits go to a **Durable Object** or the Workers
**Rate Limiting** binding, never to KV.

### VC-UPSTASH — `@upstash/*`
Same as VC-KV (**Proven**: `lib/kv.ts` in the platforms example). For
`@upstash/ratelimit`, use the Rate Limiting binding. For `@upstash/qstash` and
`@upstash/workflow`, see VC-QUEUE. Keeping Upstash over REST technically works
on Workers, but it is a second provider: it needs a G1 exception.

### VC-REDIS — `ioredis` / `redis` (TCP)
Node Redis clients do not run on workerd. Replace with KV (cache-like data) or
a Durable Object (ordered, stateful data: resumable streams, presence,
counters). For `vercel/ai-chatbot`'s resumable streams, use a DO per stream
id, or disable the feature (the app already degrades without `REDIS_URL`) and
record that in `decisions.md`.

### VC-BLOB — `@vercel/blob`
→ **R2** (`cloudflare-r2` terraform component, `r2_buckets` binding).
`put(name, body, { access: "public" })` →
`env.BUCKET.put(key, body, { httpMetadata: { contentType } })`, and return a
URL served by an R2 custom domain or a route in the app (`GET /files/[key]` →
`env.BUCKET.get`). Client-direct uploads (`handleUpload`) → presigned S3 URLs
from the R2 S3 API (`aws4fetch`). That needs an R2 access key pair as a
runtime secret.

### VC-PG — `@vercel/postgres` / `@neondatabase/serverless`
→ D1 per [postgres-to-d1.md](postgres-to-d1.md), or Hyperdrive under a G1
exception.

### VC-EDGECONFIG — `@vercel/edge-config`
→ **KV** (read-mostly flags and config). Edge Config is read in middleware
for redirects and maintenance mode; a KV read in middleware is the direct
equivalent. Write the values from a terraform component or an admin route,
never by hand in the dashboard.

### VC-ANALYTICS — `@vercel/analytics`, `@vercel/speed-insights`
Delete the package and its component (**Proven**). Optionally add the
Cloudflare Web Analytics beacon, enabled per zone.

### VC-OG — `@vercel/og` / `next/og`
`next/og` `ImageResponse` is supported by OpenNext. Rename imports from
`@vercel/og` to `next/og`; the gate fails while `@vercel/og` remains. Fonts
are fetched or imported as ArrayBuffer, never read from `fs`.

### VC-FUNCTIONS — `@vercel/functions`
`waitUntil(p)` → `getCloudflareContext().ctx.waitUntil(p)` (or Next's
`after()`); `geolocation(req)` → `getCloudflareContext().cf`
(`country`, `city`, `latitude`, `longitude`); `ipAddress(req)` →
`req.headers.get("cf-connecting-ip")`; `Geo` type → a local type.

### VC-FLAGS — `flags` / `@vercel/flags`
Keep the flags SDK with a custom adapter that reads KV. Drop the Vercel
Toolbar integration.

### VC-OTEL — `@vercel/otel`
Delete `instrumentation.ts` registration. Enable
`"observability": { "enabled": true }` in the wrangler template (**Proven**).
Export to an OTLP collector from the Worker only if one already exists.

### VC-SANDBOX — `@vercel/sandbox`
Out of scope for a mechanical migration: Cloudflare Containers / Sandbox SDK
is a redesign. Stop and record it.

### VC-BOTID — `botid`
Vercel-only. Remove it, and replace with Turnstile (a widget plus a
server-side `siteverify` fetch) or WAF bot rules on the zone.

### VC-QUEUE — Vercel Queues / Workflow, QStash
→ **Cloudflare Queues** (producer binding plus a consumer worker, as a
`cloudflare-worker-turbo` component) or **Workflows** for durable multi-step
jobs. QStash's signed callbacks to routes become queue consumers that call
the route through a service binding.

### VC-AIGATEWAY — Vercel AI Gateway
Point the AI SDK at the provider directly (`@ai-sdk/anthropic`, …), with its
key as a runtime secret, or at **Cloudflare AI Gateway** (the provider's
`baseURL` set to the gateway URL). Delete `AI_GATEWAY_API_KEY`.

### VC-ENVVARS — `VERCEL_*`
`VERCEL_ENV` → `ENVIRONMENT` var per wrangler env; `VERCEL_URL` /
`VERCEL_PROJECT_PRODUCTION_URL` → an explicit per-env var
(`NEXT_PUBLIC_ROOT_DOMAIN`, `APP_URL`); `VERCEL_GIT_*` → build-time env from
CI. Preview-URL logic keyed on `*.vercel.app` is deleted (**Proven**: the
`tenant---branch.vercel.app` branch in `proxy.ts`).

## Next.js runtime features

### VC-EDGE-RUNTIME — `export const runtime = "edge"`
Delete the export. OpenNext on Workers runs routes on its Node-compat runtime.

### VC-NODE-PROXY / VC-MIDDLEWARE — `proxy.ts`, `middleware.ts`
Edge `middleware.ts` is supported. Next 16 `proxy.ts` runs on the Node
runtime, which the adapter (1.20.9) flags as experimental: its build failed
copying `middleware.js.nft.json`. Rename `proxy.ts` → `middleware.ts` and
`export function proxy` → `export function middleware` (**Proven**).
Middleware must not import Node-only modules.

### VC-ISR / VC-USE-CACHE — `revalidate`, `revalidatePath/Tag`, `unstable_cache`, `'use cache'`
Configure a real OpenNext cache in `open-next.config.ts` (Gate G4). The
default is a no-op.

| Archetype | incrementalCache | tagCache | queue | Infra |
|---|---|---|---|---|
| A2 (KV already) | `kvIncrementalCache` (`NEXT_INC_CACHE_KV`) | `doShardedTagCache({ baseShardSize: 12 })` | `doQueue` | KV + 2 DO classes (**Proven**) |
| B (D1 already) | `r2IncrementalCache` (`NEXT_INC_CACHE_R2_BUCKET`) | `d1NextTagCache` (`NEXT_TAG_CACHE_D1`) | `doQueue` | R2 + D1 table + DO |
| A1 heavy ISR (commerce) | `r2IncrementalCache` wrapped in `withRegionalCache` | `doShardedTagCache` | `doQueue` | R2 + DOs |

The DO-based pieces also need `WORKER_SELF_REFERENCE` (a service binding to
the worker itself) and a `migrations` entry with
`new_sqlite_classes: ["DOQueueHandler", "DOShardedTagCache"]`. For
`'use cache'` / `cacheComponents` / PPR, confirm support in the pinned adapter's
release notes. If unsupported, pin to `unstable_cache` + `revalidateTag` and
record the downgrade.

### VC-AFTER — `after()`
Supported. Long work belongs in a Queue, not `after()`.

### VC-MAXDURATION — `maxDuration`, `preferredRegion`
Delete. Workers have no wall-clock limit while the client is connected, so
streaming works. CPU time is set by `limits.cpu_ms` in the wrangler template.
Jobs that ran under `maxDuration: 300–800` move to Queues or Workflows.
`preferredRegion` → `"placement": { "mode": "smart" }`.

### VC-IMAGE — `next/image`
OpenNext optimises images through the **Cloudflare Images** binding
(`"images": { "binding": "IMAGES" }`, paid feature). Otherwise use a custom
`loader` against `/cdn-cgi/image/` on a zone with Image Transformations, or
set `images.unoptimized: true` and record it.

## Data plane

### VC-PRISMA
→ provider `sqlite` + `@prisma/adapter-d1`, generated with the driver-adapter
/ query-compiler engine (no native query-engine binary on workerd).
Migrations: `prisma migrate diff --from-empty --to-schema-datamodel … --script`
→ `NNN_name/up.sql`. Interactive `$transaction(async tx => …)` is unsupported
(G2). The gate fails while any non-sqlite datasource provider remains. Large
Prisma schemas (dub: 87 models, cal.com: 101) are score-5 work: phase them.

### VC-DRIZZLE-PG / VC-DRIZZLE-MYSQL / VC-PG-DRIVER / VC-MYSQL
→ `drizzle-orm/sqlite-core` + `drizzle(env.DB)` from `drizzle-orm/d1`. Map
types per [postgres-to-d1.md](postgres-to-d1.md). Delete `postgres`, `pg`, and
`mysql2`.

### VC-DRIZZLE-SQLITE
Already D1-shaped. Allowed by the gate.

### VC-SUPABASE
Gate G1. *Replace:* DB → D1; `auth.uid() = user_id` RLS → a mandatory
`userId` predicate in every repository function (the Cirrus repository-layer
rule); `handle_new_user` trigger → the sign-up handler inserts the row;
`supabase_realtime` publication → drop, or a DO with WebSockets; Supabase Auth
→ Auth.js / Better Auth on D1, plus OAuth client secrets as runtime secrets.
*Exception:* keep Supabase, with keys in orun secrets and Hyperdrive for SQL.

### VC-KYSELY
→ the D1 Kysely dialect (`kysely-d1`). Allowed by the gate once the dialect
is swapped.

### VC-MONGO
Out of discipline: there is no Cloudflare document store. A G1 exception or a
redesign.

## Auth & payments

### VC-NEXTAUTH
Auth.js with the D1 adapter (`@auth/d1-adapter`) or the Drizzle adapter on
D1; JWT sessions need no adapter. Set `AUTH_SECRET` as a runtime secret and
`trustHost: true`. Email providers using `nodemailer` → VC-NATIVE.

### VC-BETTERAUTH / VC-CLERK
Better Auth on D1 (Kysely/Drizzle). Clerk runs over fetch: keep it, with its
keys as runtime secrets.

### VC-STRIPE
`new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })`. Webhooks:
`await stripe.webhooks.constructEventAsync(body, sig, secret, undefined,
Stripe.createSubtleCryptoProvider())` on the raw `await req.text()`. Keys are
runtime secrets (`runtimeSecrets` + `optionalSecretEnv`).

## Node-only dependencies

### VC-NATIVE
| Dependency | Replacement |
|---|---|
| `sharp` | Cloudflare Images binding (VC-IMAGE) |
| `bcrypt`, `argon2` | `bcryptjs` / `bcrypt-ts`, or WebCrypto PBKDF2 |
| `nodemailer` | Cloudflare Email Service `send_email` binding (as in the Cirrus notifications-worker), or Resend over fetch |
| `puppeteer`, `@sparticuz/chromium` | Browser Rendering binding (`@cloudflare/puppeteer`) |
| `node-cron`, `bull`, `bullmq` | Cron Triggers (VC-CRON) / Queues (VC-QUEUE) |
| `better-sqlite3` | D1 |
| `canvas` | WASM alternative, or move to a Container (stop and record) |

## Vercel config

### VC-CRON — `vercel.json` `crons`
→ an `apps/cron` `cloudflare-worker-turbo` component with
`"triggers": { "crons": [...] }` per env and a service binding `APP` to the web
worker. `scheduled()` maps `event.cron` to the original path and calls
`env.APP.fetch("https://app" + path, { headers: { authorization: "Bearer " +
env.CRON_SECRET } })`. This keeps Vercel's `CRON_SECRET` contract, so route
handlers do not change. Crons with `maxDuration` over the CPU budget move to
Queues.

### VC-VERCELJSON — rewrites, redirects, headers, functions, regions
`rewrites`, `redirects`, and `headers` → `next.config` (portable).
`functions.memory` / `maxDuration` → VC-MAXDURATION. `regions` → smart
placement. Delete `vercel.json` once empty.
