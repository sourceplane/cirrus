# Phase 04 — workers

Lands the **database migrations** and the **12-worker fleet**
(`repo-blueprint.yaml`, phase `04-workers`) in two
landings: first with the service-binding feedback edges stripped so
first-boot workers can deploy in DAG order, then a restore landing once
every worker they point at exists.

## What it lands

`infra/db-migrate` — the migration runner, applied to the D1 database phase 03
created; it plans on the PR (the database id exists by now) and applies after
the merge, ahead of the workers that read the schema.

`apps/`: `policy-worker`, `membership-worker`, `events-worker`,
`projects-worker`, `identity-worker`, `config-worker`, `webhooks-worker`,
`notifications-worker`, `metering-worker`, `admin-worker`,
`billing-worker`, `integrations-worker` — plus their test components.
Each worker's deploy renders its committed `wrangler.template.jsonc`
(`@@wiring(...)@@` tokens) from the `WIRING_*` secrets phase 03 published,
and reads its own runtime keys wire-now-seed-later (inert until seeded).

## Why two landings

`billing → membership → notifications` form acknowledged service-binding
feedback edges: deploying any of them first-boot with the binding present
fails (the target worker does not exist yet, Cloudflare error 10143).
`tooling/bootstrap/cycle-break.mjs`:

- `--strip` removes exactly those edges (byte-preserving markers) before
  the first landing — the fleet deploys clean in DAG order;
- `--restore` puts them back byte-for-byte for the second landing, when
  every target exists.

Both are idempotent; `--check` reports the current state.

## Inputs

`--out` is the product repo. The blueprint's required inputs — `reponame`,
`productname`, `productdomain`, `githuborg` — are validated before any phase
runs, so pass them on every invocation (a `--values` file beats repeating
`--set`); everything else this phase needs it reads back from the placed
tree. See [the phases README](README.md).

## Steps

1. **requires.probe** — `orun.secrets/exists@v1` asserts both
   `WIRING_CLOUDFLARE_D1` and `WIRING_CLOUDFLARE_KV` are published before a
   single file is placed. Missing keys mean `03-infrastructure` did not
   finish, and the phase says which.
2. **place** — this phase's modules, then a `post` hook runs
   `tooling/bootstrap/cycle-break.mjs --strip`.
3. **land** — PR `feat(workers): the migrations and the twelve-worker fleet,
   feedback edges stripped`; the PR's verify lanes are plan/build-only.
4. **converge** — the merge deploys the fleet (longest phase; budget 90m,
   auto-resumed ×3). Lanes resolve their `WIRING_*` secrets at claim time.
5. **`04-workers-restore`** — a phase of its own, requiring `04-workers`:
   `cycle-break.mjs --restore`, second PR, second convergence. It places no
   files, and it is a phase because it is a separately landable unit of the
   bootstrap with its own task and its own PR — which is what a phase is
   here.

## Verify / done means

Both convergence runs green: every worker deployed twice (stripped, then
with full bindings) and its smoke passed (smoke retries ~75s over
first-deploy workers.dev propagation — stack-tectonic ≥ 0.18.1).

## Troubleshooting

- **Lane fails resolving `WIRING_*`**: `03-infrastructure` incomplete — both
  its own `await` verify and this phase's `requires.probe` assert these;
  re-run `03-infrastructure`.
- **Cloudflare 10143 (service binding target not found)** during the
  FIRST landing: the strip did not cover an edge — `node
  tooling/bootstrap/cycle-break.mjs --check` in the product repo; if a new
  feedback edge was introduced, add it to `FEEDBACK_EDGES` (kept in sync
  with the acknowledged-cycles test).
- **Convergence trips on runner starvation / resolve throttling**: that is
  what the auto-resume is for; a genuinely red lane stays red across
  resumes — read that lane's log.

## Example commands

From the baseline checkout:

```bash
orun new --blueprint repo-blueprint.yaml --out $HOME/sourceplane/acme \
  --run-hooks --phase 04-workers --values ~/acme.values.yaml
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §2): clone the
baseline at a tag and run the same command, with `ORUN_TOKEN` +
`GITHUB_TOKEN` exported:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme \
  --run-hooks --phase 04-workers --values /work/acme.values.yaml
```

Preview with zero side effects: drop `--run-hooks` — the phase places files
and stops, with no repo, no landing, no convergence watch and no probe. Add
`--status` to derive every phase's state and write nothing at all.
Re-running a completed phase is always safe (idempotent): the placement is a
no-op, the landing finds nothing, and the `await` hooks re-assert.

This is the longest stretch of the bootstrap (two landings, two
convergences — ~25m across `04-workers` and `04-workers-restore`). A
convergence that trips resumes itself up to 3×; a failed phase run resumes
by re-running the same command with its own `--phase`.

## Next

[Phase 05 — edge](05-edge.md).
