# Phase 03 — infrastructure

The first phase that **deploys**: lands the data plane
(`repo-blueprint.yaml`, phase `03-infrastructure`) and converges it against real
providers. Its terraform outputs are published as job-output secrets that
every later phase consumes.

## What it lands

`infra/terraform/`: `cloudflare-d1`, `cloudflare-kv`, and `infra/db-migrate`
— each with a `terraform` (or `db-migrate`) component and the self-healing
`adopt.tf` import machinery.

The merge's convergence applies them in DAG order: `cloudflare-d1 →
db-migrate`, with `cloudflare-kv` in parallel. On success each apply
lease-publishes its outputs to the project/env secret rungs:
`WIRING_CLOUDFLARE_D1`, `WIRING_CLOUDFLARE_KV`.

This is the phase where being Cloudflare-only pays: D1 databases are created
in seconds, so the phase that took ten minutes on a Postgres-backed baseline
(waiting for a managed project to provision) now converges in about two.

## Prerequisites

Both integrations ACTIVE in the workspace (preflight polls up to 10m so the
consent can be clicked while it waits), plus:

- Cloudflare account on the Workers paid plan.

## Inputs

`--out` is the product repo. The blueprint's required inputs — `reponame`,
`productname`, `productdomain`, `githubOrg` — are validated before any phase
runs, so pass them on every invocation (a `--values` file beats repeating
`--set`); everything else this phase needs it reads back from the placed
tree. See [the phases README](README.md).

## Steps

1. **requires.probe** — `orun.doctor/check@v1` polls for the GitHub and
   Cloudflare consents (up to 10 minutes). This is a declared precondition
   of the phase, not a preamble: a consent nobody has clicked is a *wait*,
   and the phase says so rather than failing.
2. **secrets** — three `orun.integrations/reconcile@v1` `pre` hooks mint the
   brokered provider keys (workers-deploy / d1-edit / account-id). A
   reconcile, not a create: keys that exist are KEPT, and orphaned keys are
   re-made against the current ACTIVE connection. Each holds no value — a
   brokered secret is a pointer at a connection and a scope template.
3. **place** → **land** → **converge** — the standard contract, with one
   deliberate difference: the landing merges WITHOUT waiting on PR checks.
   On a fresh product the PR's db-migrate plan lane is structurally red — it
   resolves the database id from `cloudflare-d1`'s job-output secret, which
   only exists once the merge's main run APPLIES `cloudflare-d1`. The
   convergence watch is the real gate.
4. **verify** — an `orun.secrets/exists@v1` `await` hook asserts
   `WIRING_CLOUDFLARE_D1` and `WIRING_CLOUDFLARE_KV` exist on the stage env
   rung. A missing key means an apply did not publish — check that lane
   first. `04-workers` re-asserts the same two keys as its own
   `requires.probe`, so it will not start on a half-applied phase 03.

## Failure modes we have actually hit

| symptom | meaning → fix |
|---|---|
| d1 apply: database name already exists with empty platform state | `adopt.tf` looks the database up by name at plan time and imports it — if you removed that file, restore it |
| kv apply: title already exists (10014) with empty platform state | same adoption machinery, by namespace title |
| d1 apply or db-migrate: `Authentication error (10000)` | the token in play is `workers-deploy`, which deliberately cannot touch D1 — both components must bind `CLOUDFLARE_D1_TOKEN` (the `d1-edit` template) |
| db-migrate: `no such table: _migrations_applied` | the runner creates its ledger on connect; this means the apply ran against a different database — check `WIRING_CLOUDFLARE_D1` for the environment |
| secret resolution: `orphaned` | a provider connection was revoked/replaced — re-connect, then re-run the phase (the reconcile re-mints only the missing keys) |
| verify: WIRING keys missing | the corresponding terraform lane failed or was skipped — `gh run view` the convergence run, fix, re-run the phase |

## Re-bootstrapping an EXISTING product

Adoption makes this safe for both roots: an existing D1 database or KV
namespace is imported at plan time rather than colliding. The database's
CONTENTS are untouched by adoption, and the migration runner's applied
ledger lives in the database itself — so a re-bootstrap re-applies only the
migrations that are genuinely missing.

## Example commands

From the baseline checkout:

```bash
orun new --blueprint repo-blueprint.yaml --out $HOME/sourceplane/acme \
  --run-hooks --phase 03-infrastructure --values ~/acme.values.yaml
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §2): clone the
baseline at a tag and run the same command, with `ORUN_TOKEN` +
`GITHUB_TOKEN` exported:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme \
  --run-hooks --phase 03-infrastructure --values /work/acme.values.yaml
```

Preview with zero side effects: drop `--run-hooks` — the phase places files
and stops, with no repo, no landing, no convergence watch and no probe. Add
`--status` to derive every phase's state and write nothing at all.
Re-running a completed phase is always safe (idempotent): the placement is a
no-op, the landing finds nothing, and the `await` hooks re-assert.

Prerequisite reminder: both integrations (GitHub, Cloudflare) must be
ACTIVE in the workspace — this phase's `requires.probe` polls up to 10m so
the consent can be clicked while it waits. Check first with:

```bash
orun integrations list ws_ABCD1234
```
