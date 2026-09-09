# Design — domain and API

Status: Normative for VG1–VG5

## Principals

| Principal | Identified by | Can |
|---|---|---|
| Visitor | nothing, or a daily fingerprint `sha256(ip + ua + FINGERPRINT_SALT + yyyy-mm-dd)` | read everything public; subscribe; send a form; toggle a reaction; be counted |
| Subscriber | an email address + single-purpose hashed tokens | confirm; unsubscribe; receive issues |
| Owner | `OWNER_TOKEN` bearer | everything under `/v1/owner/` |
| mail-worker | the `MAIL_WORKER` service binding (no public route) | render and send |

## Request flow

```
browser ──► web-site (Workers + Assets)      static + SSR; islands call ▼
        ──► site-api (public Worker) ──► SITE_DB (D1)
                                     ──► RATE_LIMIT_KV (KV)
                                     ──► MAIL_WORKER (service binding) ──► EMAIL (send_email) / local-debug
                                                                        ──► SITE_DB (deliveries)
owner  ──► virga CLI ──► site-api /v1/owner/* (bearer)
```

## Subscribe, confirm, unsubscribe

1. `POST /v1/subscribers {email}` → normalize → upsert:
   - none: insert `pending` with a fresh confirm token; mail `subscribe.confirm`.
   - pending: rotate token; re-mail (rate-limited: one per address per 10 min via KV).
   - confirmed: respond `confirmed`, mail nothing.
   - unsubscribed: back to `pending`, fresh token, mail.
   Response is `202 {status}` in every case — the endpoint never reveals
   whether an address was known.
2. `GET /v1/subscribers/confirm?token=` → hash → find pending → set
   `confirmed`, clear confirm token, mint unsubscribe token; mail
   `subscribe.welcome`. Unknown/used token → 404.
3. `POST /v1/subscribers/unsubscribe {token}` → hash → set `unsubscribed`.
   Tokens embedded in every issue are per-subscriber and survive until the
   next status change.

## Forms

`POST /v1/forms/:form {fields, honeypot?}`: honeypot non-empty → `202`
and drop (bots learn nothing); validate bounds; store `new`; if
`OWNER_EMAIL` is set, mail `form.receipt` to the owner (best effort).

## Reactions and views

`POST /v1/reactions/:slug {kind}` toggles the (slug, kind, fingerprint) row
and adjusts the total in the same statement list; returns the summary with
`viewer[kind]` reflecting the new state. `GET` returns totals + viewer flags.
`POST /v1/views/:slug` upserts today's counter; `GET` returns total and
last-7-day sums. `GET /v1/launches/top` ranks `slug` under `prefix` by
`upvotes * 3 + log10(views + 1)`, optionally limiting reactions to the last
`windowDays`.

## Owner routes

Cursor pagination is `createdAt|id` base64; limits clamp to 500. CSV export
streams `email,status,source,tags,created_at,confirmed_at`. `POST
/v1/owner/issues/:id/send` calls mail-worker's broadcast and returns its
report; sending a `sent` issue is 409.

## Error and timing envelopes

Inherited from Cirrus: `{ error: { code, message, details, requestId } }`,
`x-request-id` in and out, `Server-Timing` phases on every response.

## Rate limits (per fingerprint, token bucket in KV, fail-open)

| family | limit / window |
|---|---|
| subscribe | 5 / 10 min |
| forms | 5 / 10 min |
| reactions | 60 / min |
| views | 120 / min |
| owner | 120 / min (per token hash) |
| public reads | in-isolate only, 300 / min |
