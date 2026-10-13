# 02-foundation — the shared packages and the data plane

**Lands:** `packages/{contracts,db,shared,testing,cli}` and their suites
`tests/{db,cli}`, and beside them `infra/terraform/cloudflare-d1` and
`infra/terraform/cloudflare-kv` — a D1 database and a KV namespace per
environment.

This is the first phase that DEPLOYS, the first that touches Cloudflare, and
the first that WRITES a credential. A builder- or viewer-role API key gets
through `01-scaffold` and dies here, on the secret reconcile, with the
re-mint-as-admin hint.

## Two landings folded into one

The packages and the data plane were separate phases — `02-foundation` and
`03-infrastructure` — and each paid a whole landing (place, PR, merge, a
convergence of its own) for work that never depended on the other: no package
in this baseline reads D1, and Terraform builds none of the packages. One
landing runs both in one convergence, side by side. Cirrus made the same fold
first (`43ca81b`); this is that change taken.

The numbering keeps its gap — `03` is not reused — so the surviving phase
names stay the identities the task plane, the milestones and `--phase` use.

## Why `packages/db` is here, and the database too

`packages/db` is the *seam*, not the database: the executor that translates
the repositories' numbered `$n` placeholders into D1's positional binds and
matches SQLite's constraint-failure messages. It has no provider dependency
and its suite runs against a real SQLite engine through `node:sqlite`, so it
builds offline. The database it eventually talks to now lands in the same
phase, in the lane beside it.

`db-migrate` is still NOT here, though it is data plane: it plans the
migrations against the database `cloudflare-d1` creates, whose id is a
job-output secret that exists only once this phase's merge has applied. It
lands with `04-mail`, the first phase that reads the database.

## The consent is a wait, not a failure

`requires.probe` polls `orun.doctor/check@v1` for the GitHub and Cloudflare
connections for up to ten minutes. You can click the consent while the phase
waits.

## Three brokered secrets

A brokered secret is a pointer at a connection and a scope template; the
platform never hands this repository a value, and `orun.integrations/reconcile@v1`
KEEPS keys that exist and mints only the missing ones. One hook per template on
purpose — these are three different scopes, and the deploy token deliberately
cannot touch D1.

| key | template | needed for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `workers-deploy` | every Worker deploy |
| `CLOUDFLARE_D1_TOKEN` | `d1-edit` | the migration runner's REST calls |
| `CLOUDFLARE_ACCOUNT_ID` | `account-id` | terraform and wrangler |

**The `d1-edit` mint is refused unless the account API token's permission
groups include D1 Write.** That is an operator action no script can take; see
BOOTSTRAP.md.

## Verified by

The convergence watch — every package's verify lane and both Terraform applies
in one run — and then `orun.secrets/exists@v1` re-lists
`WIRING_CLOUDFLARE_D1` and `WIRING_CLOUDFLARE_KV` on stage and prod. Those two
secrets are what `tooling/wire/render.mjs` resolves the `@@wiring(...)` tokens
in each Worker's `wrangler.template.jsonc` from at deploy time — which is why
no resource id is ever committed.
