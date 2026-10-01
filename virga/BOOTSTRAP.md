# BOOTSTRAP — a fresh site from this baseline, in phases

How to go from **nothing** to a **fully deployed, documented site** (the
Terraform data plane, the two Workers, the public site — live on stage and
prod) with eight phases of one build document plus ONE provider consent.

The bootstrap is `repo-blueprint.yaml`, read by `orun new`. There is no
umbrella workflow and no per-phase document: a phase is a SELECTION on that
one artifact, which is what makes running one alone, months later, from a
fresh container the same operation as running them all. The contract each
phase follows is in [docs/phases/README.md](docs/phases/README.md).

Target wall-clock: **about half an hour**. There is no worker fleet to land
twice: Virga's graph is acyclic, so every phase is a single landing.

## 0. What you need

- GitHub org access (repo creation) and a machine with `git`, `gh`, `node`
  (≥ 22.5), `python3`, and the `orun` CLI — **≥ v2.56 for `--phase` and
  `--resume`, and ≥ v2.60 for the run-level `hooks.preInstantiate` list that
  opens the epic before the first phase places a file.** An older binary
  refuses this document outright (`cannot unmarshal !!map into []scaffold.Hook`)
  rather than half-running it, which is the failure you want.
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

## 1. One command: the whole sequence

```bash
orun new --blueprint repo-blueprint.yaml \
  --out ~/sourceplane/acme-blog --run-hooks --resume \
  --values ~/acme-blog.values.yaml
```

`--resume` places every phase not already derived as done, in dependency
order, honouring each barrier. Expected wall-clock on a clean run: **~43
minutes** (and see [docs/phases/TIMINGS.md](docs/phases/TIMINGS.md) for which
of those numbers are measured and which are still estimates — today, all of
them are estimates).

A values file beats repeating `--set`, because the blueprint's four REQUIRED
inputs are validated before any phase runs — single-phase invocations
included:

```yaml
# ~/acme-blog.values.yaml
repoName: acme-blog
productName: Acme Blog
productDomain: acme.blog
githubOrg: sourceplane
workersDevSubdomain: <workers-dev-subdomain>
orunWorkspace: ws_XXXXXXXX     # omit to use the workspace the build runs in
repoPrivate: true
domain: false                  # true also runs 07-domain (needs the zone)
```

## 1b. Or phase by phase — the same document, at your pace

```bash
orun new --blueprint repo-blueprint.yaml \
  --out ~/sourceplane/acme-blog --run-hooks --phase 03-infrastructure \
  --values ~/acme-blog.values.yaml
```

Drop `--run-hooks` to preview: a phase then places files and stops — no repo,
no landing, no convergence watch, no probe. That is exactly what makes a dry
instantiation of this baseline possible in CI with no workspace and no
provider.

| # | phase | lands |
|---|-------|-------|
| 01 | scaffold | **the repo is created** + intent, CI, tooling, identity, the empty discovery roots |
| 02 | foundation | `packages/{contracts,db,shared,testing,cli}` + their suites |
| 03 | infrastructure | `cloudflare-d1`, `cloudflare-kv` |
| 04 | mail | `infra/db-migrate` + `apps/mail-worker` (internal) |
| 05 | api | `apps/site-api` — `/health` live on stage + prod |
| 06 | site | `apps/web-site` — the public site |
| 07 | domain | the custom domain (OPTIONAL — `when: inputs.domain`, needs the zone) |
| 08 | docs | the live-deployment manifest, from probed reality |

Each phase is idempotent, and phase state is DERIVED from the placed tree,
never stored in it — nothing in `--out` records which phases have run, so it
is always safe to delete. A phase whose files are present but branded derives
as `drifted`, which satisfies a successor's requirement without `--resume`
reverting your product's identity.

What lands in the product is PRODUCT-ONLY: source, infra, CI, configs and its
own two context pages. None of this baseline's machinery ships —
`testing/leak.test.sh` fails the pull request if it starts to.

The workspace needs its two integrations connected once (GitHub on the account
that will OWN the repo, and Cloudflare). `01-scaffold` and
`03-infrastructure` POLL for them through `orun.doctor/check@v1` for up to ten
minutes, so the consent can be clicked while a phase waits: a consent nobody
has granted yet is a WAIT, not a failure. If the Cloudflare token's permission
groups omit D1 Write, the `d1-edit` mint is refused
(`parent_grant_insufficient`) and `03-infrastructure` stops with that message
— re-issue the token with D1 Write, re-connect, and re-run the phase. The
secret reconcile is idempotent: keys that exist are KEPT, only missing ones are
minted.

## 2. Headless / container mode

A fresh container with two env tokens is the entire contract. Clone the
baseline at a tag and the tag pins EVERYTHING: the blueprint, its modules, and
the scripts its hooks run all come from that one commit, and orun pins the
checkout by digest into its object store before any module is read.

```bash
export ORUN_TOKEN=…          # orun auth, headless (admin role)
export GITHUB_TOKEN=…        # fine-grained PAT (scopes below)

git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/virga
cd virga
orun new --blueprint repo-blueprint.yaml --out /work/acme-blog --run-hooks \
  --resume --values /work/acme-blog.values.yaml
```

Inside a baseline checkout the same command uses the local tree: the two modes
are the same files.

| requirement | detail |
|---|---|
| image deps | `git`, `gh`, `node` (≥ 22.5), `python3`, `curl`, `orun` ≥ v2.60 |
| `ORUN_TOKEN` | orun access token, admin role (the secret write in `03-infrastructure` is the floor) |
| `GITHUB_TOKEN` | fine-grained PAT: on the PRODUCT repo **contents write**, **pull-requests write**, **actions read+write**, **checks read**; **repo create** on the org, because `01-scaffold` creates it |
| pinning | the clone's tag pins the blueprint AND every script `{{ .baseline.dir }}` resolves. Use a tag for reproducible bootstraps |
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
  [`07-domain`](docs/phases/07-domain.md) with `--set domain=true`, then
  re-run `08-docs` so the record picks up the domain URLs.

- **Content.** Write Markdown into `content/{posts,projects,launches,pages}`
  and push; CI rebuilds and redeploys the site. A section appears when its
  folder has files.

- **Incremental changes**: normal PRs — merges to `main` converge
  automatically.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Preflight times out on connections | Consent not granted yet — console → Integrations, then re-run the flow (idempotent). |
| Secrets listed `orphaned` | Their connection was revoked/replaced. Re-connect the provider and re-run `03-infrastructure`: `orun.integrations/reconcile@v1` re-mints only the missing keys, against the ACTIVE connection. |
| D1 or KV lane: resource name already taken | The account already has `<repo>-<env>`. Adoption imports it at plan time when it is the *same* product re-bootstrapping; otherwise rename or delete the stray resource. |
| Convergence run fails, lanes look transient | `orun.run/watch@v1` already auto-resumes ×3 (`resumeBudget: 3`); `gh run rerun --failed` is a true resume if you need a fourth. |
| Worker verify lane: missing `WIRING_*` secret | Its Terraform upstream has not applied (check that lane first) — inside one convergence run the DAG guarantees order; across manual partial runs it does not. |
| D1 lane or db-migrate: `Authentication error (10000)` | The lane resolved `CLOUDFLARE_API_TOKEN` (workers-deploy), which cannot touch D1. Both D1 components must bind `CLOUDFLARE_D1_TOKEN`. |
| Secret WRITE fails `not_found` while listings work | The API key's role is below ADMIN (resource-hiding masks the denial). Re-mint the key with the admin role and re-run `03-infrastructure`; the reconcile is idempotent. |
| site-api `/health` answers `degraded` | The Worker is up but D1 is not reachable — check phase 03 applied and `WIRING_CLOUDFLARE_D1` resolves. |
| Site smoke fails right after the FIRST deploy | workers.dev route propagation race — the deploy lane's smoke retries with backoff; a resume clears older pins. |
| Environment cannot observe GitHub Actions (gh 403) | Landings and the convergence watch fall back to plain REST automatically. If even REST Actions is blocked, run the phase without `--run-hooks` and land it yourself — then verify out-of-band before the next phase. |

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
