# Phase 05 — edge

Lands the **API edge** (`repo-blueprint.yaml`, phase `05-edge`) — the single public
entry point fronting the worker fleet — and proves it live.

## What it lands

`apps/api-edge` (+ its test component): the gateway worker with service
bindings to the fleet from phase 04, the idempotency KV binding (id from
`WIRING_CLOUDFLARE_KV`), and the D1 binding (database id from
`WIRING_CLOUDFLARE_D1`).

## Inputs

`--out` is the product repo. The blueprint's required inputs — `reponame`,
`productname`, `productdomain`, `githuborg` — are validated before any phase
runs, so pass them on every invocation (a `--values` file beats repeating
`--set`); everything else this phase needs it reads back from the placed
tree. See [the phases README](README.md).

## Steps

1. **place** → **land** → **converge** — the standard contract
   (PR `phase(05-edge): api-edge`).
2. **verify** — an `orun.http/probe@v1` `await` hook probes
   `https://<repo>-api-edge-{stage,prod}.<subdomain>.workers.dev/health`
   and fails on any dead endpoint (the URLs are templated from the
   blueprint's own inputs).

## Verify / done means

`/health` answers 2xx–4xx (a 4xx is "alive but unauthorized", which counts
as deployed; 5xx/timeout does not) on BOTH environments.

## Troubleshooting

- **Deploy lane fails on a missing service binding**: phase 04's restore
  landing did not complete — its second convergence must be green first.
- **`/health` 5xx after a green deploy**: the edge boots but a downstream
  binding misbehaves — check the worker it proxies to; the smoke in the
  deploy lane retried ~75s already, so this is real, not propagation.

## Example commands

From the baseline checkout:

```bash
orun new --blueprint repo-blueprint.yaml --out $HOME/sourceplane/acme \
  --run-hooks --phase 05-edge --values ~/acme.values.yaml
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §2): clone the
baseline at a tag and run the same command, with `ORUN_TOKEN` +
`GITHUB_TOKEN` exported:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme \
  --run-hooks --phase 05-edge --values /work/acme.values.yaml
```

Preview with zero side effects: drop `--run-hooks` — the phase places files
and stops, with no repo, no landing, no convergence watch and no probe. Add
`--status` to derive every phase's state and write nothing at all.
Re-running a completed phase is always safe (idempotent): the placement is a
no-op, the landing finds nothing, and the `await` hooks re-assert.

On success the verify step has already probed
`https://acme-api-edge-{stage,prod}.<subdomain>.workers.dev/health`.

## Next

[Phase 06 — console](06-console.md).
