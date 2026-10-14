# mail-worker

Internal Worker (no public route) reached through site-api's `MAIL_WORKER`
service binding. Renders the four templates, sends through the configured
provider, and runs newsletter broadcasts resumably against the deliveries
table. The contract is `specs/components/02-mail-worker.md`.

## Providers

| `MAIL_PROVIDER` | Sends through | Needs |
|---|---|---|
| `local-debug` (default) | nothing — records and logs | — |
| `cloudflare-email` | the `EMAIL` `send_email` binding | Workers Paid, sending domain verified in Email Service, `EMAIL_FROM_ADDRESS` on it |

## Bindings and secrets

`SITE_DB` (D1, wired at deploy time), `EMAIL` (stage/prod), `TOKEN_SECRET`
(shared with site-api; without it broadcasts carry no unsubscribe link).

## Depends on

- **cloudflare-d1** (wiring), **db-migrate** (schema)

## Depended on by

- **site-api** (service binding)
