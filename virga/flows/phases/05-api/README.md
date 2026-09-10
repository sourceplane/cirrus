# Phase 05 — api

Lands **site-api** (`flows/phases/05-api/blueprint.yaml`) — the only publicly
routable Worker — and proves it live.

## What it lands

`apps/site-api` (+ its test component): the only publicly routable Worker,
with the service binding to the mail worker from phase 04, the rate-limiter
KV binding (id from `WIRING_CLOUDFLARE_KV`), and the D1 binding (database id
from `WIRING_CLOUDFLARE_D1`).

## Inputs

`out`, `workspace`, optional `dryrun` (see [the phases README](../README.md)).

## Steps

1. **preflight** — workspace readiness.
2. **apply** → **land** → **converge** — the standard contract
   (PR `phase(05-api): site-api`).
3. **verify** — `common/verify-endpoints.sh <out> edge` probes
   `https://<repo>-site-api-{stage,prod}.<subdomain>.workers.dev/health`
   and fails on any dead endpoint (URLs derived from
   `.rebrand/values.json`).

## Verify / done means

`/health` answers 2xx–4xx (a 4xx is "alive but unauthorized", which counts
as deployed; 5xx/timeout does not) on BOTH environments.

## Troubleshooting

- **Deploy lane fails on a missing service binding**: phase 04 has not
  converged — `virga-mail-worker-<env>` must exist before this Worker's
  config can bind it.
- **`/health` 5xx after a green deploy**: the edge boots but a downstream
  binding misbehaves — check the worker it proxies to; the smoke in the
  deploy lane retried ~75s already, so this is real, not propagation.

## Example commands

From the baseline checkout (local mode):

```bash
orun workflow run flows/phases/05-api/workflow.yaml \
  --set out=$HOME/sourceplane/acme --set workspace=ws_ABCD1234
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §3c): same
command by remote reference, with `ORUN_TOKEN` + `GITHUB_TOKEN` exported
and `--set repo=<owner/name>` instead of `out`:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
orun workflow run github:sourceplane/virga@main//flows/phases/05-api/workflow.yaml \
  --set workspace=ws_ABCD1234 --set repo=sourceplane/acme
```

Preview with zero side effects (either mode): append `--set dryrun=true` —
the blueprint is applied, shown, and reverted; nothing is pushed or
deployed. Re-running a completed phase is always safe (idempotent): the
apply is a no-op, the landing finds nothing, and verify re-asserts.

On success the verify step has already probed
`https://acme-site-api-{stage,prod}.<subdomain>.workers.dev/health`.

## Next

[Phase 06 — console](../06-site/README.md).
