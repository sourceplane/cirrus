# Repository shape and delivery contract

Status: Normative

## Monorepo

pnpm workspace + Turborepo. Globs: `apps/*`, `packages/*`, `tests/*`,
`tooling/*`. Package scope `@site/*` (never renamed on a fork). Every
package has `build`, `typecheck`, `lint`; suites have `test`; templated
Workers have `wire:fixture`.

```
apps/site-api      public Worker      cloudflare-worker-turbo (templated wrangler)
apps/mail-worker   internal Worker    cloudflare-worker-turbo (templated wrangler)
apps/web-site      Next.js site       cloudflare-workers-assets-turbo (committed wrangler)
packages/*         turbo-package
tests/*            turbo-package (quick-check lane runs the suite as preBuild)
infra/terraform/*  terraform          state on the platform (backend "http")
infra/db-migrate   db-migrate         migrations over D1's REST API
```

## Tests run on a real engine

`node:sqlite` (Node ≥ 22.5) backs every repository and Worker suite through
`@site/testing/sqlite`. A suite that stubs the executor and asserts on SQL
text is not a substitute.

## Deploy-time wiring (BF6, inherited)

Templated Workers commit `wrangler.template.jsonc` with
`@@wiring(<component>/<env>:<key>)@@` tokens and a `wiring.fixture.json`.
Verify lanes render from the fixture (`pnpm run wire:fixture`); deploy lanes
render from the `WIRING_*` secrets the Terraform components lease-publish.
`wrangler.jsonc` for those Workers is gitignored, never committed.

## CI

- `verify.yml` — pre-bootstrap merge gate: install → wire fixtures →
  typecheck → lint → test → build → checksum check. Needs nothing but the repo.
- `ci.yml` — Orun `plan --changed` + `run` per component lane; brokered
  Cloudflare credentials; gated behind the `ORUN_CI` repository variable
  until the product is bootstrapped.

## Environments

`dev` is verify-only (no database by design). `stage` and `prod` deploy on
merge to `main`; prod promotes after stage.

## Secrets

Every component reads secrets from the `lumen/virga/<env>` rung of the
workspace (the rung name is inherited from the composition stack). Runtime
secrets (`OWNER_TOKEN`, `TURNSTILE_SECRET`, `FINGERPRINT_SALT`) are seeded
with `orun secrets set` and pushed on the next deploy; nothing blocks on them.
