# Variation: streakly — the habit tracker

Habits with a cadence, a tap to check one off, streaks, and a weekly review.
Entirely private: no public route. Register row:
[`specs/variations/README.md`](../../specs/variations/README.md). Epic issue:
[sourceplane/cirrus#27](https://github.com/sourceplane/cirrus/issues/27).

- `values.json` — the rebrand identity (repo `streakly`, product "Streakly").
- `overlay/` — every file the variation adds or changes over the baseline,
  authored in baseline naming (the rebrand renames at materialize time):
  `apps/habits-worker` (with the streak rules in `src/streaks.ts`), migration
  `200_habits_core`, `@saas/db/habits`, `@saas/contracts/habits`, api-edge
  `habits-facade` (+ `HABITS_WORKER` binding, `habits` rate-limit family),
  `client.habits` in the SDK, the console's product registration and pages
  (Today, Habits, Weekly review), tests, README/specs.

```bash
tooling/variations/materialize.sh streakly ~/sourceplane/streakly --verify
cd ~/sourceplane/streakly && git remote add origin git@github.com:sourceplane/streakly.git && git push -u origin main
```
