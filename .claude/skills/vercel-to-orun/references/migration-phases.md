# Phased migration (score 4–5)

Big repositories never go in one PR. The phases mirror the Cirrus bootstrap
contract: each phase **places its modules → lands a green PR → watches the
convergence → verifies the outcome**, and a phase can be re-run alone.

| Phase | Lands | Done when |
|---|---|---|
| **P0 assess** | `docs/migration/{inventory,decisions}.md`, the G0–G4 decisions, the exception list | Owner signs off on the decisions |
| **P1 scaffold** | pnpm + turbo workspace, `intent.yaml`, `kiox.yaml`, `ci.yml`, app moved to `apps/web` with a `component.yaml`, Next pinned to the adapter-tested version, OpenNext build. The Vercel deployment keeps serving production. | `orun plan` compiles; verify lane is green; `wrangler deploy --dry-run` passes |
| **P2 infra** | `infra/terraform/cloudflare-{d1,kv,r2}`, wiring secrets published | Apply lanes are green on stage; wiring secrets exist |
| **P3 data layer** | Schema port + `db-migrate`, repositories rewritten (G2), a store adapter per Vercel service behind an interface | Unit tests pass against local D1/KV; migrations apply on stage |
| **P4 services** | Remaining `VC-*` rows (crons → cron worker, queues, blob → R2, auth, images) | Residue gate passes, except for recorded exceptions |
| **P5 data move + cutover** | Runbook execution, DNS / custom domain (the Cirrus `07-domain` shape) | Row counts and checksums match; prod smoke passes |
| **P6 decommission** | Delete `vercel.json`, the Vercel project, and Vercel env vars | Residue gate passes with zero exceptions, or a dated exit plan for each one |

**Strangler rule for monorepos** (dub, cal.com, inbox-zero): migrate one app
at a time. Every app is its own component, so the Orun plan can verify one
while the others still deploy to Vercel. A shared package that touches a
Vercel SDK gets an interface first (P3) so that both runtimes can use it.

**Interim couplings are allowed only behind the gate's exception mechanism:**
add `exception: VC-XXX — <why> — exit by <phase>` to `decisions.md`. The gate
waives exactly those rules, and the PR must list them.
