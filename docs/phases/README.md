# The phases — one blueprint, nine selections

`repo-blueprint.yaml` declares nine phases that take a product from
**nothing** to a **live, documented baseline**. Run them one at a time at
your own pace with `--phase <name>`, or run the whole sequence unattended
with `--resume`. There is no umbrella workflow and no per-phase document:
a phase is a selection on one artifact, which is what makes running one
alone, months later, from a fresh container the same operation as running
them all.

Each phase follows the same contract:

> **place its modules → land them as a PR (merged immediately — the
> convergence is the gate) → watch the deployment convergence
> (auto-resumed) → verify it is actually deployed.**

Run from the baseline checkout (the blueprint's source is `path: .`); the
product repo is wherever `--out` points.

## Execution order

The phase number is the EXECUTION order — the root scaffold must exist
before anything else can build or deploy. Each phase's `requires.phases`
states this in the document, and the engine refuses a phase whose
predecessor is not placed, naming it.

Every phase lands as a pull request that is verified, then merged: each landing waits for its PR's own CI to finish green (the product's PR runs carry remote state, so lanes that need secrets resolve them on the PR too), and the convergence after the merge is still watched.

| phase | lands | verified by |
|---|---|---|
| [`01-scaffold`](01-scaffold.md) | **GitHub repo created** + repo born: intent, CI, tooling, identity | repo pushed + workspace-linked |
| [`02-foundation`](02-foundation.md) | 13 shared packages | verify lanes green |
| [`03-infrastructure`](03-infrastructure.md) | d1, kv | published `WIRING_*` secrets |
| [`04-workers`](04-workers.md) | db-migrate + the 12-worker fleet, service bindings stripped | convergence green |
| [`04-workers-restore`](04-workers.md) | the bindings put back | convergence green |
| [`05-edge`](05-edge.md) | api-edge | `/health` 200 on stage+prod |
| [`06-console`](06-console.md) | web console | console + edge live |
| [`07-domain`](07-domain.md) | custom domain (OPTIONAL — `when: inputs.domain`) | convergence green |
| [`08-docs`](08-docs.md) | live-deployment docs (manifest + operating contract) | committed manifest matches probed reality |

## Inputs

`01-scaffold` takes the product identity once and writes it into the repo
(`.rebrand/values.json`); every later phase reads it back from the placed
tree. But the blueprint's **required** inputs — `reponame`, `productname`,
`productdomain`, `githuborg` — are validated before any phase runs, so
they must be supplied on every invocation, single-phase ones included. A
`--values` file is easier than repeating `--set`.

The three the phases used to carry as per-workflow inputs are blueprint
inputs now, which is how the console can render a form from this document
alone:

- `orunWorkspace` — workspace id (`ws_…`). Empty writes a placeholder that
  fails loudly rather than silently cross-tenanting.
- `epicSlug` (default `infra-baselining`) — the epic every phase clubs its
  task under. Found by slug, so a fresh run and a resumed run find the same
  work.
- `domain` (default `false`) — whether to run `07-domain`. It needs the
  Cloudflare zone to already exist, so it is off unless asked for; the
  phase carries the condition as its own `when:`.

```bash
orun new --blueprint repo-blueprint.yaml \
  --out $HOME/sourceplane/acme --run-hooks --phase 03-infrastructure \
  --values ~/acme.values.yaml
```

Drop `--run-hooks` (or add `--status`) to preview. Without it a phase
places files and stops: no repo, no landing, no convergence watch, and no
probe — which is exactly what makes a dry instantiation of this baseline
possible in CI with no workspace and no provider.

## Headless / container mode

A fresh container with two env tokens is the entire contract (see
[BOOTSTRAP.md §2](../../BOOTSTRAP.md)). Clone the baseline at a tag and the
tag pins everything: the blueprint, its modules, and the scripts its hooks
run all come from that one commit, and orun pins the checkout by digest
into its object store before any module is read.

```bash
export ORUN_TOKEN=… GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme --run-hooks \
  --phase 03-infrastructure --values /work/acme.values.yaml
```

Inside a baseline checkout the same command uses the local tree: the two
modes are the same files.

## Unattended: `--resume`

`--resume` places every phase not already derived as done, in dependency
order, honouring each barrier. Expected wall-clock on a clean run:
**~50–65 minutes** (the two worker landings dominate; the Cloudflare-only
data plane creates in seconds, which is where this baseline buys back its
time).

Why it can run unattended:

- **Idempotence, everywhere.** Landings and the convergence watch fall back
  to plain REST when `gh` is degraded, smokes retry route propagation
  (~4.5 m), OCI resolves retry transient 5xx, and `orun.run/watch@v1`
  auto-resumes failed lanes ×3 (`resumeBudget: 3`). A phase that failed
  partway resumes by simply being re-run.
- **Waits are declared, not slept.** `03-infrastructure` waits on the
  provider consent through `orun.doctor/check@v1` (up to 10 minutes), and
  `04-workers` will not start until `orun.secrets/exists@v1` finds both
  `WIRING_*` keys. A consent nobody has clicked is a *wait*, not a failure.
- **Verification is the phase's own last act.** `await` hooks re-probe the
  live endpoints and re-list the published secrets, trusting no earlier
  step's word.

## Pacing, idempotence, resume

- Run one phase today and the next whenever. Nothing expires between
  phases; each phase re-derives its own preconditions.
- **Phase state is derived from the tree, never stored.** Nothing in
  `--out` records which phases have run. A stored file would be a cache,
  and it must always be safe to delete.
- A phase whose files are all present but differ from the blueprint derives
  as **`drifted`** — which is every phase once `01-scaffold` brands the
  tree. Drift SATISFIES a successor's requirement (the files are all
  there), and `--resume` leaves a drifted phase placed rather than
  reverting your product's identity to `cirrus`. Re-place one deliberately
  with `--phase <name>`.

## Prerequisites (once)

1. `orun auth login --device` (approve at app.orun.dev/cli/device).
2. A workspace for the product; note its `ws_…` id.
3. The two integrations connected in that workspace — GitHub and
   Cloudflare. `03-infrastructure` POLLS for these up to 10 minutes, so
   you can click the consent while it waits.
4. An **admin-role** API key. Note that the first credential WRITE is now
   `03-infrastructure`'s secret reconcile: a builder/viewer key gets
   through `01-scaffold` and `02-foundation` and dies at phase three with
   the re-mint-as-admin hint. The shell layer probed this at minute two;
   restoring an early write-probe as a declared precondition is tracked as
   the epic's open question 14.

## The mechanism, as typed actions

Everything the phases do that is not placing files is a **typed action** —
a closed registry inside the orun binary, not a script this repo ships:

| action | role |
|---|---|
| `orun.task/ensure@v1` | the phase's own task in the workspace's task plane: find-or-create by identity under `epicSlug`, contract attached from `tasks/<phase>.TaskContract.yaml`. Never blocks a landing |
| `orun.repo/ensure@v1` | create the product repo under `githuborg` if it does not exist (pre-created is supported) |
| `orun.pr/land@v1` | commit → branch → PR → wait for checks → merge → back on main, through the provenance pen so the landing binds to the phase's task |
| `orun.run/watch@v1` | wait for the main convergence run; auto-resume through transient failures (`resumeBudget: 3`) |
| `orun.doctor/check@v1` | the provider-consent wait — a precondition, not a preamble |
| `orun.secrets/exists@v1` | assert the keys a later phase reads are published |
| `orun.integrations/reconcile@v1` | bring the brokered provider secrets to their declared state: keys that exist are KEPT, keys that are missing are minted against the ACTIVE connection. It never holds a value — a brokered secret is a pointer at a connection and a scope template |
| `orun.http/probe@v1` | probe the live `/health` and console URLs |

Ten hooks still `run:` a command, and those are the ones that are this
baseline's own business rather than a verb any bootstrap needs: git init /
stage / restage and `pnpm install --lockfile-only` in `01-scaffold`,
`tooling/rebrand/rebrand.mjs` (the identity rename, then `--verify`),
`tooling/bootstrap/cycle-break.mjs` (strip and restore the service bindings
across the two worker landings), and `hooks/render-deployment-docs.sh`
(`08-docs`'s renderer). Each resolves the baseline checkout as
`{{ .baseline.dir }}`, so a pinned clone pins them too.

## Tracking the bootstrap as work (BT)

Every phase's `pre` hook is an `orun.task/ensure@v1` that clubs a task
under the `epicSlug` epic with the phase name as its milestone, so a run
that starts fresh and a run that resumes find the same work. The contract
templates live in `tasks/` at the repo root, one per landing, named by the
hooks' `contract:` field. `gates: []` is a declaration: merge alone
finishes the task, because the main convergence is the gate the phase
*watches*, not one the plane observes as a PR check. The templates are
baseline machinery, never product content. The whole design:
`specs/epics/saas-baseline-tracking/`.

## Why there is one document

Until BE1 each phase folder carried a `blueprint.yaml` slice derived by
`tooling/blueprint/split-phases.py`, and the derivation had to PRUNE every
cross-phase `dependsOn` edge, because a slice that names a module in
another slice does not parse.

The prune is what is really gone. orun's phase overlay enforces the same
barrier by REFUSING a dependency that points forward across it, and a
refusal and a deletion are not the same thing — the splitter was deleting
`shared`'s `dependsOn: [bootstrap]`, an edge to a module that does not
exist and never has, for as long as it ran. A pruned edge to a module in
no phase looks exactly like a pruned edge to a module in an earlier one.
