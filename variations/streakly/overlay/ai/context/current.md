# Current Context

Streakly is a user-scoped product born from the Cirrus baseline (Solo
profile). The product bounded context is `habits` (`apps/habits-worker`,
`packages/db/src/habits`, migration `200_habits_core`), reached through the
api-edge `habits-facade` and surfaced by the console at `/today`, `/habits`
and `/review`. There is no public surface: every route requires a session.

The streak definition lives in `apps/habits-worker/src/streaks.ts` and is the
one place to change it; `tests/habits-worker/src/streaks.test.ts` pins the
behaviour (daily, weekdays-neutral-weekends, weekly target).

Verified: typecheck, build and the full test suite pass locally and in
`.github/workflows/checks.yml`. Not verified: no live deployment yet —
`ci.yml` needs the repo linked to an Orun Cloud workspace.

Next: E5 (pro entitlement, reminder/review emails) and E6 in
`specs/epics/streakly/`.
