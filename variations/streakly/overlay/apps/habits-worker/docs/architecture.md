# habits-worker — architecture

A `cloudflare-worker-turbo` component built from `apps/habits-worker`.

## Bindings and wiring

- **D1** → `PLATFORM_DB` (tables prefixed `habits_`; migration `200_habits_core`).
- No service bindings: the actor arrives on trusted internal headers set by
  api-edge; there is no organization to consult, so no membership/policy hop.

## Surface

| Route | Purpose |
|---|---|
| `GET` / `POST /v1/me/habits` | list (`?includeArchived=true`) / create |
| `PATCH` / `DELETE /v1/me/habits/:id` | edit (incl. archive) / delete with its history |
| `POST /v1/me/habits/reorder` | rewrite order from `{ ids }` |
| `PUT` / `DELETE /v1/me/habits/:id/checkins/:date` | check in (idempotent) / undo |
| `GET /v1/me/today?date=` | the board: done today, streaks, 30-day rate, 7-day grid |
| `GET /v1/me/review?weekStart=` | one ISO week per habit: done, target, met, streak |

Every route requires a user session; there is no anonymous read.

## Streak rules

`src/streaks.ts` is pure and holds the whole definition: daily counts every
day (today unfinished is not a miss), weekdays treats weekends as neutral, and
a weekly target counts ISO weeks that reached the target (the current week
counts only once met).
