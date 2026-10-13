# Provenance — born from Cirrus

Virga is a variation of [sourceplane/cirrus](https://github.com/sourceplane/cirrus)
(the Cloudflare-only multi-tenant SaaS baseline), taken at commit `8f41d16`
("specs: saas-baseline-tracking (BT)"). Cirrus itself was born from Lumen at
`e1fbee6`; the lineage is Lumen → Cirrus → Virga.

Unlike Cirrus's genesis (a verbatim copy followed by a rebrand), Virga's
genesis is a **selection**: the tree keeps the machinery and drops the
product. This note is the record of that choice.

## Kept, verbatim or near-verbatim

| Path | Why |
|---|---|
| `tooling/tsconfig`, `tooling/eslint` | The workspace's compiler and lint contract. The Cirrus rule guarding public-id ↔ UUID column mix-ups is dropped: Virga stores public ids as-is. |
| `tooling/wire/render.mjs` | Deploy-time wiring (`@@wiring(...)@@` tokens) — the reason no resource id is ever committed. |
| `tooling/migrations/rechecksum.mjs` | The manifest checksum guard. |
| `packages/db/src/d1/*` | The D1 seam: executor, placeholder translation, bind-value normalization, constraint detection, health probe. |
| `packages/db/src/json.ts` | SQLite column decoders (JSON text, 0/1 booleans). |
| `packages/db/src/runner/*` | The migration runner over D1's REST API and its statement splitter. |
| `packages/db/src/migrations/000_control` | The migration ledger. |
| `packages/contracts/src/{health,timing,errors}.ts` | Cross-cutting contracts every Worker honours. |
| `tests/db/src/{d1-*,runner}.test.ts` | The seam's own suites. |
| `kiox.yaml`, `kiox.lock` | The Orun runtime pin. |
| The composition stack (`oci://ghcr.io/sourceplane/stack-tectonic`) | Consumed, not vendored, exactly as Cirrus does. |

## Dropped

Everything that exists because there are many tenants: identity, membership,
projects, policy, events/audit, config, metering, billing, webhooks,
integrations, admin, the console, the SDK, the multi-tenant CLI, and the
nineteen migrations that describe them. Also dropped: `SOLO_MODE` — Virga is
not a profile of a tenancy stack, it has no tenancy stack.

## Renamed

`@saas/*` → `@site/*` for every workspace package. The scope is generic on
purpose (it never changes on a fork), and "saas" is the wrong word for a
portfolio.

## What replaces what

| Cirrus | Virga |
|---|---|
| `api-edge` + 12 bounded-context Workers | `site-api` (public) + `mail-worker` (internal) |
| `web-console-next` | `web-site` — same composition, public instead of authenticated |
| `notifications-worker` providers + templates | carried into `mail-worker` |
| `api-edge` rate limiter, CORS, request ids, error envelope | carried into `site-api` |
| org-scoped tables | four contexts by prefix: `audience_`, `forms_`, `engagement_`, `newsletter_` |
| `cirrus` CLI over the SDK | `virga` CLI over the owner routes |

## Staying in sync with Cirrus's baselining process

Virga forked Cirrus's bootstrap machinery, so a change to *how Cirrus makes a
product* is a change Virga has to re-take deliberately. This section is the
audit trail of those re-takes: what Cirrus changed, when, and what Virga did
about it.

### 2026-09-30 — the one-document bootstrap (VG8, VG9)

Synced from `sourceplane/cirrus` `8f41d16` → `80b265b` (`baseline-v7` →
`baseline-v12`). Cirrus rebuilt its baselining process in that range; Virga was
born at the start of it and still carried the retired model.

| Cirrus, before | Cirrus, now | Virga |
|---|---|---|
| `flows/` — 8 `workflow.yaml` files, an umbrella `00-all`, an agent brief, and a `common/` shell library | one `repo-blueprint.yaml` read by `orun new --phase` / `--resume`; every step that is not placing a file is a **typed action** in the orun binary | ported in VG8. `flows/` deleted. |
| `tooling/blueprint/split-phases.py` derived a per-phase blueprint slice and PRUNED every cross-phase `dependsOn` edge | the engine REFUSES a forward dependency instead of deleting it | the splitter is deleted; `testing/phases.test.sh` runs the same refusal offline |
| phase prose in `flows/phases/*/README.md` | `docs/phases/*.md` + one `README.md` carrying the contract | ported, rewritten for Virga's eight phases |
| the shell library's `create-secrets.sh`, `converge.sh`, `land-pr.sh`, `preflight.sh` | `orun.integrations/reconcile@v1`, `orun.run/watch@v1`, `orun.pr/land@v1`, `orun.doctor/check@v1` | the scripts are gone; the hooks name the actions |
| `flows/common/render-deployment-docs.sh` | `hooks/render-deployment-docs.sh` | moved |
| — | `tasks/*.TaskContract.yaml`, one per landing, attached by `orun.task/ensure@v1` | ported, 8 contracts |
| — | run-level `hooks.preInstantiate` opening the epic, milestones and tasks before the first file is placed (orun ≥ v2.60) | ported |
| — | `tooling/bootstrap/retouch.mjs` — the redeploy marker that gives a re-run phase a diff | ported verbatim; it is tree-driven and needed no adaptation |
| `tooling/bootstrap/cycle-break.mjs` strips and restores the fleet's cyclic service bindings across two landings | unchanged | **NOT carried.** Virga's one binding points backwards, so there is no cycle and no `-restore` phase |
| the contract suite rode a `tests/flows` component whose profile ran no tests | `testing/*.test.sh` run directly by `.github/workflows/baseline.yml`, kept out of products by `ignore` | ported: 6 of the gates (tiers 0–1) in VG9; tier 2 (`placement.test.sh`) added in VG11 |
| — | `.github/workflows/tag.yml` + `testing/tag-gate.sh`: no `baseline-vN` from a commit whose rehearsal never passed | ported |
| — | `.github/workflows/rehearsal.yml` + `testing/rehearsal/` + `testing/teardown.sh` (tier 3, a real throwaway product in a dedicated account) | **NOT ported** — see below |
| ci.yml pinned orun `v2.52.6` and dropped `--remote-state` on pull requests | pinned `v2.56.2`, remote state on every run | Virga never dropped state on PRs; the pin is the product's own lane and is bumped when a bootstrap proves a version |

### 2026-10-13 — half the wall-clock (VG11)

Synced from `sourceplane/cirrus` `80b265b` → `d725d8d`. Cirrus measured a real
bootstrap (`kartha-test-1`), found a third of the hour was the PR pass running
every lane the merge then ran again, and rebuilt the bootstrap around that
(`43ca81b`). Four of its five changes apply here; the fifth does not.

| Cirrus, before | Cirrus, now | Virga |
|---|---|---|
| eight landings | five: `02-foundation` absorbs `03-infrastructure`; `05-edge` absorbs `04-workers-restore` and `06-console`. Surviving names keep their identities, the numbering has gaps | **taken, adapted**: six landings. `02-foundation` absorbs `03-infrastructure` (same argument — no package reads D1, Terraform builds no package) and `05-api` absorbs `06-site` (as cirrus's edge absorbed its console). Same gaps at `03` and `06` |
| every landing's PR ran every lane, then the merge ran them all again | `ci.yml` skips the `run` lanes on pull requests from `orun/BASE-*`; `plan` is the gate and the landing merges on green | **taken**, with this baseline's own task prefix: `orun/SITE-*` |
| `max-parallel: 8`, every lane re-downloading the whole registry | `max-parallel: 16` and one pnpm store cache keyed by the lockfile | **taken**. The fan-out here is a fraction of the size that saturated the resolve, so the cap is not the active constraint; the shared store is the part that pays |
| every dev and pull-request job waited out the DAG | `dev` is `dependencyMode: advisory`; components with ordered edges on main are advisory on `github-pull-request` | **taken** for all four components that declare `dependsOn` (`site-api`, `mail-worker`, `web-site`, `db-migrate`) and for `dev` in `intent.yaml` |
| prod's promotion gate held through the bootstrap, doubling every convergence | `01-scaffold` defers `prod.promotion`, `08-docs` restores it byte-for-byte (`tooling/bootstrap/promotion.mjs`) | **taken verbatim.** Virga's `intent.yaml` has the same `prod.promotion.dependsOn: [stage]` and the same map-shaped `environments:`, so the tool needed no adaptation |
| the fleet deployed in binding order, six deep on each environment | two parallel waves: `cycle-break.mjs --strip --all` for the first, every binding restored and the fleet redeployed in `05-edge`, peer edges `dependencyMode: advisory` on stage and prod | **NOT taken.** Virga has one worker-to-worker binding, `site-api` → `MAIL_WORKER`, and it points backwards: `04-mail` lands the mail Worker, `05-api` lands the API against it. There is no chain to flatten and no cycle to break, and making the peer edge advisory would let the API deploy before its binding target exists on a fresh product — cirrus can only do that because its first wave guarantees every target exists |
| — | `testing/phases.test.sh` gained a declared partition (`WAS`) plus a `FOLDED` map, so a deliberate fold is distinguishable from a module that slid into the wrong phase | **taken, and it is new capability here**: Virga's gate checked invariants only, so any reshuffle passed. It now also checks that every phase has a `docs/phases/` page and every page a phase — which is what caught the two orphaned pages during this sync |
| `rehearsal.yml`'s workspace guard died of its own apostrophe before it could speak, failing every nightly for a week (`6217711`) | an explicit `[ -z ]` test with the same message | **not applicable** — Virga has no `rehearsal.yml` (tier 3 is still unported). Recorded so the next sync does not read this as a missed row, and so the lesson travels with the port: a single quote inside `${VAR:?…}` is a syntax error even under double quotes |
| `01-scaffold` ends with `orun.repo/ensure@v1` **and** `orun cloud link` + `orun cloud check` | unchanged (cirrus has carried the pair since BE4) | **taken now, and it was a real gap.** The VG8 sync took `repo` and dropped `link`. Without the link every convergence lane fails OIDC exchange with `Not found` before running a step — exactly the failure cirrus documents — and no Virga run had reached a convergence to notice. Found by reading cirrus's `01-scaffold` hook list against Virga's during this sync |

Card and estimates moved with it: `blueprint.yaml` is six milestones and 35
minutes (was eight and 43), and `docs/phases/TIMINGS.md` says which number the
folds account for. **Still nothing measured on Virga** — the estimates are
arithmetic on cirrus's estimates, minus a landing's fixed cost, which is the
one figure in that table that came from a measured run.

### What this sync deliberately did not take

- **Tier 2 (placement) and tier 3 (rehearsal).** Both need to actually run
  `orun new`: tier 2 against a temp directory with orun ≥ v2.56, tier 3
  against a dedicated Cloudflare account, with a teardown that deletes real
  resources by name prefix. A teardown script that has never been run is more
  dangerous than none. They are what `tag.yml` is waiting for: until they
  exist it answers "cannot be proven" and no `baseline-vN` can be cut.

  **TIER 2 IS NOW PORTED AND PASSING** (`testing/placement.test.sh`, VG11).
  VG8 and VG9 were written where only orun v2.54 was available, which refuses
  this document outright (`cannot unmarshal !!map into []scaffold.Hook`); as of
  VG11 the container carries v2.75, so the gate could be both written and RUN,
  end to end, including its last step. `leak.test.sh` — which needed ≥ v2.56 to
  derive a placement — also passes here for the first time.

  Writing it was worth more than the gate: the engine refused this document on
  two counts no YAML-reading gate could see, and both had been in the tree
  since VG8 while every offline gate was green. `orun.pr/land@v1` was passed a
  `repo:` parameter it does not have (six hooks), and `domain`/`repoPrivate`
  were declared `type: bool` where the engine wants `boolean`. Either one
  refuses the WHOLE document, so no Virga bootstrap could have started. That is
  the gap tier 2 closes, and it is why the gate's last step runs the placed
  product's own pipeline rather than stopping at "it placed".

  Tier 3 still needs a real Cloudflare account and a workspace, and is still
  out of reach, so `tag.yml` still answers "cannot be proven" and no
  `baseline-vN` can be cut.

  One warning for whoever ports tier 2: cirrus's `placement.test.sh` asserts
  on the literal line `repo gate: validate + plan --dry-run passed` in orun's
  output, and v2.75 does not print it, so that gate fails on cirrus main in
  this container while passing in CI against the pinned v2.58.11. Do not port
  that assertion as a string match on a version-dependent line.
- **Cirrus's `rebrand.test.sh`** as a separate file: what it checks (the
  identity chain, then `--verify`) is step 4 of this baseline's
  `placement.test.sh`, against the tree that was just placed.
- **Cirrus's assertion on orun's own log line** (`repo gate: validate + plan
  --dry-run passed`). v2.75 does not print it, so as a string match it reports
  the engine's version rather than the tree's health. `placement.test.sh` says
  so where it would have gone.
- **The `.vscode` module.** Virga has no `.vscode` directory to place.

### How to do the next sync

```bash
# what changed in the machinery since the last recorded sync point
git diff --stat <last-sync-sha>..origin/main -- \
  blueprint.yaml repo-blueprint.yaml intent.yaml BOOTSTRAP.md \
  tasks testing docs hooks agents ai tooling .github
```

Then: re-take each change deliberately, add a row to the table above, and move
the sync point. A change re-taken without a row is a change nobody can audit
later — which is the whole reason this file exists. Read cirrus's hook lists
against Virga's phase by phase while you are there, not only the diff: VG11
found a hook VG8 had dropped (`orun cloud link`) that no diff in the range
would have shown, because cirrus had not touched it.

**Last recorded sync point: `d725d8d`.**

