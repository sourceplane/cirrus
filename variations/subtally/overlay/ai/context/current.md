# Current Context

Subtally is a single-user product on the Solo profile. The product bounded context is `subscriptions`
(`apps/subscriptions-worker`, `packages/db/src/subscriptions`, migration
`200_subscriptions_core`), reached through the api-edge
`subscriptions-facade` and surfaced by the console at `/overview`,
`/subscriptions` and `/categories`. There is no public surface.

The renewal and normalisation arithmetic lives in
`apps/subscriptions-worker/src/renewals.ts` and is the one place to change it;
`tests/subscriptions-worker/src/renewals.test.ts` pins the behaviour (anchored
month clamping, leap days, custom intervals).

Verified: typecheck, build and the full test suite pass locally and in
`.github/workflows/checks.yml`. Not verified: no live deployment yet —
`ci.yml` needs the repo linked to an Orun Cloud workspace.

Next: E5 (pro entitlement, renewal reminder emails) and E6 (CSV import) in
`specs/epics/subtally/`.
