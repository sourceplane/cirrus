# db-migrate

Applies `packages/db/src/migrations` to the environment's D1 database over
D1's REST API: `plan` on pull requests, `apply` on merge to `main`. The
runner refuses a migration whose file drifted from the checksum the manifest
recorded, and records each applied migration in `_migrations_applied`.

## Depends on

- **db** (the migrations and the runner), **cloudflare-d1** (the database, via
  the wiring document)

## Depended on by

- **site-api**, **mail-worker**
