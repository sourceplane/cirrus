# 02 — mail-worker

Status: Implemented (VG3) · Owner: `apps/mail-worker`

Internal Worker (no public route; `workers_dev: false`) reached through
site-api's `MAIL_WORKER` service binding. Renders templates, sends through the
configured provider, records broadcast deliveries.

## Routes

| Method | Path | Body → response |
|---|---|---|
| GET | `/health` | `HealthResponse` |
| POST | `/v1/mail/send` | `MailSendRequest` → `MailSendResponse` |
| POST | `/v1/mail/broadcast` | `BroadcastRequest` → `IssueSendReport` |

## Templates

`subscribe.confirm` (confirmUrl), `subscribe.welcome` (siteName, siteUrl),
`form.receipt` (form, fields as a bounded list — sent to `OWNER_EMAIL`),
`issue.broadcast` (subject, html, text, unsubscribeUrl). All substitutions
HTML-escaped; unknown keys render nothing; unknown template keys fail the
send with `unknown_template:<key>`.

## Providers

`MAIL_PROVIDER=local-debug` records the rendered message and returns a
synthetic id; `cloudflare-email` sends through the `EMAIL` `send_email`
binding from `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME`. A misconfigured real
provider falls back to local-debug with a warning: the worker must always
deploy.

## Broadcast semantics

Insert one `queued` delivery per confirmed subscriber (`ON CONFLICT DO
NOTHING`), set the issue `sending`, then work queued rows in batches of
`batchSize` (default 50): render with that subscriber's unsubscribe URL,
send, mark `sent`/`failed` with the bounded error. When no queued rows remain
the issue is `sent`. A run works at most 20 batches and reports
`sending` with the remaining `queued` count; re-running resumes from the
queued rows and nothing is sent twice.
