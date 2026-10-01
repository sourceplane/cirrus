# 03-infrastructure — the data infrastructure

**Lands:** `infra/terraform/cloudflare-d1` and
`infra/terraform/cloudflare-kv` — a D1 database and a KV namespace per
environment.

This is the first phase that touches Cloudflare, and the first that WRITES a
credential. A builder- or viewer-role API key gets through the two phases
before this one and dies here, on the secret reconcile, with the
re-mint-as-admin hint.

## The consent is a wait, not a failure

`requires.probe` polls `orun.doctor/check@v1` for the GitHub and Cloudflare
connections for up to ten minutes. You can click the consent while the phase
waits.

## Three brokered secrets

A brokered secret is a pointer at a connection and a scope template; the
platform never hands this repository a value, and `orun.integrations/reconcile@v1`
KEEPS keys that exist and mints only the missing ones.

| key | template | needed for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `workers-deploy` | every Worker deploy |
| `CLOUDFLARE_D1_TOKEN` | `d1-edit` | the migration runner's REST calls |
| `CLOUDFLARE_ACCOUNT_ID` | `account-id` | terraform and wrangler |

**The `d1-edit` mint is refused unless the account API token's permission
groups include D1 Write.** That is an operator action no script can take; see
BOOTSTRAP.md.

## Verified by

`orun.secrets/exists@v1` re-lists `WIRING_CLOUDFLARE_D1` and
`WIRING_CLOUDFLARE_KV` on stage and prod. Those two secrets are what
`tooling/wire/render.mjs` resolves the `@@wiring(...)` tokens in each Worker's
`wrangler.template.jsonc` from at deploy time — which is why no resource id is
ever committed.
