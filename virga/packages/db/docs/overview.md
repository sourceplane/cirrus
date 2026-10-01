# db

The site's data plane on Cloudflare D1: the executor every repository talks
to (`@site/db/d1`), the column decoders SQLite needs (`@site/db/json`), the
migration manifest with its checksums, the migrations themselves, and the
runner that applies them over D1's REST API (`@site/db/runner`, bundled as
the `db-migrate` bin).

Bounded contexts are table-name prefixes: `audience_*`, `forms_*`,
`engagement_*`, `newsletter_*`. One repository per context lives under
`src/<context>/` and is the only code that names those tables.

## Depends on

- (none)

## Depended on by

- **site-api**, **mail-worker**, **db-migrate**
