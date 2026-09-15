# tests/flows — the bootstrap flows' contract tests

A quick-check component that runs the two contract tests under
`flows/testing/` in this repository's CI (saas-baseline-tracking BT6):

- `track.test.sh` — `flows/common/track.sh` over a fake `orun`: a first
  run creates epic + milestone + task, a second run creates nothing and
  prints the same handles, a second landing is a second task in the same
  milestone, an old binary degrades to "untracked" with one line.
- `land-pr.test.sh` — `flows/common/land-pr.sh` / `push-main.sh` over a
  fake pen and a fake `gh`, bare-repo remotes: a tracked landing goes
  through the pen (grammar branch, trailer, body, label, back on a pulled
  main), an untracked landing is the old path, a refused pen merges the
  `orun/…` branch directly, a bad suffix lands untracked, `push-main
  --task` takes the pen.

- `phase-vars.test.sh` — a static read of every phase workflow: no shell
  function may assign to a step's path handles (`out`, `L`, `P`, `W`,
  `slug`, `remote_url`), because functions share the step's variables and a
  rebind corrupts everything after it with no error where the mistake is.
  Phase 01's `push_main` assigned the git push transcript to `out`, the
  product repo directory, and `land-pr.sh "$out"` then ran `cd` on a
  transcript. Also checks that `land-pr.sh` refuses a non-directory first
  argument with a one-line diagnosis instead of a raw `cd` failure.

- `manifest.test.sh` — `blueprint.yaml` against the flows that realize it:
  `secrets` against `create-secrets.sh`'s own `create` calls, `programme`
  against the umbrella's `ensure-milestone` calls (including the `07-domain`
  condition and the `epicslug` default), inputs v3 — every input carries a
  `pattern`, `askedBy` is refused, and `from`/`derive`/`probe` are one source
  not three — every declared input against the umbrella's own `inputs` (orun's
  flow engine fails closed on an undeclared `--set`), each `derive` against the
  second implementation of the same rule in `tooling/rebrand/rebrand.mjs`,
  declared paths against the tree, and `verify` placeholders against the
  inputs. Refuses `spec.source.tag` outright. Every check compares
  the manifest to a script, never to another copy of the same claim — that is
  how a stale tag survived three releases and four tests in this directory.
  Needs PyYAML alongside python3.

- `placement.test.sh` — Tier 1's placement half (BE5b). Places the whole
  blueprint from `tests/fixtures/acme.json`, asserts the repo-scale gate that
  rides inside `orun new` actually ran, brands the tree as `01-scaffold`'s
  hooks do, runs `rebrand.mjs --verify`, applies the leak rules to the REAL
  files, checks the product's `DEFAULT_API_URL` against `blueprint.yaml`'s
  `derive`, then runs phases 01 → 07 with the rebrand in the middle and a
  `--resume` afterwards. Needs orun (≥ v2.56.2), node and git; about ten
  seconds, offline. Run against v2.56.1 it reports seven failures.

> **Where these actually run in CI.** Not here. This component's
> `quick-check` profile runs setup, install and a package-structure check and
> no tests — observed on a live lane reporting `4 passed, 0 failed` with no
> test among them. The suite runs as the `flows-contract` job in
> `.github/workflows/ci.yml`, which is what can fail a pull request. This
> component stays for `pnpm --filter @saas/flows-tests test` locally.

`bash`, `python3`, `git` — no network, no credential. Run locally with
`pnpm --filter @saas/flows-tests test` or the scripts directly. This
component is the baseline's own and never ships to a product.
