# 01-scaffold — the repo is born

**Lands:** the root manifests (`intent.yaml`, `package.json`, `turbo.json`,
`kiox.yaml`, both lockfiles, `.gitignore`, `README.md`), the whole `.github`
directory, `tooling/{tsconfig,eslint,wire}`, the two context pages a product
owns (`ai/context/operations.md`, `ai/context/deployment.md`), the empty
discovery roots, and `.rebrand/values.json` — the identity file every later
phase reads back.

**Creates the repository.** `orun.repo/ensure@v1` runs in this phase's `post`
hooks, before the landing, because there is nowhere to land a pull request
until it exists. Pre-created repos are supported: the action finds rather than
creates.

## The GitHub consent comes first

`requires.probe` waits on the GitHub App installation for `githubOrg` — up to
ten minutes — **before a repository is created**. The platform learns of a
pull request only through the installation on the account that OWNS the
repository. A workspace connected to some other account passes "github is
connected" and then files none of the product's landings.

## The identity chain

`rebrand.mjs` enumerates the tree with `git ls-files`, so the output has to be
a git repo with a populated index before it runs:

1. `git init -q`, `git add -A` — staging only; the landing makes the commit.
2. `rebrand.mjs --values .rebrand/values.json --allow-dirty`.
3. `orun-workspace` — rewrites `intent.yaml`'s `workspace:` line. rebrand
   classifies the orun state backend as org-owned and leaves it alone, so
   without this the product's CI would claim the BASELINE's workspace on
   every remote op.
4. `git add -A` again, then `rebrand.mjs --verify`.
5. `pnpm install --lockfile-only`.

## Verified by

The repository exists under `githubOrg`, `main` is its default branch, and
`rebrand --verify` passes. `testing/placement.test.sh` proves this offline,
with no workspace and no provider.
