# Variation: subtally — the recurring-expense tracker

Subscriptions with a cadence and an anchor date, normalised monthly/yearly
totals per currency, and upcoming renewals. Entirely private: no public route.
Register row: [`specs/variations/README.md`](../../specs/variations/README.md).
Epic issue: [sourceplane/cirrus#28](https://github.com/sourceplane/cirrus/issues/28).

- `values.json` — the rebrand identity (repo `subtally`, product "Subtally").
- `overlay/` — every file the variation adds or changes over the baseline,
  authored in baseline naming (the rebrand renames at materialize time):
  `apps/subscriptions-worker` (with the arithmetic in `src/renewals.ts`),
  migration `200_subscriptions_core`, `@saas/db/subscriptions`,
  `@saas/contracts/subscriptions` (`PublicTrackedSubscription`, so it does not
  collide with billing's `PublicSubscription`), api-edge
  `subscriptions-facade` (+ `SUBSCRIPTIONS_WORKER` binding, `subscriptions`
  rate-limit family), `client.subscriptions` in the SDK, the console's product
  registration and pages (Overview, Subscriptions, Categories), tests,
  README/specs.

```bash
tooling/variations/materialize.sh subtally ~/sourceplane/subtally --verify
cd ~/sourceplane/subtally && git remote add origin git@github.com:sourceplane/subtally.git && git push -u origin main
```
