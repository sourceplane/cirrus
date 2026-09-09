# 01 — site-api

Status: Planned (VG2) · Owner: `apps/site-api`

The only publicly routable Worker. Every visitor write path and every owner
read path terminates here; it holds no provider credential except the D1 and
KV bindings and the `OWNER_TOKEN` secret.

## Routes

| Method | Path | Auth | Body / query → response |
|---|---|---|---|
| GET | `/health` | — | `HealthResponse` (D1 probe: `degraded` when unreachable) |
| POST | `/v1/subscribers` | rate limit, Turnstile? | `SubscribeRequest` → `SubscribeResponse` (202) |
| GET | `/v1/subscribers/confirm?token=` | token | → `ConfirmSubscriptionResponse`, or 302 to `SITE_URL/confirm?ok=1` when `redirect=1` |
| POST | `/v1/subscribers/unsubscribe` | token | `UnsubscribeRequest` → `UnsubscribeResponse` |
| POST | `/v1/forms/:form` | rate limit, honeypot, Turnstile? | `FormSubmitRequest` → `FormSubmitResponse` (202) |
| GET | `/v1/reactions/:slug` | — | → `ReactionSummary` (viewer flags from the fingerprint) |
| POST | `/v1/reactions/:slug` | rate limit | `ReactRequest` → `ReactionSummary` (toggle) |
| POST | `/v1/views/:slug` | rate limit | → 204 |
| GET | `/v1/views/:slug` | — | → `ViewSummary` |
| GET | `/v1/launches/top?prefix=&windowDays=&limit=` | — | → `RankedSlug[]` |
| GET | `/v1/owner/subscribers?status=&cursor=&limit=` | owner | → `Page<Subscriber>` |
| GET | `/v1/owner/subscribers/export` | owner | → `text/csv` |
| GET | `/v1/owner/submissions?form=&status=&cursor=&limit=` | owner | → `Page<Submission>` |
| PATCH | `/v1/owner/submissions/:id` | owner | `UpdateSubmissionRequest` → `Submission` |
| GET/POST | `/v1/owner/issues` | owner | `CreateIssueRequest` → `Issue` |
| GET | `/v1/owner/issues/:id` | owner | → `Issue` + delivery counts |
| POST | `/v1/owner/issues/:id/send` | owner | → `IssueSendReport` (via mail-worker broadcast) |
| GET | `/v1/owner/stats` | owner | → `SiteStats` |

## Invariants

- Error envelope: `{ error: { code, message, details, requestId } }`; every
  response carries `x-request-id`.
- Owner auth: `Authorization: Bearer <OWNER_TOKEN>`, compared in constant
  time; a missing secret makes every owner route 503, never open.
- Rate limits: KV token bucket per fingerprint per route family; fail-open
  with a warning log. `X-RateLimit-*` headers on every limited route.
- CORS: `SITE_ORIGINS` (comma-separated) plus localhost in non-prod.
- Slugs match `SLUG_RE`; form keys match `FORM_KEY_RE`; emails match
  `EMAIL_RE` after normalization.
- Mail is requested through the `MAIL_WORKER` service binding; a mail
  failure never fails a subscribe (the row is pending, the mail is retried on
  the next subscribe).

## Bindings

`SITE_DB` (D1), `RATE_LIMIT_KV` (KV), `MAIL_WORKER` (service). Vars:
`ENVIRONMENT`, `SITE_URL`, `SITE_ORIGINS`, `SITE_NAME`. Secrets:
`OWNER_TOKEN`, `FINGERPRINT_SALT`, `TURNSTILE_SECRET` (optional).
