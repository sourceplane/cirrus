# Streakly

A **habit and streak tracker**, built on the Cirrus Cloudflare-only SaaS
baseline in its single-user (Solo) profile. Habits with a cadence, a tap to
check one off, streaks that follow the rules a person actually expects, and a
weekly review.

There are no organizations, teams or seats — and no public surface at all:
**the person is the tenant, and the tracker is private.**

## What is here

| Surface | Where |
|---|---|
| Today (the check-in board), Habits, Weekly review | `apps/web-console-next/src/app/(app)` |
| Habits API — `/v1/me/habits*`, `/v1/me/today`, `/v1/me/review` (all session-only) | `apps/api-edge/src/habits-facade.ts` → `apps/habits-worker` |
| Streak rules | `apps/habits-worker/src/streaks.ts` |
| Data — `habits_*` tables on D1 | `packages/db/src/migrations/200_habits_core`, `packages/db/src/habits` |
| Contracts and SDK | `packages/contracts/src/habits.ts`, `packages/sdk/src/habits.ts` (`client.habits`) |
| Tests | `tests/habits-worker`, `tests/api-edge/src/habits-facade.test.ts`, `tests/db/src/habits.test.ts`, `tests/web-console-next/src/habits-model.test.ts` |

Everything else — identity (magic link + OAuth), the invisible personal
workspace, per-user billing (Polar), notifications, config, audit, the console
shell, CI and deploy-time wiring — is the Cirrus baseline, unchanged. See
[`specs/`](specs/README.md) and
[`specs/epics/streakly`](specs/epics/streakly/README.md).

## What counts as keeping a streak

| Cadence | Rule |
|---|---|
| Every day | Consecutive calendar days. Today not being done yet does not break it — the day is not over. |
| Weekdays | Monday to Friday; weekends are neutral, neither extending nor breaking a run. |
| N times a week | The unit is an ISO week (Mon–Sun). A week counts once it reaches N; the current week counts only once already met, so an unfinished week never breaks the run. |

Dates are the **browser's** local calendar dates. The client decides what
"today" is and sends it, so the server does no timezone math and a day is
whatever day it was where the person was.

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
`habits-worker`) and the console deploy to `stage` and `prod` through Orun on
merge to `main`; D1 and KV are provisioned by the Terraform roots under
`infra/`, and migrations (including `200_habits_core`) run through the
`db-migrate` component.
