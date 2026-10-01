# subscriptions-worker — architecture

A `cloudflare-worker-turbo` component built from `apps/subscriptions-worker`.

## Bindings and wiring

- **D1** → `PLATFORM_DB` (tables prefixed `subscriptions_`; migration `200_subscriptions_core`).
- No service bindings: the actor arrives on trusted internal headers set by
  api-edge; there is no organization to consult, so no membership/policy hop.

## Surface

| Route | Purpose |
|---|---|
| `GET` / `POST /v1/me/subscriptions` | list (`?status=`) / create |
| `GET` / `PATCH` / `DELETE /v1/me/subscriptions/:id` | read / edit / delete |
| `GET /v1/me/subscriptions/summary` | monthly and yearly totals per currency, and per category |
| `GET /v1/me/subscriptions/upcoming?days=` | active renewals inside the window, soonest first |

Every route requires a user session. `?asOf=YYYY-MM-DD` overrides the reference
date on any of them (tests pin it; the console leaves it out).

## Derived, not stored

`src/renewals.ts` holds the whole calculation: the next billing date from the
anchor and cadence (a monthly charge anchored on the 31st bills on the 28th in
February and returns to the 31st in March), plus the monthly/yearly
normalisation used by the totals. Nothing about "next renewal" lives in the
database, so nothing can go stale.
