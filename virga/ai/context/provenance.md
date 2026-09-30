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
| the contract suite rode a `tests/flows` component whose profile ran no tests | `testing/*.test.sh` run directly by `.github/workflows/baseline.yml`, kept out of products by `ignore` | ported: 6 of the gates (tiers 0–1) |
| — | `.github/workflows/tag.yml` + `testing/tag-gate.sh`: no `baseline-vN` from a commit whose rehearsal never passed | ported |
| — | `.github/workflows/rehearsal.yml` + `testing/rehearsal/` + `testing/teardown.sh` (tier 3, a real throwaway product in a dedicated account) | **NOT ported** — see below |
| ci.yml pinned orun `v2.52.6` and dropped `--remote-state` on pull requests | pinned `v2.56.2`, remote state on every run | Virga never dropped state on PRs; the pin is the product's own lane and is bumped when a bootstrap proves a version |

### What this sync deliberately did not take

- **Tier 2 (placement) and tier 3 (rehearsal).** Both need to actually run
  `orun new`: tier 2 against a temp directory with orun ≥ v2.56, tier 3
  against a dedicated Cloudflare account, with a teardown that deletes real
  resources by name prefix. Neither could be run here, and a teardown script
  that has never been run is more dangerous than none. They are what
  `tag.yml` is waiting for: until they exist it answers "cannot be proven"
  and no `baseline-vN` can be cut.
- **Cirrus's `testing/placement.test.sh` and `rebrand.test.sh`** for the same
  reason — both drive a real `orun new`.
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
later — which is the whole reason this file exists.

