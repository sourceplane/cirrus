# Variations

Five single-user products born from this baseline, each as an **overlay**: the
files it adds or changes, authored in baseline naming, plus the identity to
rebrand to. The register and the evidence behind the selection are in
[`../specs/variations/README.md`](../specs/variations/README.md).

| Variation | Product | Bounded context | Public surface |
|---|---|---|---|
| [`launchpad/`](launchpad/) | Product Hunt-style launch directory | `launches` | feed, product page, maker page |
| [`linkfolio/`](linkfolio/) | Creator link-in-bio page and storefront | `pages` | the creator page |
| [`streakly/`](streakly/) | Habit and streak tracker | `habits` | none (private) |
| [`subtally/`](subtally/) | Subscription and recurring-expense tracker | `subscriptions` | none (private) |
| [`pulsewatch/`](pulsewatch/) | Uptime monitor and public status page | `monitors` | the status page |

Each is built through **E4** — domain worker and data, edge and SDK, console —
and verified with `build`, `typecheck` and the full test suite. E5
(monetisation and product emails) and E6 (launch readiness) are planned in each
variation's own `specs/epics/<name>/`.

## Shape of an overlay

```
variations/<name>/
  values.json      the rebrand identity (repo slug, product name, domain)
  README.md        what the variation is and what its overlay carries
  overlay/         every added or changed file, in baseline naming
  delete.txt       paths the variation removes (absent when it removes none)
```

`_common/overlay/` is laid down for every variation: today, the credential-free
`checks.yml` that installs, renders the offline wrangler fixtures, and runs
build, typecheck and tests on every push.

## Making one real

```bash
# 1. Materialize: the blueprint's product files + overlay, rebranded, verified.
tooling/variations/materialize.sh <name> ~/sourceplane/<name> --verify

# 2. Create the repo (this baseline's tooling cannot: repo creation needs a
#    credential with `repo` scope on the org).
gh repo create sourceplane/<name> --private

# 3. Push.
cd ~/sourceplane/<name>
git remote add origin git@github.com:sourceplane/<name>.git
git push -u origin main
```

**What a product is made of is not decided here.** `materialize.sh` asks
`repo-blueprint.yaml` — `orun new --blueprint … --status --json`, the same
derivation [`testing/leak.test.sh`](../testing/leak.test.sh) gates — and copies
exactly the files the phases place. It used to carry a regex of its own, which
went on excluding `flows/` after `flows/` was deleted and copied `tasks/`,
`testing/`, `docs/phases/`, `hooks/` and the three factory workflows into every
product. There is no list to keep in step now: a file reaches a product because
a module places it or an overlay adds it, and for no other reason.
[`testing/variations.test.sh`](../testing/variations.test.sh) holds the
overlays and their identities to the blueprint on every pull request.

Three consequences worth knowing:

- **`values.json` is a set of blueprint inputs** (`reponame`, `productname`,
  `productdomain`, `githuborg`, …), the same contract as
  `tests/fixtures/acme.json`. A key the blueprint does not declare is refused.
- **A product carries no baseline specs or docs.** No module places `specs/` or
  `docs/`, so a variation that wants an epic plan or a runbook ships it in its
  own overlay.
- **The orun lanes are off until the repo is attached.** A bootstrapped product
  has a workspace before it has a commit; a materialized one does not, so
  `ci.yml`'s `plan` job is gated behind the repository variable `ORUN_CI` and
  `checks.yml` is the only lane that runs on the first push.

Then, to deploy: materialize with `--workspace <ws_…>` (or set
`execution.state.workspace` in `intent.yaml` and the workspace segment of the
`secret://` refs by hand), allow-list the repo in that workspace, connect
Cloudflare and GitHub there, set `ORUN_CI` to `true`, and merge to `main`.

`--verify` runs `pnpm install`, renders the wrangler fixtures, and runs build,
typecheck, lint and the test suite in the materialized repo. Drop it for a fast
materialize with no checks. Needs `orun` (new enough for `orun new --status`),
`python3`, `node`, `pnpm` and `git`.

## When Cirrus moves

A variation is a product of this baseline, not a baseline. When Cirrus changes,
re-materialize and push the result; the overlay is the only thing a variation
owns. An overlay file that **replaces** a baseline file is a copy taken when the
overlay was extracted, so a later change to that baseline file is not in it —
re-run `extract.sh` from a working copy rebased onto the new baseline.

## Gaps

Written 2026-10-01, when the five were first materialized into repositories of
their own (`sourceplane/launchpad`, `linkfolio`, `streakly`, `subtally`,
`pulsewatch`). Proven: each materializes from the blueprint with no factory
file, and passes install, the wrangler fixtures, build, typecheck, lint and its
tests locally; each repository's first push is green on `checks.yml`. Not
proven, or known to be missing:

- **None is attached to a workspace, so none has deployed.** Every `intent.yaml`
  says `ws_CHANGE_ME`, the secret refs name a workspace called after the repo,
  and `ORUN_CI` is unset. Each needs a workspace, the repo allow-listed in it,
  Cloudflare and GitHub connected there on the account that owns the repo, and
  then `ORUN_CI=true`. A workspace under the openproduct account is public and
  requires a public repository; all five are private.
- **They are products, not baselines.** None has a `repo-blueprint.yaml`,
  `tasks/`, `testing/` or a tag line, and nothing can be bootstrapped from one.
  Making one a baseline means maintaining a sixth factory in step with this one.
- **Re-materializing replaces history.** `materialize.sh` writes a fresh
  repository with one commit. A product that has grown commits of its own has no
  path to a newer Cirrus except extracting its changes back into the overlay
  first. `orun new upgrade` (a three-way re-render) is unexplored here.
- **A stale overlay file is not detected.** An overlay file that replaces a
  baseline file is a copy from when it was extracted; nothing compares it to the
  baseline it replaced. The five `.gitignore` copies had silently reverted a
  later change and were found by hand.
- **`checks.yml` does not lint.** `--verify` does. A lint error added in a
  product repository is not caught by that repository's CI.
- **CodeQL flags the overlays.** Five copies of
  `apps/web-console-next/src/lib/last-org.ts` raise
  `js/clear-text-storage-of-sensitive-data`, the same alert the baseline's own
  file already carries. Fix it in the baseline and re-extract, not five times.
- **Each product records a baseline commit on an unmerged branch**
  (`sourceplane/cirrus@9773bd0`). If that branch is deleted before it merges,
  the trailer names a commit GitHub may no longer serve.
- **This repository is itself not attached.** `sourceplane/cirrus` declares
  workspace `ws_4975BJ7P` and is not allow-listed in it, so any pull request
  whose plan selects a component fails every run lane with `this repo isn't
  connected to Orun Cloud yet`. That is this repository's state, not the
  pull request's change.

## Changing a variation

Develop in a checkout of this baseline (so the product's code sits next to the
platform it uses), then re-derive the overlay:

```bash
tooling/variations/extract.sh <name> /path/to/working-copy
```

`extract.sh` records every file that differs from the working copy's `HEAD`,
which is why the working copy should be a clean clone of this baseline with
only the variation's own changes on top.
