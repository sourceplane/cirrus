# cloudflare-d1

Provisions the Cloudflare D1 site database, one per environment (`stage`,
`prod`; `dev` is verify-only and provisions nothing). Publishes the wiring
document every Worker deploy resolves its `database_id` from, so no resource
id is ever committed.

`adopt.tf` imports an existing database of the same name at plan time, so a
re-bootstrap onto a fresh state backend does not collide with the account's
duplicate-name guard.

## Depends on

- (none)

## Depended on by

- **site-api**, **mail-worker**, **db-migrate**
