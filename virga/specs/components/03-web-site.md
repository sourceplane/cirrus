# 03 — web-site

Status: Implemented (VG4) · Owner: `apps/web-site`

Next.js 15 (App Router) delivered by `@opennextjs/cloudflare` on Workers +
Static Assets — the same composition as the Cirrus console, public instead
of authenticated.

## Content

```
content/
  posts/*.md       title, date, summary, tags?, draft?        → /posts/[slug], RSS
  projects/*.md    title, summary, url?, repo?, order?        → /projects
  launches/*.md    title, tagline, url, maker?, date, tags?   → /launches (ranked), /launches/[slug]
  pages/*.md       title, nav?                                → /[slug]
```

Frontmatter is validated at build; a bad file fails the build with the file
name and the field. `draft: true` files are excluded outside `dev`.

## Configuration

`site.config.ts`: `name`, `tagline`, `description`, `url`, `apiUrl`, `author`,
`social`, `nav`, `sections` (auto: a section renders when its folder has
content; can be forced off), `copy`. `NEXT_PUBLIC_SITE_API_URL` and
`NEXT_PUBLIC_SITE_URL` override per environment at build time.

## Routes

`/`, `/posts`, `/posts/[slug]`, `/projects`, `/launches`, `/launches/[slug]`,
`/[page]`, `/subscribe`, `/confirm`, `/unsubscribe`, `/contact`, `/rss.xml`,
`/sitemap.xml`, `/robots.txt`. Every content route is prerendered at build
(the loader reads `content/` with `node:fs`, which does not exist in the
Worker); only `/confirm` and `/unsubscribe` render on demand, from their
query string.

## Islands (client components)

`SubscribeForm`, `ContactForm`, `UpvoteButton`, `ViewBeacon`, `ViewCount`,
`RankedLaunches` (static order first, live ranking merged in) — each talks to
site-api with `fetch`, degrades to a static message when the API is down,
and renders nothing that needs the API for the page to be readable.

## Smoke

`/` contains the site name; site-api `/health` is `ok`.
