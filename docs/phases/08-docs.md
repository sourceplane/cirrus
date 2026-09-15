# Phase 08 — docs (record the live deployment)

Turns the freshly-live baseline into **documented, agent-readable state**:
renders the product's deployment manifest from VERIFIED facts and lands it
on main. After this phase, a human — or an agent reading the repo through
the Orun MCP surface — can answer "what is deployed, where, and how do I
operate it" from the repository alone.

## What it writes (in the product repo)

| file | content |
|---|---|
| `ai/context/deployment.md` | REGENERATED manifest: live URLs with probe results, workspace/project identity, secrets inventory **by name only**, integration statuses, baseline provenance, CI lane pin |
| `ai/context/operations.md` | the standing operating contract (architecture, tenancy resolution, deploy pipeline, secrets model, verification, troubleshooting). Healed from the baseline template when the product predates it; never rewritten after that |
| `README.md` | the section between `<!-- 08-docs:begin -->` / `<!-- 08-docs:end -->` markers is replaced (markers are appended for READMEs that predate them) |

No secret VALUE is ever read or written — inventories are names/statuses.

## Steps

1. **preflight** — workspace readiness (same gate as every phase).
2. **docs** — `common/render-deployment-docs.sh`: probes the four public
   URLs (plus the custom domain when `productdomain` is set), lists
   secrets/integrations by name, renders the files above.
3. **land** — `common/push-main.sh`: a docs-only push plans ZERO deploy
   lanes, so there is no convergence to watch.
4. **verify** — asserts no `TBD_08DOCS` placeholder survived **in the
   committed tree**, the manifest is on main, and the URLs it claims are
   actually live (`verify-endpoints.sh edge console`).

## When to run (and re-run)

- Right after [phase 06](06-console.md) — the "working baseline"
  moment — to record it.
- Again after [phase 07](07-domain.md) so the manifest picks up
  the custom-domain URLs.
- Any time later as a **live-state refresh**: it is fully idempotent; the
  manifest is regenerated from scratch on every run and carries its own
  render timestamp.

## Inputs

`--out` is the product repo. The blueprint's required inputs — `reponame`,
`productname`, `productdomain`, `githubOrg` — are validated before any phase
runs, so pass them on every invocation (a `--values` file beats repeating
`--set`); everything else this phase needs it reads back from the placed
tree. See [the phases README](README.md).

## Example commands

From the baseline checkout:

```bash
orun new --blueprint repo-blueprint.yaml --out $HOME/sourceplane/acme \
  --run-hooks --phase 08-docs --values ~/acme.values.yaml
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §2): clone the
baseline at a tag and run the same command, with `ORUN_TOKEN` +
`GITHUB_TOKEN` exported:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme \
  --run-hooks --phase 08-docs --values /work/acme.values.yaml
```

Preview with zero side effects: drop `--run-hooks` — the phase places files
and stops, with no repo, no landing, no convergence watch and no probe. Add
`--status` to derive every phase's state and write nothing at all.
Re-running a completed phase is always safe (idempotent): the placement is a
no-op, the landing finds nothing, and the `await` hooks re-assert.

## Troubleshooting

- **verify fails on a URL** — the manifest is honest: something the docs
  would claim live is not. Re-run phase 05/06's verify to localize.
- **secrets/integrations listed as "unavailable to this credential"** —
  the runner's token cannot list that rung; the manifest still renders
  (URLs and identity are the load-bearing parts). Re-run with a
  fuller-scoped credential to enrich it.
