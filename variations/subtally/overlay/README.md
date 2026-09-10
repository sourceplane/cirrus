# Subtally

A **subscription and recurring-expense tracker**, a Cloudflare-only SaaS
running the single-user (Solo) profile: identity, billing, email and audit
underneath, one focused product on top. Add what you pay for, see what it
costs per month and per year, and know what renews next.

There are no organizations, teams or seats — and no public surface at all:
**the person is the tenant, and the list is private.**

## What is here

| Surface | Where |
|---|---|
| Overview (totals + upcoming), Subscriptions, Categories | `apps/web-console-next/src/app/(app)` |
| Subscriptions API — `/v1/me/subscriptions*` (all session-only) | `apps/api-edge/src/subscriptions-facade.ts` → `apps/subscriptions-worker` |
| Renewal and normalisation math | `apps/subscriptions-worker/src/renewals.ts` |
| Data — `subscriptions_items` on D1 | `packages/db/src/migrations/200_subscriptions_core`, `packages/db/src/subscriptions` |
| Contracts and SDK | `packages/contracts/src/subscriptions.ts`, `packages/sdk/src/subscriptions.ts` (`client.subscriptions`) |
| Tests | `tests/subscriptions-worker`, `tests/api-edge/src/subscriptions-facade.test.ts`, `tests/db/src/subscriptions.test.ts`, `tests/web-console-next/src/subscriptions-model.test.ts` |

Everything else — identity (magic link + OAuth), the invisible personal
workspace, per-user billing (Polar), notifications, config, audit, the console
shell, CI and deploy-time wiring — is the shared platform underneath, and no
product code touches it. See
[`specs/`](specs/README.md) and
[`specs/epics/subtally`](specs/epics/subtally/README.md).

## Two rules worth knowing

**Renewals are derived, never stored.** A subscription keeps an *anchor date*
it was (or will be) billed on; every future renewal is computed from it. A
monthly charge anchored on the 31st bills on the 28th in February and returns
to the 31st in March — because the 31st is the anchor, not "the last day".

**Totals never mix currencies.** Monthly and yearly figures are reported per
currency. Adding dollars to euros would need an exchange rate this product has
no business inventing.

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
`subscriptions-worker`) and the console deploy to `stage` and `prod` through
Orun on merge to `main`; D1 and KV are provisioned by the Terraform roots under
`infra/`, and migrations (including `200_subscriptions_core`) run through the
`db-migrate` component.
