# Provenance — born from Cirrus

Virga is a variation of [sourceplane/cirrus](https://github.com/sourceplane/cirrus)
(the Cloudflare-only multi-tenant SaaS baseline), taken at commit `8f41d16`
("specs: saas-baseline-tracking (BT)"). Cirrus itself was born from Lumen at
`e1fbee6`; the lineage is Lumen → Cirrus → Virga.

Unlike Cirrus's genesis (a verbatim copy followed by a rebrand), Virga's
genesis is a **selection**: the tree keeps the machinery and drops the
product. This note is the record of that choice.

## Kept, verbatim or near-verbatim

| Path | Why |
|---|---|
| `tooling/tsconfig`, `tooling/eslint` | The workspace's compiler and lint contract. The Cirrus rule guarding public-id ↔ UUID column mix-ups is dropped: Virga stores public ids as-is. |
| `tooling/wire/render.mjs` | Deploy-time wiring (`@@wiring(...)@@` tokens) — the reason no resource id is ever committed. |
| `tooling/migrations/rechecksum.mjs` | The manifest checksum guard. |
| `packages/db/src/d1/*` | The D1 seam: executor, placeholder translation, bind-value normalization, constraint detection, health probe. |
| `packages/db/src/json.ts` | SQLite column decoders (JSON text, 0/1 booleans). |
| `packages/db/src/runner/*` | The migration runner over D1's REST API and its statement splitter. |
| `packages/db/src/migrations/000_control` | The migration ledger. |
| `packages/contracts/src/{health,timing,errors}.ts` | Cross-cutting contracts every Worker honours. |
| `tests/db/src/{d1-*,runner}.test.ts` | The seam's own suites. |
| `kiox.yaml`, `kiox.lock` | The Orun runtime pin. |
| The composition stack (`oci://ghcr.io/sourceplane/stack-tectonic`) | Consumed, not vendored, exactly as Cirrus does. |

## Dropped

Everything that exists because there are many tenants: identity, membership,
projects, policy, events/audit, config, metering, billing, webhooks,
integrations, admin, the console, the SDK, the multi-tenant CLI, and the
nineteen migrations that describe them. Also dropped: `SOLO_MODE` — Virga is
not a profile of a tenancy stack, it has no tenancy stack.

## Renamed

`@saas/*` → `@site/*` for every workspace package. The scope is generic on
purpose (it never changes on a fork), and "saas" is the wrong word for a
portfolio.

## What replaces what

| Cirrus | Virga |
|---|---|
| `api-edge` + 12 bounded-context Workers | `site-api` (public) + `mail-worker` (internal) |
| `web-console-next` | `web-site` — same composition, public instead of authenticated |
| `notifications-worker` providers + templates | carried into `mail-worker` |
| `api-edge` rate limiter, CORS, request ids, error envelope | carried into `site-api` |
| org-scoped tables | four contexts by prefix: `audience_`, `forms_`, `engagement_`, `newsletter_` |
| `cirrus` CLI over the SDK | `virga` CLI over the owner routes |
