# Phase 03 — infrastructure

The first phase that **deploys**: lands the data plane
(`flows/phases/03-infrastructure/blueprint.yaml`) and converges it against real
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

`out`, `workspace`, optional `dryrun` (see [the phases README](../README.md)).

## Steps

1. **preflight** — `common/preflight.sh`: auth, integrations poll,
   allow-list self-heal.
2. **secrets** — `common/create-secrets.sh`: the three brokered provider
   keys (workers-deploy / d1-edit / account-id). Idempotent; orphaned keys
   are recreated against the current ACTIVE connection.
3. **apply** → **land** → **converge** — the standard contract, with one
   deliberate difference: the landing merges WITHOUT waiting on PR checks
   (`land-pr.sh --no-wait`). On a fresh product the PR's db-migrate plan
   lane is structurally red — it resolves the database id from
   `cloudflare-d1`'s job-output secret, which only exists once the merge's
   main run APPLIES `cloudflare-d1`. The convergence step is the real gate.
4. **verify** — asserts `WIRING_CLOUDFLARE_D1` and `WIRING_CLOUDFLARE_KV`
   exist on the stage env rung. A missing key means an apply did not
   publish — check that lane first.

## Failure modes we have actually hit

| symptom | meaning → fix |
|---|---|
| d1 apply: database name already exists with empty platform state | `adopt.tf` looks the database up by name at plan time and imports it — if you removed that file, restore it |
| kv apply: title already exists (10014) with empty platform state | same adoption machinery, by namespace title |
| d1 apply or db-migrate: `Authentication error (10000)` | the token in play is `workers-deploy`, which deliberately cannot touch D1 — both components must bind `CLOUDFLARE_D1_TOKEN` (the `d1-edit` template) |
| db-migrate: `no such table: _migrations_applied` | the runner creates its ledger on connect; this means the apply ran against a different database — check `WIRING_CLOUDFLARE_D1` for the environment |
| secret resolution: `orphaned` | a provider connection was revoked/replaced — re-connect, then re-run the phase (create-secrets self-heals) |
| verify: WIRING keys missing | the corresponding terraform lane failed or was skipped — `gh run view` the convergence run, fix, re-run the phase |

## Re-bootstrapping an EXISTING product

Adoption makes this safe for both roots: an existing D1 database or KV
namespace is imported at plan time rather than colliding. The database's
CONTENTS are untouched by adoption, and the migration runner's applied
ledger lives in the database itself — so a re-bootstrap re-applies only the
migrations that are genuinely missing.

## Example commands

From the baseline checkout (local mode):

```bash
orun workflow run flows/phases/03-infrastructure/workflow.yaml \
  --set out=$HOME/sourceplane/acme --set workspace=ws_ABCD1234
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §3c): same
command by remote reference, with `ORUN_TOKEN` + `GITHUB_TOKEN` exported
and `--set repo=<owner/name>` instead of `out`:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
orun workflow run github:sourceplane/cirrus@main//flows/phases/03-infrastructure/workflow.yaml \
  --set workspace=ws_ABCD1234 --set repo=sourceplane/acme
```

Preview with zero side effects (either mode): append `--set dryrun=true` —
the blueprint is applied, shown, and reverted; nothing is pushed or
deployed. Re-running a completed phase is always safe (idempotent): the
apply is a no-op, the landing finds nothing, and verify re-asserts.

Prerequisite reminder: both integrations (GitHub, Cloudflare) must be
ACTIVE in the workspace — preflight polls up to 10m so the consent can be
clicked while it waits. Check first with:

```bash
orun integrations list ws_ABCD1234
```
