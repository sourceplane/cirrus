# Epic: streakly — the habit tracker

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** — E1–E4 shipped (MVP slice); E5–E6 open |
| Cluster | **SK** |
| Owner(s) | habits-worker, api-edge (`habits-facade`), packages/{db,contracts,sdk}, web-console-next |
| Target branch | `main` |
| Builds on | Cirrus Solo profile (`specs/profiles/solo-m0.md`), identity, billing, notifications |
| Decisions locked | user-scoped and fully private (no public route); dates are the client's local calendar dates; a check-in is idempotent per (habit, date); archive keeps history, delete does not; the streak definition lives in one pure module |

## Thesis

Productivity and health utilities are the consumer categories that keep
gaining visibility for solo launches, and a single-purpose tool that works
perfectly beats a platform. Streakly is habits, check-ins and streaks — with
the SaaS substrate inherited from the baseline, so the product work is the
streak rules and the board.

## Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| E1 | Foundation — born from Cirrus, Solo on, credential-free checks CI | ✅ Shipped |
| E2 | Domain worker + data — `habits-worker`, migration `200_habits_core`, `@saas/db/habits`, `@saas/contracts/habits`, streak math + SQLite + router tests | ✅ Shipped |
| E3 | Edge + SDK — `habits-facade` (session on every route), `client.habits`, facade tests | ✅ Shipped |
| E4 | Console — Today board, Habits management, Weekly review | ✅ Shipped |
| E5 | Monetisation & notifications — pro entitlement (unlimited habits, history export) via per-user Polar billing; daily reminder + weekly review emails on a cron | 🗓️ Planned |
| E6 | Launch readiness — docs, share card, live verification | 🗓️ Planned |

## Surface

See `apps/habits-worker/docs/architecture.md` for the route table and
`apps/habits-worker/src/streaks.ts` for the rules themselves.

## Notes from the build

- The schema's cadence/target CHECK needs an explicit `IS NOT NULL`: SQLite
  accepts a CHECK that evaluates to NULL, so `NULL BETWEEN 1 AND 7` would have
  let a weekly-target habit exist with no target. Caught by the SQLite suite.
- The reminder emails in E5 need a per-user send time, which means storing a
  timezone — the first piece of state this product keeps that is not a date the
  client supplies.
