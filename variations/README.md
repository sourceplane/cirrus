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
# 1. Materialize: product-only baseline files + overlay, rebranded, verified.
tooling/variations/materialize.sh <name> ~/sourceplane/<name> --verify

# 2. Create the repo (this baseline's tooling cannot: repo creation needs a
#    credential with `repo` scope on the org).
gh repo create sourceplane/<name> --private

# 3. Push.
cd ~/sourceplane/<name>
git remote add origin git@github.com:sourceplane/<name>.git
git push -u origin main
```

Then, to deploy: set `execution.state.workspace` in `intent.yaml` to the
product's Orun Cloud workspace, allow-list the repo in that workspace, connect
Cloudflare, and merge to `main`.

`--verify` runs `pnpm install`, renders the wrangler fixtures, and runs build,
typecheck and the test suite in the materialized repo. Drop it for a fast
materialize with no checks.

## Changing a variation

Develop in a checkout of this baseline (so the product's code sits next to the
platform it uses), then re-derive the overlay:

```bash
tooling/variations/extract.sh <name> /path/to/working-copy
```

`extract.sh` records every file that differs from the working copy's `HEAD`,
which is why the working copy should be a clean clone of this baseline with
only the variation's own changes on top.
