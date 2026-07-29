# cirrus

**An all-Cloudflare multi-tenant SaaS baseline.** Identity, organizations,
projects, RBAC, audit, metering, billing, webhooks, and notifications ship as
separate bounded-context Cloudflare Workers behind a single public edge API,
with a Next.js console on Workers + Static Assets — and **Cloudflare D1 as the
system of record**. No Postgres, no Supabase, no AWS. One cloud account and a
GitHub repo is the entire supplier list.

Built as an [Orun](https://opencode.ai/docs) component-native desired-state
repo: every deployable unit declares itself in a `component.yaml`, and CI calls
`orun plan` / `orun run` rather than Wrangler, Terraform, or pnpm directly.

## Status

Cirrus is a **fork of [`sourceplane/lumen`](https://github.com/sourceplane/lumen)**
(`e1fbee6`) whose data plane is being moved from Supabase Postgres to
Cloudflare D1, milestone by milestone. The runtime, contracts, console, and
component model come over intact and proven; the storage layer is the work.

Progress lives in **[`specs/epics/cloudflare-native/`](specs/epics/cloudflare-native/)** —
read the [epic README](specs/epics/cloudflare-native/README.md) for the thesis
and the trade-offs it accepts, [`design.md`](specs/epics/cloudflare-native/design.md)
for the dialect contract, and
[`IMPLEMENTATION-STATUS.md`](specs/epics/cloudflare-native/IMPLEMENTATION-STATUS.md)
for what has landed.

Inherited from the baseline and still true:

- **Billing** runs end-to-end via the Polar adapter (embedded checkout, plan
  changes, multi-org fan-out). Polar is a payment provider, not
  infrastructure — "all-Cloudflare" is about where the product runs and stores.
- **Notifications** deliver through Cloudflare Email Service (`send_email`
  binding, no API key), which needs one-time account setup: Workers Paid plan
  and the sending domain verified for DKIM/SPF.
- **Production OAuth / magic-link auth** needs human-supplied credentials; the
  code paths are complete and the secrets are wire-now-seed-later.

## Two CI workflows, on purpose

`verify.yml` runs install → typecheck → lint → test → build and needs nothing
but the repo, so a PR is reviewable on day one. `ci.yml` is the Orun plan/run
pipeline that provisions and deploys; it needs a linked workspace and connected
integrations, so it stays gated behind the `ORUN_CI` repository variable until
[BOOTSTRAP.md](BOOTSTRAP.md) §1 is done.

## Forking / rebranding

This baseline is built to be instantiated as new products. The mechanical
rename (repo slug, product name/domain, SDK class, CLI bin, worker prefixes,
user agents, workers.dev subdomain) is one script —
`node tooling/rebrand/rebrand.mjs --values my-brand.json` — and everything
that needs human hands is a checklist. Forks can also grow **a few
components at a time**: `tooling/fork/components.mjs` orders and validates
per-component copies against the full prerequisite graph (and keeps
`pnpm-lock.yaml` in sync). See **[FORKING.md](FORKING.md)**.

## Prerequisites

- Node.js >= 20 (CI and components run on Node 22)
- pnpm >= 10 (`npm install -g pnpm`)
- (Optional, for local Orun validation) the `kiox` CLI on your `PATH`. `kiox`
  pins the Orun provider declared in `kiox.yaml`; invoke Orun as
  `kiox -- orun ...`.

## Getting Started

```bash
# Install all workspace dependencies
pnpm install

# Type-check / lint / test / build across the workspace (Turborepo)
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Workspace Layout

```
apps/api-edge             Public HTTP entry point (Cloudflare Worker)
apps/identity-worker      Users, sessions, API keys, OAuth
apps/membership-worker    Organizations, members, invitations, role assignments
apps/projects-worker      Projects and environments
apps/policy-worker        Deny-by-default RBAC evaluation
apps/events-worker        Domain events, audit log, observability
apps/config-worker        Settings, feature flags, secret metadata
apps/metering-worker      Usage ingestion, quotas, rollups
apps/billing-worker       Plans, subscriptions, invoices (Polar adapter)
apps/notifications-worker Email delivery and preferences
apps/webhooks-worker      Outgoing webhooks: signing, delivery, replay
apps/admin-worker         Audited admin/support workflows
apps/web-console-next     Next.js console (Cloudflare Workers + Static Assets)

packages/contracts        Shared API, tenancy, event, and error types + validators
packages/policy-engine    RBAC evaluation logic
packages/db               Migration harness, manifest, and runner
packages/sdk              TypeScript SDK (contract-driven)
packages/cli              `cirrus` CLI
packages/notifications-client  Notifications client
packages/shared           Generic helpers (IDs, errors) — no domain logic
packages/testing          Test fixtures and utilities

infra/terraform/cloudflare-kv      api-edge idempotency KV namespace
infra/terraform/cloudflare-domain  Zone adoption + console custom domain
infra/db-migrate                   Database migration runner component

infra/terraform/supabase           ⚠ inherited — deleted in CN5
infra/terraform/cloudflare-hyperdrive  ⚠ inherited — deleted in CN5
                                   (replaced by infra/terraform/cloudflare-d1)

tooling/tsconfig          Shared TypeScript configurations
tooling/eslint            Shared ESLint configuration
tests/*                   Per-component contract and verifier test suites
```

Execution contracts (the composition stack) are not vendored here. They are
consumed from the published catalog at
`oci://ghcr.io/sourceplane/stack-tectonic`, pinned to an explicit version in
`intent.yaml`. Composition changes are made in
[sourceplane/stack-tectonic](https://github.com/sourceplane/stack-tectonic),
released there, and adopted here by bumping the pinned tag.

## CI

CI is powered by [Orun](https://opencode.ai/docs) with the local Stack Tectonic
composition stack. `.github/workflows/ci.yml` calls only `orun plan` and
`orun run` — no direct `pnpm`, `turbo`, Wrangler, or Terraform commands run in
GitHub Actions. The Orun runtime is pinned in `kiox.yaml` (resolved digest in
`kiox.lock`); the workflow's `orun-action` `version:` matches that pin.

### Local Orun Verification

```bash
kiox -- orun compositions lock --intent intent.yaml
kiox -- orun validate --intent intent.yaml
kiox -- orun plan --changed --intent intent.yaml --output plan.json
kiox -- orun run --plan plan.json --dry-run --runner github-actions
```

Use `--changed` for PR-scoped checks; use a full plan when validating
environment promotion or cross-component dependencies (`--view dag`).

## Infrastructure

Terraform provisions the Cloudflare resources for `stage` and `prod`. There is
no AWS: **state** lives on the Orun control plane (`backend "http" {}`, the
runner exports `TF_HTTP_*` per job with the run token as the credential), and
**secrets** are Orun-managed — brokered fresh per run from the workspace's
integrations, resolved lease-bound by the jobs that declare them, and
log-redacted. CI holds exactly one credential, GitHub's own `GITHUB_TOKEN`.

Resource ids are never committed. Each infra component lease-publishes a
`WIRING_<COMPONENT>` document onto the project/env secret rung after apply, and
the worker compositions render `wrangler.jsonc` from it at deploy time —
`wiring.fixture.json` stands in for offline verify lanes.

Once CN5 lands, the full provisioned surface is: one D1 database, one KV
namespace, and (optionally) a zone for the console's custom domain. See
`specs/core/access-and-infra.md` for the access model and the manual
prerequisites.

## Adding a New Component

1. Create the directory under `apps/`, `packages/`, `tests/`, or `infra/`.
2. Add a `component.yaml` with the appropriate `spec.type` — one of
   `cloudflare-worker-turbo`, `cloudflare-workers-assets-turbo`, `terraform`,
   `db-migrate`, or `turbo-package` — plus `subscribe.environments` and the
   typed `parameters` the composition schema requires.
3. Orun discovers it automatically on the next plan (`discovery.roots` covers
   `apps/`, `infra/`, `packages/`, `tests/`). Validate with
   `kiox -- orun validate --intent intent.yaml`.

See `specs/core/orun-golden-path.md` for the intent/component/composition layer
rules before changing CI, infra, or `intent.yaml`.
