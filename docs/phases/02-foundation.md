# Phase 02 — foundation

Lands the **13 shared packages** (`repo-blueprint.yaml`, phase `02-foundation`) that
everything later builds on. Nothing deploys and no provider connection is
needed — the PR's verify lanes (turbo builds + tests) are the whole gate.

## What it lands

`packages/`: `cli`, `contracts` (+tests), `db` (+tests),
`notifications-client` (+tests), `policy-engine` (+tests), `sdk`,
`shared`, `testing`, `webhook-verifier` — each a `turbo-package` component
whose lanes build and test it in CI.

## Inputs

`--out` is the product repo. The blueprint's required inputs — `reponame`,
`productname`, `productdomain`, `githuborg` — are validated before any phase
runs, so pass them on every invocation (a `--values` file beats repeating
`--set`); everything else this phase needs it reads back from the placed
tree. See [the phases README](README.md).

Identity comes from the repo's `.rebrand/values.json`, written once by
`01-scaffold`.

## Steps

1. **place** — the engine writes this phase's modules into `--out` and
   archives the provenance lock. The tree was branded once by
   `01-scaffold`, so these files land already speaking the product's name.
2. **land** — `orun.pr/land@v1` (a `post` hook): PR
   `feat(foundation): the thirteen shared packages`, waits for its verify lanes,
   merges.
3. **converge** — `orun.run/watch@v1` (an `await` hook) waits for the main
   convergence run and auto-resumes transient lanes ×3.
3. **converge** — waits for the merge's main run (verify lanes again on
   main; auto-resumed through transients).

## Verify / done means

The main convergence run is green — every package builds and its tests
pass in the product repo.

## Troubleshooting

- **PR lanes fail building a package**: the baseline's packages are
  self-contained; a failure here usually means a partial apply (re-run the
  phase — apply is additive) or a pnpm lock drift (the scaffold carries
  the lock; don't regenerate it mid-phase).
- **The landing picks up edits you did not intend**: commit or stash your
  local changes in the product repo before running a phase. `orun.pr/land@v1`
  lands what is in the tree, and a phase is meant to land its own modules,
  not your work in progress.

## Example commands

From the baseline checkout:

```bash
orun new --blueprint repo-blueprint.yaml --out $HOME/sourceplane/acme \
  --run-hooks --phase 02-foundation --values ~/acme.values.yaml
```

Headless (fresh container / no checkout — see BOOTSTRAP.md §2): clone the
baseline at a tag and run the same command, with `ORUN_TOKEN` +
`GITHUB_TOKEN` exported:

```bash
export ORUN_TOKEN="$(orun auth token | tail -1)" GITHUB_TOKEN=…
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cirrus
cd cirrus
orun new --blueprint repo-blueprint.yaml --out /work/acme \
  --run-hooks --phase 02-foundation --values /work/acme.values.yaml
```

Preview with zero side effects: drop `--run-hooks` — the phase places files
and stops, with no repo, no landing, no convergence watch and no probe. Add
`--status` to derive every phase's state and write nothing at all.
Re-running a completed phase is always safe (idempotent): the placement is a
no-op, the landing finds nothing, and the `await` hooks re-assert.

## Next

[Phase 03 — infrastructure](03-infrastructure.md).
