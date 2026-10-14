# site-api

The only publicly routable Worker of the Virga runtime: every visitor write
path (subscribe, confirm, unsubscribe, form submissions, reactions, view
counts) and every owner read path (`/v1/owner/*`, bearer token) terminate
here. The contract is `specs/components/01-site-api.md`.

Deployed per environment (`stage`, `prod`; `dev` is verify-only) as
`virga-site-api-<env>`.

## Bindings

| Binding | Kind | Purpose |
|---|---|---|
| `SITE_DB` | D1 | the site database (wired at deploy time) |
| `RATE_LIMIT_KV` | KV | token buckets and mail throttles (wired at deploy time) |
| `MAIL_WORKER` | service | `virga-mail-worker-<env>` |

## Secrets

`OWNER_TOKEN` (≥ 16 chars; unset → owner routes 503), `TOKEN_SECRET`
(shared with mail-worker; unset → unsubscribe 503), `FINGERPRINT_SALT`,
`TURNSTILE_SECRET` (optional). Seed with `wrangler secret put <NAME> --env
<env>` or `orun secrets set`.

## Depends on

- **cloudflare-d1**, **cloudflare-kv** (wiring), **db-migrate** (schema),
  **mail-worker** (service binding)

## Depended on by

- **web-site** (browser calls), the **cli** (owner routes)
