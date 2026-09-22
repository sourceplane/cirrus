# Phase 06 — console

Lands the **web console** (`repo-blueprint.yaml`, phase `06-console`) — the product UI
served from Workers assets — and proves both it and the edge it talks to
live.

## What it lands

`apps/web-console-next` (+ its test component): the Next.js console built
and deployed as a Cloudflare worker with static assets, configured against
the phase 05 edge.

## Inputs

`--out` is the product repo. The blueprint's required inputs — `reponame`,
`productname`, `productdomain`, `githuborg` — are validated before any phase
runs, so pass them on every invocation (a `--values` file beats repeating
`--set`); everything else this phase needs it reads back from the placed
tree. See [the phases README](README.md).

## Steps

1. **place** → **land** → **converge** — the standard contract
   (PR `feat(console): the web console`).
2. **verify** — an `orun.http/probe@v1` `await` hook: the console roots AND
   the edge `/health`, on stage and prod.

## Verify / done means

All four URLs answer:
`https://<repo>-web-console-next-{stage,prod}.<subdomain>.workers.dev`
plus the edge health endpoints. **This is the "working baseline" moment**
— after this phase the product is live end-to-end.

## Troubleshooting

- **Smoke fails right after the very first deploy**: a brand-new
  workers.dev route can 4xx for a few seconds — the deploy lane's smoke
  already retries ~75s (stack-tectonic ≥ 0.18.1); a persistent failure is
  real. Check the console's build output in the lane log.
- **Console up, edge probes fail**: re-run `05-edge`; the console is static
  assets and can be "up" while the API behind it is not.

## Example commands

From the baseline checkout:

```bash
orun new --blueprint repo-blueprint.yaml --out $HOME/sourceplane/acme \
  --run-hooks --phase 06-console --values ~/acme.values.yaml
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §2): clone the
baseline at a tag and run the same command, with `ORUN_TOKEN` +
`GITHUB_TOKEN` exported:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme \
  --run-hooks --phase 06-console --values /work/acme.values.yaml
```

Preview with zero side effects: drop `--run-hooks` — the phase places files
and stops, with no repo, no landing, no convergence watch and no probe. Add
`--status` to derive every phase's state and write nothing at all.
Re-running a completed phase is always safe (idempotent): the placement is a
no-op, the landing finds nothing, and the `await` hooks re-assert.

On success the baseline is LIVE end-to-end: the verify step probed the
console roots and the edge health endpoints on both environments.

## Next

Optional [Phase 07 — domain](07-domain.md), or stop here — the
baseline is live. Post-baseline: seed runtime worker secrets
(`orun secrets set <KEY> --org <ws> --env <env>`; wire-now-seed-later,
nothing blocks on them) and ship normal PRs.
