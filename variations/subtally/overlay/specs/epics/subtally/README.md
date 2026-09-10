# Epic: subtally — the recurring-expense tracker

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** — E1–E4 shipped (MVP slice); E5–E6 open |
| Cluster | **ST** |
| Owner(s) | subscriptions-worker, api-edge (`subscriptions-facade`), packages/{db,contracts,sdk}, web-console-next |
| Target branch | `main` |
| Builds on | Cirrus Solo profile (`specs/profiles/solo-m0.md`), identity, billing, notifications |
| Decisions locked | user-scoped and fully private (no public route); renewals derived from an anchor date, never stored; totals reported per currency, never converted; paused and cancelled rows keep their history but leave the totals |

## Thesis

Subscription fatigue is a named 2026 trend and low-frequency monthly tools are
being cancelled. A utility that shows what you pay for, when it renews and
what it totals is exactly the kind of personal-finance tool people will pay a
one-time price for — and the SaaS substrate comes from the baseline, so the
product work is the money and date arithmetic.

## Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| E1 | Foundation — born from Cirrus, Solo on, credential-free checks CI | ✅ Shipped |
| E2 | Domain worker + data — `subscriptions-worker`, migration `200_subscriptions_core`, `@saas/db/subscriptions`, `@saas/contracts/subscriptions`, renewal math + SQLite + router tests | ✅ Shipped |
| E3 | Edge + SDK — `subscriptions-facade` (session on every route), `client.subscriptions`, facade tests | ✅ Shipped |
| E4 | Console — Overview (totals + upcoming), Subscriptions list/CRUD, Categories | ✅ Shipped |
| E5 | Monetisation & notifications — pro entitlement (unlimited items, CSV export, multi-currency) via per-user Polar billing; renewal-reminder emails N days ahead | 🗓️ Planned |
| E6 | Launch readiness — import from a CSV, docs, live verification | 🗓️ Planned |

## Surface

See `apps/subscriptions-worker/docs/architecture.md` for the route table and
`apps/subscriptions-worker/src/renewals.ts` for the arithmetic.

## Notes from the build

- The naming collision with billing is deliberate to avoid: the billing context
  owns `PublicSubscription` (a plan the customer buys from *us*), so this
  product's rows are `PublicTrackedSubscription` (a charge the person pays
  *someone else*). Both are exported from the contracts barrel.
- The cadence/interval CHECK needs an explicit `IS NOT NULL`, for the same
  reason the habits schema does: SQLite accepts a CHECK that evaluates to NULL.
- E5's reminder emails need a per-user send time and timezone — the first state
  this product would keep that is not supplied by the client per request.
