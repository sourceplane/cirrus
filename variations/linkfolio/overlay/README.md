# Linkfolio

A creator **link-in-bio page and storefront**, a Cloudflare-only SaaS running
the single-user (Solo) profile: identity, billing, email and audit underneath,
one focused product on top. One public page per creator — links, section
headers, digital products and a tip jar — with click analytics behind it.

There are no organizations, teams or seats: **a creator account is the tenant.**

## What is here

| Surface | Where |
|---|---|
| Public page (`/p/:handle`) | `apps/web-console-next/src/app/(public)` |
| Editor (`/page`, `/page/appearance`, `/page/analytics`) | `apps/web-console-next/src/app/(app)/page` |
| Pages API — `/v1/me/page*` (session), `/v1/p/*` (public) | `apps/api-edge/src/pages-facade.ts` → `apps/pages-worker` |
| Data — `pages_*` tables on D1 | `packages/db/src/migrations/200_pages_core`, `packages/db/src/pages` |
| Contracts and SDK | `packages/contracts/src/pages.ts`, `packages/sdk/src/pages.ts` (`client.pages`) |
| Tests | `tests/pages-worker`, `tests/api-edge/src/pages-facade.test.ts`, `tests/db/src/pages.test.ts`, `tests/web-console-next/src/pages-model.test.ts` |

Everything else — identity (magic link + OAuth), the invisible personal
workspace, per-user billing (Polar), notifications, config, audit, the console
shell, CI and deploy-time wiring — is the shared platform underneath, and no
product code touches it. See
[`specs/`](specs/README.md) for the architecture and
[`specs/epics/linkfolio`](specs/epics/linkfolio/README.md) for the work plan.

## How a visitor's click works

The public page is anonymous: no session, no cookie. Tapping a block posts to
`/v1/p/:handle/blocks/:id/click`, which records the click against the page
owner and answers with the block's URL. The browser opens that URL whatever the
write did — analytics never costs a visitor their tap.

## Getting started

```bash
pnpm install
pnpm -r --if-present run wire:fixture   # render offline wrangler configs
pnpm typecheck
pnpm test
```

`.github/workflows/checks.yml` runs exactly that on every push. `ci.yml` is the
Orun deployment pipeline; it needs this repo linked to an Orun Cloud workspace
(set `execution.state.workspace` in `intent.yaml`) and a Cloudflare connection.

## Deploying

Cloudflare is the only provider. The api-edge, the worker fleet (including
`pages-worker`) and the console deploy to `stage` and `prod` through Orun on
merge to `main`; D1 and KV are provisioned by the Terraform roots under
`infra/`, and migrations (including `200_pages_core`) run through the
`db-migrate` component.
