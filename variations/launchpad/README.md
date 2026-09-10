# Variation: launchpad — the launch directory

Product Hunt-style launch directory (submit → launch → upvote/comment, maker
profiles). Register row: [`specs/variations/README.md`](../../specs/variations/README.md).
Epic issue: [sourceplane/cirrus#25](https://github.com/sourceplane/cirrus/issues/25).

- `values.json` — the rebrand identity (repo `launchpad`, product "Launchpad").
- `overlay/` — every file the variation adds or changes over the baseline,
  authored in baseline naming (the rebrand renames at materialize time):
  `apps/launches-worker`, migration `200_launches_core`, `@saas/db/launches`,
  `@saas/contracts/launches`, api-edge `launches-facade` (+ `LAUNCHES_WORKER`
  binding, `launches` rate-limit family), `client.launches` in the SDK, the
  console's product registration (`lib/product.ts`, nav, tabs, landing) and
  pages, tests, README/specs.

```bash
tooling/variations/materialize.sh launchpad ~/sourceplane/launchpad --verify
cd ~/sourceplane/launchpad && git remote add origin git@github.com:sourceplane/launchpad.git && git push -u origin main
```
