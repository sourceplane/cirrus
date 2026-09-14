# saas-bootstrap-engine (cirrus) — Implementation status

As-built. Kept distinct from the design and the plan: this file records what
shipped and every place it departed from the spec.

| Milestone | Status | Landed |
|---|---|---|
| **BE1** | ✅ Shipped | `repo-blueprint.yaml` v3: nine native phases, hooks, the slices and the splitter deleted |
| BE2 | 🗓️ Planned | the narration contract (needs BE-O6 — shipped) |
| BE3 | 🗓️ Planned | inputs v3, `askedBy` deleted (needs orun-cloud BE-K1) |
| BE4 | 🗓️ Planned | `flows/` deleted (needs BE1–BE3, BE-O5 ✅, BE-O8 ✅) |
| BE5 | 🗓️ Planned | CI tiers 0–2 |
| BE6 | 🗓️ Planned | CI tier 3 — live bootstrap, required before any `baseline-vN` tag |

## BE1 — `repo-blueprint.yaml` v3: native phases

### What shipped

**Nine phases, declared in execution order, named the way the task plane names
them.** `01-scaffold`, `02-foundation`, `03-infrastructure`, `04-workers`,
`04-workers-restore`, `05-edge`, `06-console`, `07-domain`, `08-docs`. Each
carries `title`, `expectedMinutes`, its `requires`, and its
`hooks.{pre,post,await}`. `07-domain` carries the umbrella's shell condition as
`when: inputs.domain`.

**What the splitter was hiding.** `tooling/blueprint/split-phases.py` derived
eight slices and re-mapped phase names to folders through a table inside
itself — this file declared `workspace` **last** while the folder it became,
`01-scaffold`, runs **first**. The deriving also had to PRUNE every cross-phase
`dependsOn` edge, because a slice naming a module in another slice does not
parse. That prune was deleting a real defect for as long as it ran:

```yaml
- name: shared
  dependsOn: [bootstrap]      # a module that does not exist and never has
```

orun refuses that outright (`dependsOn unknown module`), but a pruned edge to a
module in *no* phase is indistinguishable from a pruned edge to a module in an
earlier one. `packages/shared` has no workspace dependency this blueprint
declares as an edge for any package (`contracts` has the same two devDeps and
no `dependsOn`), so the edge is simply gone.

**`discovery-roots`, a new module.** orun's repo-scale gate discovers `apps/`,
`infra/`, `packages/` and `tests/`, which are empty until later phases fill
them, and a missing root is a hard gate failure.
`flows/phases/01-scaffold/workflow.yaml` created them with a `mkdir` and four
`touch`es immediately before calling `orun new`. Shell that creates a file the
tree needs in order to be valid is a module nobody wrote down.

**The identity chain moved from `hooks.postInstantiate` into `01-scaffold`'s
`post` hooks.** It was global because a one-shot instantiation has only one
end; in a phased bootstrap the end of `01-scaffold` *is* that moment.

**Three inputs came in from the flows**: `githubOrg`, `epicSlug` and `domain`
were workflow inputs on `flows/phases/*/workflow.yaml`, invisible to anything
reading this file — including the console that has to render a form for them.
They are also written into `.rebrand/values.json`, because that file is
committed and `.orun/provenance.lock` is not: a phase run months later in a
fresh container reads them back from the product repo.

**Task contracts moved to `tasks/<phase>.TaskContract.yaml`** and are named by
each phase's `orun.task/ensure@v1` hook as `contract:`.

**Deleted**: eight `flows/phases/*/blueprint.yaml`, and
`tooling/blueprint/split-phases.py`.

### Two departures from the plan

**1. `04-workers` became two phases, not "two `post` hooks".** The plan said
*"04-workers expresses its two landings as two post hooks around the existing
`cycleBreak:` declaration"*. Both halves of that turned out to be wrong.

The restore can only run **after** `04-workers` has converged — a service
binding may not name a worker that is not deployed — and `post` hooks all run
before `await`, so `strip → land → converge → restore → land → converge` is not
expressible as one phase's hook list. It is also already two landings, with two
PRs and two task contracts. Two units of work that land separately are two
phases; that is the whole of what a phase is here.

**2. There was no `cycleBreak:` declaration to express anything around.**
`repo-blueprint.yaml` has never carried that key, and the worker modules'
edges are acyclic — the cycle lives in a wrangler config a *deploy* reads, not
in the placement order, so orun's DAG has never seen it. This answers open
question 2: `cycle-break.mjs` is not an ordering workaround orun could absorb,
and it survives BE4 as a `run:` hook.

### What the hooks could not say, and the orun milestone that fixed it

BE1 was written against what BE-O1–BE-O8 actually shipped rather than against
`design.md`, and five things the design takes for granted did not exist. They
are fixed in orun **BE-O9**, which BE1 depends on:

| | Gap | Symptom for this file |
|---|---|---|
| 1 | the `with:` scope held only `hooks` | `{{ .inputs.epicSlug }}` and `{{ .phase.name }}` failed at run time |
| 2 | `orun.task/ensure@v1` took no contract | every landing would park at `in_review` forever |
| 3 | an action received only the product dir | `contract: tasks/…` could not resolve |
| 4 | a templated LIST passed through unrendered | a probe would GET the literal `{{ .inputs.repoName }}` |
| 5 | `run:` argv was not templated at all | `node tooling/rebrand/rebrand.mjs` names a path the product does not carry |

Gap 5 was already latent in this file before BE1, next to a comment explaining
that hook argv is not templated. Nothing had hit it because nothing runs these
hooks yet — `flows/` still does that work in shell, and BE4 is what flips it.

### The flows still work, and had to

BE4 deletes `flows/`; BE1 does not. So every caller was repointed rather than
removed:

- `flows/common/apply-blueprint.sh` takes a sixth argument, the phase, and
  passes `orun new --phase`. Its provenance archive is now named by the phase
  — before BE1 each phase was its own document, so `basename "$bp"` named the
  phase by accident, and with one blueprint every phase would have overwritten
  the same `provenance.repo-blueprint.lock`.
- Eight `workflow.yaml` apply steps pass `repo-blueprint.yaml <phase>`.
- `flows/phases/01-scaffold/workflow.yaml` calls
  `orun new --blueprint "$L/repo-blueprint.yaml" --phase 01-scaffold`.
- `track.sh ensure-task` call sites and `track.test.sh` point at `tasks/`.

### Verification

**Placement equivalence, proven rather than asserted.** The pre-BE1 tree was
materialized at `HEAD`, each of the seven slices placed into its own directory,
and the result compared to the new blueprint's per-phase file sets (read from
`orun new --status --json` against an empty output directory, which derives
without probing):

```
same   01-scaffold: 25 files      same   04-workers: 478 files
same   02-foundation: 312 files   same   05-edge: 59 files
same   03-infrastructure: 24      same   06-console: 177 files
                                  same   07-domain: 10 files
EQUIVALENT
```

`01-scaffold` additionally places the four declared `.gitkeep` discovery roots
the flow used to `mkdir`. A byte-level `diff -r` of `01-scaffold` old vs new
differs **only** inside `.orun/` — the provenance lock names a different
blueprint and digest, and the object store pins different blueprint bytes.
`.orun/` is gitignored in every product.

`flows/testing/phases.test.sh` is new and wired into the `flows-contract` CI
job. It carries the pre-migration module partition as data and fails if a
later edit moves a module between phases — the bootstrap's order is
load-bearing (a worker cannot deploy before the D1 binding exists) and a
module that drifts one phase earlier fails at deploy time, live, with nothing
in this repo having looked wrong. It also asserts execution order, that every
phase declares `title`/`expectedMinutes`/hooks, that every `contract:` exists,
that every surviving phase folder has a phase of its name, and that the slices
and the splitter stay deleted.

All seven contract tests pass: `track`, `land-pr`, `agent-build`,
`phase-vars`, `manifest`, `converge`, `phases`.

### Two questions BE1 opened

Recorded in `risks-and-open-questions.md` as 7 and 8:

- **A hook-only phase derives as `done`.** `derivePhase` returns `PhaseDone`
  when a phase places no files, which is right for a consume-only phase and
  wrong for `04-workers-restore` and `08-docs`. Nothing declares a
  `requires.phases` gate on either, deliberately, until orun **BE-O10**.
- **`requires.probe` makes an offline placement impossible**, which Tier 1
  needs. BE1 verified itself through `--status --json`, which derives without
  probing; BE5 decides whether the CLI grows a way to reach the substitute
  runner seam that already exists.
