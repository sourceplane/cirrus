# Bootstrap timings — what to budget, and where the numbers come from

**Measured, once.** Every number in the first table is from one bootstrap of
`baseline-v13` on 2026-10-12 — `pullely/cirrus-v13-test`, built with
`orun baseline new --local --run-hooks` from a laptop into workspace
`ws_51KPRRCJ`, GitHub-hosted runners, `max-parallel: 16`. One run is a
measurement, not a distribution: treat each figure as "what it took that
day", and replace it when a rehearsal produces a better one. The per-phase
`expectedMinutes` in `repo-blueprint.yaml` are these figures rounded up.

Before v13 this file was inherited from Lumen and estimated; that history is
kept at the bottom, because the defects it lists are still the ones a fresh
product hits.

## Per-phase wall-clock (baseline-v13, measured)

Phase time is what the engine narrated at the end of each phase: from the
phase's first hook to its `done`. The convergence column is the `push: main`
run that phase's landing triggered, from GitHub's timestamps.

| phase | time | convergence on main | dominated by |
|---|---|---|---|
| 01 scaffold | **1m01s** | 27s (no components yet) | blueprint render + rebrand · repo push · workspace link |
| 02 foundation | **4m19s** | 3m18s | 13 packages built in parallel · Terraform for D1 + KV (seconds) · `db-migrate` |
| 04 workers | **8m29s** | 6m59s, 49 jobs | the twelve workers deployed AT ONCE on stage and prod (every worker-to-worker binding stripped) — no 6-deep chain |
| 05 edge | **~9m** (see below) | 8m22s to the last green worker; console deploys end at +8m23s | the bindings restored and the fleet redeployed · api-edge · the console builds (the long pole) |
| 07 domain | not run | | `when: inputs.domain` was false |
| 08 docs | **~3m** | 38s (docs only, zero lanes) | probe 4 URLs · render · one landing · `promotion.mjs --restore` |
| **total, happy path** | **~26 min** | | 01 start 20:20 → 05 done 20:44 → 08 done +3m |

Each landing PR's CI ran **only `plan`** (16–19s): `ci.yml` skips the `run`
lanes on `orun/BASE-*` pull requests, and the landing merged as soon as it
was green. Stage and prod deployed side by side throughout: `intent.yaml`
carried `# @promotion-deferred` from 01 until 08 put `prod.promotion` back.

**What `~9m` for 05 means.** The landing opened at 20:34:49 and every
worker and the API edge were green on stage and prod by 20:41:33. The two
console deploys then failed their smoke at 20:43:49 — not a baseline fault:
the build was run from the CLI without `--set subdomain=`, so the console
probed `…your-workers-subdomain.workers.dev`. Had the input been supplied,
05 ends at 20:43:49, which is the 9m above. What actually happened costs
more and is the second table.

## What the same run cost with the mistake in it

| | wall-clock |
|---|---|
| 05's watch hook re-running the two console jobs (`resumeBudget: 3`, each attempt ~3m) | 10m, all red |
| corrective commit on main (subdomain in 5 files) and its convergence (3 components × 3 envs) | 5m22s |
| `--resume` to run 08 | 3m |
| **total, as run** (20:19:54 → 21:04:25) | **44m31s** |

Two things follow, both landed with this document:

1. `subdomain` is now a **required** input with no default. The placeholder
   default made a CLI build without it legal and then red forty minutes in.
   The console always collected it; the CLI now refuses up front.
2. The rehearsal (`testing/rehearsal/`) now resolves the rehearsal account's
   subdomain beside its account id and passes `--set subdomain=`. Without
   that, the nightly would have died at 05 the same way.

## How the numbers were taken

- Phase times: the `done` narration lines in the build log (`--progress
  plain`), which the engine stamps with the phase's elapsed time.
- Convergences: `gh run list` / `gh api …/actions/runs/<id>/attempts/<n>` on
  the product repository. The Orunbase MCP (`runs_list`, `runs_get`) is the
  intended source for per-job detail; it was disabled in this session's
  connector settings, so GitHub's own timestamps stand in. They agree with
  the narration to within a few seconds.
- Nothing here was taken from the umbrella's output — there is no umbrella
  since BE4.

## Things that shape the total

1. **One convergence per landing.** A phase's `orun.pr/land@v1` merges as
   soon as `plan` is green: the phase content comes from the PINNED baseline
   and was verified there, so PR `run` lanes would deploy the fleet a second
   time. The `orun.run/watch@v1` await hook is the gate.
2. **The watch hook's retries are not free.** `resumeBudget: 3` re-runs
   failed jobs three times before giving up. Right for a transient; for a
   deterministic failure (a wrong input, a missing binding) it is ten minutes
   of the same red. Read the first attempt's log before letting it spend them.
3. **Watch GitHub Actions billing.** A full bootstrap is hundreds of runner
   minutes (the fleet run alone is 49 jobs). A tripped spending limit presents
   as lanes that "fail" with NO logs anywhere — the message lives only in the
   check-run ANNOTATIONS (`gh api repos/<o>/<r>/check-runs/<job-id>/annotations`).
4. **Mint `ORUN_TOKEN` per phase** — it is short-lived (~30m). The container
   contract in BOOTSTRAP.md §2 covers this.
5. **A converge that follows a commit touching NO components** plans zero
   lanes and reads "green" in under a minute (01 and 08 above). The phase's
   verify step is the real gate; never trust a green run without it.
6. **`git push` must go as the account `gh` is signed in as.** The land hook
   pushes over the remote the scaffold wrote; when the SSH key belongs to a
   different GitHub account, route it through gh's credential helper for the
   build only: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf
   GIT_CONFIG_VALUE_0=git@github.com:` in the environment of `orun baseline new`.

## Inherited defect log

These were found and fixed during Lumen's measured bootstraps. They are
listed so nobody re-hits them — every one is already landed in the shared
flow scripts this baseline carries.

| fix | what broke on a fresh product |
|---|---|
| #50 | `secret://` refs: segment 1 is the WORKSPACE — the repo-slug rebrand rewrote both segments; every resolve failed `Validation failed` |
| #52 | `cloud check` passes without the LOCAL link cache (fresh HOME) — preflight now links unconditionally |
| #53 | the workspace-slug self-heal dirtied the tree before its own clean-tree check |
| #54 | later phases branded fresh baseline content with the product's scaffold-era rebrand copy — the tool now always runs from the pinned baseline |
| #56/#57 | phase 03's PR lanes are structurally red on first boot → `--no-wait` landing |

And what the workspace-scoped (`sk_`) token path surfaced, all fixed:

1. `sk_` tokens see NO memberships list → slug resolution needs
   `orun workspace <ws>` (v2.52.1) — the direct org read.
2. `sk_` tokens cannot write repo links → the intent must declare
   `project:` (the scaffold writes it; preflight self-heals).
3. Intent declares the project SLUG; config-surface and state routes take
   `prj_…` ids → CLI-side slug resolution (v2.52.2 secrets, v2.52.4 run).
   The lane pin in `ci.yml` must be ≥ v2.56.2 (the phase overlay's floor was
   v2.56.0; v2.56.2 is where a branded tree stopped refusing its next phase).
4. Step `timeout:` didn't kill grandchildren — a wedged git held the step's
   pipes past its deadline → process-group kill + WaitDelay (orun v2.52.3).
5. git has NO transfer timeout → `http.lowSpeedLimit/Time` on every flow git.
6. git's credential `store` fires EVERY configured helper (system
   osxkeychain included) → in a keychain-less HOME securityd can raise a
   BLOCKING dialog on the console user's screen, hanging the step until a
   human clicks. Get-only credential helper everywhere.
