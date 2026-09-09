# Domain model

Status: Normative

One D1 database per environment; four bounded contexts as table-name
prefixes; every record addressed by a `<prefix>_<32 hex>` public id in the
column, on the wire and in the CLI.

## audience — who asked to hear from the site

`audience_subscribers`

| column | type | notes |
|---|---|---|
| id | TEXT PK | `sub_…` |
| email | TEXT UNIQUE | lower-cased |
| status | TEXT | `pending` · `confirmed` · `unsubscribed` |
| source | TEXT NULL | page slug, form key, `cli`, `import` |
| tags | TEXT | JSON array |
| confirm_token_hash | TEXT NULL | SHA-256 hex of the plaintext in the mail |
| unsubscribe_token_hash | TEXT NULL | idem |
| created_at, confirmed_at, unsubscribed_at, updated_at | TEXT | ISO-8601 |

Rules: subscribing an existing address re-sends the confirmation when
pending, is a no-op when confirmed, and revives an unsubscribed address as
pending. Tokens are single-purpose and rotated on every issue.

## forms — what visitors typed and sent

`forms_submissions`

| column | type | notes |
|---|---|---|
| id | TEXT PK | `frm_…` |
| form | TEXT | matches `FORM_KEY_RE` |
| fields | TEXT | JSON object, bounded (32 keys, 4000 chars per value) |
| status | TEXT | `new` · `read` · `archived` · `spam` |
| visitor | TEXT NULL | fingerprint |
| created_at, updated_at | TEXT | |

## engagement — reactions and views on any slug

`engagement_reactions` — (slug, kind, visitor) UNIQUE; a toggle inserts or
deletes the row.
`engagement_reaction_totals` — (slug, kind) → count, maintained by the
repository in the same statement list as the toggle.
`engagement_view_counts` — (slug, day) → count; `POST /v1/views` upserts
`count + 1`.

Rankings read the two totals tables; nothing stores a rank.

## newsletter — what the owner sends

`newsletter_issues` — `iss_…`, slug UNIQUE, subject, html, text, status
`draft` · `sending` · `sent`, sent_at.
`newsletter_deliveries` — `dlv_…`, (issue_id, subscriber_id) UNIQUE, status
`queued` · `sent` · `failed` · `skipped`, provider_message_id, error,
attempted_at. A broadcast inserts one queued row per confirmed subscriber
(ignoring conflicts), then works the queued rows in batches — re-running a
broadcast resumes where it stopped.

## What is deliberately absent

Users, sessions, organizations, roles, API keys, audit logs, billing,
webhooks, metering. Each is a Cirrus context; none has a reason to exist
when the only principal is one owner token.
