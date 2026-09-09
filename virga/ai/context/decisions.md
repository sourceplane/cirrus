# Decisions

Durable choices, with the reason. Newest first.

## D6 — Rankings are computed, not stored (2026-09-09)

`GET /v1/launches/top` ranks slugs from `engagement_reaction_totals` and
`engagement_view_counts` at read time (cached briefly at the edge). A stored
rank would need a scheduler and a second write path for a number the site
reads a few times a minute.

## D5 — Visitors are fingerprints, never identities (2026-09-09)

Reactions and views key on `SHA-256(ip + user-agent + daily salt)`. The salt
rotates daily and is never stored, so the fingerprint cannot be joined back
to a person and a visitor's upvote quietly expires with the salt. This is a
deliberate trade: "one upvote per person forever" would need accounts, and
accounts are the thing Virga does not have.

## D4 — Tokens are hashed at rest, single-purpose, carried in URLs (2026-09-09)

Confirm and unsubscribe tokens are 32 random bytes, stored as SHA-256 hex,
compared by hash. The plaintext exists only in the mail. There is no login,
so there is nothing else for a token to unlock.

## D3 — The owner is a bearer token, not a user (2026-09-09)

`OWNER_TOKEN` is a Worker secret; owner routes compare it in constant time.
One owner, one token, rotated by `wrangler secret put` (or the escrow rail
when SS lands). A user table for one person is a liability, not a feature.

## D2 — Public ids are the only ids (2026-09-09)

Every record is addressed by `<prefix>_<32 hex>` in the database, on the
wire and in the CLI. Cirrus keeps bare UUIDs in columns and decodes public
ids at the boundary because its rows are joined across many contexts; Virga's
rows are not, so the decode step and the `Uuid` brand that guards it are
dropped.

## D1 — Cloudflare only, D1 as the system of record (inherited from Cirrus)

One provider, one consent, one token. The costs are D1's: no interactive
transactions (`executor.transaction` runs statements in order with no
rollback — prefer one statement with `RETURNING` or an `ON CONFLICT`
upsert), SQLite types (ISO-8601 text timestamps, JSON text, 0/1 booleans —
`@site/db/json` decodes), no schemas (bounded contexts are table-name
prefixes enforced in the repositories).
