# Pulsewatch

An **uptime monitor with a public status page**, built on the Cirrus
Cloudflare-only SaaS baseline in its single-user (Solo) profile. Point it at
your endpoints, and it checks them on a schedule, opens an incident when
something is actually down, and gives your users one page to look at.

There are no organizations, teams or seats: **a developer account is the
tenant.**

## What is here

| Surface | Where |
|---|---|
| Public status page (`/status/:handle`) | `apps/web-console-next/src/app/(public)` |
| Monitors, monitor detail, Incidents, Status page settings | `apps/web-console-next/src/app/(app)` |
| Monitors API — `/v1/me/*` (session), `/v1/status/:handle` (public) | `apps/api-edge/src/monitors-facade.ts` → `apps/monitors-worker` |
| The cron that does the checking | `apps/monitors-worker/src/scheduler.ts` (`scheduled` handler, `* * * * *`) |
| Incident rules and uptime math | `apps/monitors-worker/src/incidents.ts` |
| Data — `monitors_*` tables on D1 | `packages/db/src/migrations/200_monitors_core`, `packages/db/src/monitors` |
| Contracts and SDK | `packages/contracts/src/monitors.ts`, `packages/sdk/src/monitors.ts` (`client.monitors`) |
| Tests | `tests/monitors-worker`, `tests/api-edge/src/monitors-facade.test.ts`, `tests/db/src/monitors.test.ts`, `tests/web-console-next/src/monitors-model.test.ts` |

Everything else — identity (magic link + OAuth), the invisible personal
workspace, per-user billing (Polar), notifications, config, audit, the console
shell, CI and deploy-time wiring — is the Cirrus baseline, unchanged. See
[`specs/`](specs/README.md) and
[`specs/epics/pulsewatch`](specs/epics/pulsewatch/README.md).

## What counts as down

One failed check is a blip. **Two consecutive failures** flip a monitor to
down and open an incident; the **first success** resolves it. That rule lives
in one pure module with its own tests, because it decides when somebody's
phone buzzes.

The worker wakes every minute and probes only the monitors whose own interval
has elapsed, so a one-minute monitor is checked on every wake and an hourly one
on every sixtieth.

## What the status page does not say

The public page carries monitor **names**, status, uptime and incidents. It
never carries the monitored URL, the check interval or anything identifying
the owner. A disabled monitor does not appear at all.

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
`monitors-worker` and its cron trigger) and the console deploy to `stage` and
`prod` through Orun on merge to `main`; D1 and KV are provisioned by the
Terraform roots under `infra/`, and migrations (including `200_monitors_core`)
run through the `db-migrate` component.
