# saas-baseline-tracking — Risks & Open Questions

Live register. Remove entries when resolved; record the decision in
`IMPLEMENTATION-STATUS.md`.

## ⛔ Human-input gates (do NOT auto-pick)

| Item | Blocking decision | Unblock signal |
|------|-------------------|----------------|
| **BT0 in the sandbox — the `orun` binary** | The sandbox agent reaches the MCP roster through the Go `orun` binary, which vendors orun-cloud's `packages/mcp/tool-manifest.json` and is parity-tested against it. BT0 changed the manifest (31 → 33 tools, a wider `task_create`); the binary must ship a release that serves it before BT5's Step 1b works over MCP. Until then the agent's MCP has no `epic_create`. | An `orun` release note naming the 33-tool manifest; `orun mcp tools` in a sandbox lists `epic_create`. BT5 is written to skip Step 1b when the tools are absent, so BT1–BT4 do not wait on this. |
| **The API base URL from the flows** | `track.sh` needs the Orun Cloud API (api-edge) that the CLI talks to. The flows inherit `ORUN_BACKEND_URL`; the sandbox sets `ORUN_CLOUD_API`. Which one is api-edge in every environment (local checkout, headless CI, sandbox) has to be confirmed, not assumed — a wrong base URL degrades to "untracked" silently by design. | An operator confirms the variable per environment; BT1 records the resolution order in `track.sh`'s header and `flows/phases/README.md`. |
| **`task.write` for the run's principal** | Owner/admin/builder roles carry `task.write`; the bootstrap door lends admin for the session, and the operator runbook requires an admin API key. A viewer/builder-below-admin key would land untracked. Decide whether an untracked headless bootstrap is a warning (current lean) or a failure. | Decision recorded; `track.sh`'s refusal line names the role to grant. |

## Open design questions

| Item | Question | Current lean |
|------|----------|--------------|
| Epic slug per workspace | `infra-baselining` collides when a workspace bootstraps a second product. Adopt-by-slug would then club the second product's phases under the first product's epic. | Default `infra-baselining`; the umbrella checks the adopted epic's description names this repo and otherwise uses `infra-baselining-<reponame>` and says so. `--set epicslug=` always wins. |
| Key prefix | `BASE` reads well in a branch (`orun/BASE-3-03-infrastructure`) and leaves room for product work to mint `TSK`/`WEB` keys later. Alternative: derive from the repo name. | `BASE`, fixed — the sequence is per (workspace, prefix), so it is stable across re-runs and across products in one workspace. |
| Gates on the contract | `gates: []` lets the merge alone finish a task, which is honest for phases whose real gate is the *main* convergence run the flow watches (not a PR check). Phase 07 (`land-pr.sh` without `--no-wait`) does gate on PR checks; should its task declare them? | `[]` everywhere in BT3; revisit once `scm.check.completed` observations name the checks the plane can see on the PR head. |
| Phase 01's initial commit | `gh repo create --add-readme` adds a GitHub-templated README that the scaffold overwrites; a pre-created empty repo needs one bootstrap commit instead. Is a one-file initial commit acceptable history for a product repo? | Yes: one commit, `chore: initial commit`, replaced in `#1`. The alternative (keep the direct push, leave BASE-1 forever at `ready`) misreports the bootstrap's first and largest landing. |
| Where the agent reports | The brief's updates are chat; the rollup is a read. Should the agent also push a doc onto the epic (`PUT …/tasks/epics/<ref>/docs/<slug>`) with the completion report so it lives beside the tasks? | Yes, in BT5 as the last step — the deployment manifest (`ai/context/deployment.md`) is exactly the doc the epic should carry. Not blocking. |
| The `orun` CLI | A native `orun tasks …` / `orun epics …` command family would replace `track.sh`'s curl. It lives in sourceplane/orun. | Out of scope here; `track.sh` is written so its five subcommands map 1:1 onto such commands if they appear. |

## Standing risks

- **Ambiguity does not bind.** If a landing's PR body ever quotes a
  *different* task key on a `Task:` line (a copied body), the plane binds
  the PR to nothing and names the disagreement. `land-pr.sh` writes the
  trailer itself from the same variable that names the branch; callers
  must not pass a body that already carries one.
- **Observation lag.** The tasks-worker drains `scm.*` on a cron; a
  verdict read seconds after a merge may still say `in_review`. The
  umbrella's verify reads the rollup *after* the docs phase, minutes
  later, and treats a not-yet-`done` task as a warning with the
  observation ids it did see, never a hard failure.
- **The integration is the eye.** Binding needs the product repo's pushes
  to reach the workspace's event log — the same GitHub integration
  preflight already gates on. A repo linked after its first landings will
  have missed those observations; there is no backfill.
- **Deferred workflows.** When the push token lacks the Workflows grant,
  the `.github/workflows` follow-up push carries the task key only as a
  commit trailer (no PR), so BASE-1's evidence is the scaffold PR alone.
  Accepted: the scaffold *is* the landing; CI arriving later is the
  operator action the brief already names.
