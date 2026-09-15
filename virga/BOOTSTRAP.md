# BOOTSTRAP — a fresh site from this baseline, in phases

How to go from **nothing** to a **fully deployed, documented site** (the
Terraform data plane, the two Workers, the public site — live on stage and
prod) with the phased bootstrap workflows plus ONE provider consent.

The phase workflows and their shared machinery are inherited from the Cirrus
baseline, proven end-to-end there; Virga changes what the phases deploy, not
the way they run.

Target wall-clock: **about half an hour**. There is no worker fleet to land
twice: Virga's graph is acyclic, so every phase is a single landing.

## 0. What you need

- GitHub org access (repo creation) and a machine with `git`, `gh`, `node`
  (≥ 22.5), `python3`, and the `orun` CLI ≥ v2.52.6 (the product's CI lane
  pin matches).
- A Cloudflare account and its **Account API token**. It is the ONLY provider
  credential this baseline needs — and it must be able to mint both the
  `workers-deploy` and `d1-edit` scopes, i.e. its permission groups include
  D1 Write.
- An Orun Cloud workspace for the site (`workspace:` in `intent.yaml`), with
  an **admin-role API key** for headless runs (builder/viewer keys can read
  but their secret writes are denied — masked as `not_found`).
- **The repo allow-listed in the workspace** (console → Settings → Git
  repos). This is the ONE console action a workspace-scoped token cannot
  self-heal — do it up front or the first preflight will stop and ask.

## 1. One command: the umbrella

The whole bootstrap, unattended — phases 01→08 with per-phase retry, an early
credential write-probe, and an independent final verification:

```bash
orun workflow run flows/phases/00-all/workflow.yaml \
  --set workspace=ws_XXXXXXXX --set reponame=acme-blog \
  --set productname="Acme Blog" --set productdomain=acme.blog \
  --set subdomain=<workers-dev-subdomain>
```

Headless: the same command by remote reference (§2). Details, prerequisites
and failure semantics: [flows/phases/00-all/README.md](flows/phases/00-all/README.md).

## 1b. Or phase by phase — the same flow, at your pace

`flows/phases/01-scaffold … 08-docs` are eight independent workflows. Each is
idempotent (re-running a completed phase is a no-op that re-verifies) and
follows one contract: **apply its slice → land it → watch the convergence →
verify the outcome**. Full guide: [flows/phases/README.md](flows/phases/README.md),
with a README in every phase folder; every phase supports `--set dryrun=true`.

```bash
# local mode, from this checkout — phase 01 takes the identity once:
orun workflow run flows/phases/01-scaffold/workflow.yaml \
  --set workspace=ws_XXXXXXXX --set reponame=acme-blog \
  --set productname="Acme Blog" --set productdomain=acme.blog \
  --set subdomain=<workers-dev-subdomain>

# every later phase reads the identity from the product repo:
orun workflow run flows/phases/02-foundation/workflow.yaml \
  --set out=~/sourceplane/acme-blog --set workspace=ws_XXXXXXXX
# … 03 (infrastructure), 04 (mail), 05 (api), 06 (site), 08 (docs); 07 (domain) optional.
```

| # | phase | lands |
|---|-------|-------|
| 01 | scaffold | the repo: intent, CI, flows, tooling, identity |
| 02 | foundation | `packages/{contracts,db,shared,testing,cli}` + their suites |
| 03 | infrastructure | `cloudflare-d1`, `cloudflare-kv`, `db-migrate` |
| 04 | mail | `apps/mail-worker` (internal) |
| 05 | api | `apps/site-api` — `/health` live on stage + prod |
| 06 | site | `apps/web-site` — the public site |
| 07 | domain | the custom domain (OPTIONAL — needs the zone) |
| 08 | docs | the live-deployment manifest, from probed reality |

What lands in the product is PRODUCT-ONLY: source, infra, CI, configs and its
own docs. None of this baseline's machinery ships, and nothing in the product
presents it as a copy of anything.

The workspace needs its two integrations connected once (GitHub and
Cloudflare) — preflight polls up to 10 minutes so the consent can be clicked
while it waits. If the Cloudflare token's permission groups omit D1 Write,
the `d1-edit` mint is refused (`parent_grant_insufficient`) and phase 03
stops with that message: re-issue the token with D1 Write, re-connect, and
re-run (secrets self-heal via `flows/common/create-secrets.sh <ws>`).

Handing the bootstrap to an agent? Use the maintained runbook —
[flows/AGENT-PROMPT.md](flows/AGENT-PROMPT.md) — instead of writing your own.

## 2. Headless / container mode

Every phase workflow is self-contained: reference it remotely, give it two
tokens, and it fetches everything itself — the baseline at the SAME commit
the flow came from, the product repo by name.

```bash
export ORUN_TOKEN=…          # orun auth, headless (admin role)
export GITHUB_TOKEN=…        # fine-grained PAT (scopes below)

orun workflow run github:sourceplane/virga@<ref>//flows/phases/01-scaffold/workflow.yaml \
  --set workspace=ws_… --set reponame=acme-blog --set productname="Acme Blog" \
  --set productdomain=acme.blog --set subdomain=<workers-dev-subdomain>

orun workflow run github:sourceplane/virga@<ref>//flows/phases/02-foundation/workflow.yaml \
  --set workspace=ws_… --set repo=sourceplane/acme-blog
# … phases 03–08 identically. Add --set dryrun=true to preview.
```

| requirement | detail |
|---|---|
| image deps | `git`, `gh`, `node` (≥ 22.5), `python3`, `curl`, `orun` ≥ v2.52.6 |
| `ORUN_TOKEN` | orun access token; preflight authenticates with it (no login flow) |
| `GITHUB_TOKEN` | fine-grained PAT: **read** on `sourceplane/virga` (baseline fetch); on the PRODUCT repo **contents write**, **pull-requests write**, **actions read+write**, **checks read**; **repo create** on the org if phase 01 creates the repo |
| pinning | the `@<ref>` pins EVERYTHING — the flow fetches its baseline at that exact commit (`ORUN_FLOW_SOURCE_SHA`). Use a tag for reproducible bootstraps; `@main` for latest |
| workdir | phases share `baseline/` and `product/` anchored at the invocation cwd (stable across phases and re-runs — idempotent) |
| classic-token caveat | a CLASSIC PAT additionally needs the `workflow` scope to push `.github/workflows/`; fine-grained PATs need only `contents: write` |

## 3. After the site is live

- **Runtime secrets.** The site needs three, seeded once per environment:

  ```bash
  orun secrets set OWNER_TOKEN      --org <ws> --env prod   # the CLI's bearer token
  orun secrets set TOKEN_SECRET     --org <ws> --env prod   # HMAC key for unsubscribe links
  orun secrets set FINGERPRINT_SALT --org <ws> --env prod   # daily visitor fingerprints
  # optional: TURNSTILE_SECRET to require a challenge on subscribe and forms
  ```

  Nothing blocks on them: without `OWNER_TOKEN` the owner routes answer 503,
  without `TOKEN_SECRET` unsubscribe answers 503, and the rest of the site
  works. `TOKEN_SECRET` must be the SAME value on site-api and mail-worker —
  mail-worker mints the unsubscribe links site-api verifies.

- **Real email.** `MAIL_PROVIDER` is `local-debug` everywhere but prod. Before
  mail actually leaves, the Cloudflare account needs: Workers Paid plan, the
  sending domain verified in Email Service (DKIM/SPF), and
  `EMAIL_FROM_ADDRESS` on that verified domain. Until then the worker still
  deploys and failed sends are recorded on `newsletter_deliveries`.

- **Custom domain.** Create the zone in Cloudflare, restore the `subscribe:`
  block in `infra/terraform/cloudflare-domain/component.yaml`, run
  [phase 07](flows/phases/07-domain/README.md), then re-run phase 08 so the
  docs pick up the domain URLs.

- **Content.** Write Markdown into `content/{posts,projects,launches,pages}`
  and push; CI rebuilds and redeploys the site. A section appears when its
  folder has files.

- **Incremental changes**: normal PRs — merges to `main` converge
  automatically.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Preflight times out on connections | Consent not granted yet — console → Integrations, then re-run the flow (idempotent). |
| Secrets listed `orphaned` | Their connection was revoked/replaced. Re-connect the provider; `flows/common/create-secrets.sh <ws>` recreates against the ACTIVE connection. |
| D1 or KV lane: resource name already taken | The account already has `<repo>-<env>`. Adoption imports it at plan time when it is the *same* product re-bootstrapping; otherwise rename or delete the stray resource. |
| Convergence run fails, lanes look transient | `flows/common/converge.sh <run-id>` resumes it (`gh run rerun --failed` = true resume). The flow already does this ×3. |
| Worker verify lane: missing `WIRING_*` secret | Its Terraform upstream has not applied (check that lane first) — inside one convergence run the DAG guarantees order; across manual partial runs it does not. |
| D1 lane or db-migrate: `Authentication error (10000)` | The lane resolved `CLOUDFLARE_API_TOKEN` (workers-deploy), which cannot touch D1. Both D1 components must bind `CLOUDFLARE_D1_TOKEN`. |
| Secret WRITE fails `not_found` while listings work | The API key's role is below ADMIN (resource-hiding masks the denial). Re-mint the key with the admin role; `create-secrets.sh` is idempotent. |
| site-api `/health` answers `degraded` | The Worker is up but D1 is not reachable — check phase 03 applied and `WIRING_CLOUDFLARE_D1` resolves. |
| Site smoke fails right after the FIRST deploy | workers.dev route propagation race — the deploy lane's smoke retries with backoff; a resume clears older pins. |
| Environment cannot observe GitHub Actions (gh 403) | Landings/converge fall back to plain REST automatically. If even REST Actions is blocked: `--set watch=false` skips the converge watch — then verify the run out-of-band before the next phase. |

## Architecture invariants this depends on

- **CI holds one credential: `GITHUB_TOKEN`.** Provider credentials are
  brokered per run from workspace integrations; Terraform state lives on the
  platform (`backend "http"`, run-token auth); Terraform outputs travel as
  lease-published job-output secrets. No long-lived provider tokens anywhere.
- **Resume-capable CI**: the exec-id is the GitHub run id (no attempt suffix)
  and every lane passes `--retry` — `gh run rerun --failed` is a true resume.
- **Acyclic worker graph**: `site-api → mail-worker`, one way, so no phase
  needs a cycle-break landing. `cloudflare-domain` is the only component
  parked by design.
