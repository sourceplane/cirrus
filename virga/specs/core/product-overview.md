# Product overview

Status: Normative

## What Virga is

A baseline a person clones to ship a website that has an audience:

- **A launch directory** — products or projects listed as `content/launches`,
  ranked by upvotes, each with a page, a view counter and a "submit yours"
  form.
- **A newsletter** — issues written as `content/posts`, a subscribe form with
  double opt-in, an archive, RSS, and a `virga issues send` that broadcasts
  an issue to every confirmed subscriber.
- **A portfolio** — `content/projects` and `content/pages`, a contact form,
  a subscribe box, view counts the owner reads from the terminal.
- **A landing page** — one page, one form, one list.

All four are the same tree. The site renders the sections its content
folders fill.

## Who it is for

One owner. They write Markdown, push, and run a few CLI commands. They never
log in to anything Virga runs; the only thing they hold is `OWNER_TOKEN`.

## What visitors can do

| Action | Route | Guarded by |
|---|---|---|
| Subscribe | `POST /v1/subscribers` → confirm link | rate limit, Turnstile (optional), double opt-in |
| Confirm / unsubscribe | `GET /v1/subscribers/confirm`, `POST /v1/subscribers/unsubscribe` | single-purpose hashed tokens |
| Send a form | `POST /v1/forms/:form` | rate limit, honeypot, Turnstile (optional), size bounds |
| React (upvote/like) | `POST /v1/reactions/:slug` | one per fingerprint per slug, toggles |
| Be counted | `POST /v1/views/:slug` | rate limit, daily counters only |
| Read counts / rankings | `GET /v1/reactions/:slug`, `GET /v1/views/:slug`, `GET /v1/launches/top` | public, cached |

## What the owner can do

`virga subscribers list|export`, `virga submissions list|mark`,
`virga issues create|list|send`, `virga stats`, `virga health` — all through
`/v1/owner/*`.

## What Virga is not

- Not multi-tenant, not multi-user: no organizations, roles, sessions or
  API keys. That is Cirrus.
- Not a CMS: content is files in git.
- Not a payments product: no billing. A paid newsletter is a Cirrus product
  with a Virga front.
