# Launchpad

A Product Hunt-style **launch directory**, a Cloudflare-only SaaS running the
single-user (Solo) profile: identity, billing, email and audit underneath, one
focused product on top. Makers sign in, submit a product, and launch it into a
public directory where everyone can upvote and comment; daily and weekly
leaderboards rank launches and every maker has a public profile.

There are no organizations, teams or seats: **a maker account is the tenant.**

## What is here

| Surface | Where |
|---|---|
| Public directory (`/explore`, `/explore/:slug`, `/makers/:handle`) | `apps/web-console-next/src/app/(public)` |
| Owner console (`/launches`, `/launches/new`, `/launches/:id`, `/profile`) | `apps/web-console-next/src/app/(app)` |
| Launches API — `/v1/launches*`, `/v1/makers/*` (public), `/v1/me/*` (session) | `apps/api-edge/src/launches-facade.ts` → `apps/launches-worker` |
| Data — `launches_*` tables on D1 | `packages/db/src/migrations/200_launches_core`, `packages/db/src/launches` |
| Contracts and SDK | `packages/contracts/src/launches.ts`, `packages/sdk/src/launches.ts` (`client.launches`) |
| Tests | `tests/launches-worker`, `tests/api-edge/src/launches-facade.test.ts`, `tests/db/src/launches.test.ts`, `tests/web-console-next/src/launches-model.test.ts` |

Everything else — identity (magic link + OAuth), the invisible personal
workspace, per-user billing (Polar), notifications, config, audit, the console
shell, CI and deploy-time wiring — is the shared platform underneath, and no
product code touches it. See
[`specs/`](specs/README.md) for the architecture and
[`specs/epics/launchpad`](specs/epics/launchpad/README.md) for the work plan.

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
`launches-worker`) and the console deploy to `stage` and `prod` through Orun
on merge to `main`; D1 and KV are provisioned by the Terraform roots under
`infra/`, and migrations (including `200_launches_core`) run through the
`db-migrate` component.
