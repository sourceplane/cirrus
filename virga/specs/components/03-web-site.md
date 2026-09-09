# 03 — web-site

Status: Planned (VG4) · Owner: `apps/web-site`

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

`site.config.ts`: `name`, `tagline`, `url`, `apiUrl`, `social`, `nav`,
`sections` (auto: a section renders when its folder has content; can be
forced off). `NEXT_PUBLIC_SITE_API_URL` overrides `apiUrl` per environment.

## Routes

`/`, `/posts`, `/posts/[slug]`, `/projects`, `/launches`, `/launches/[slug]`,
`/[page]`, `/subscribe`, `/confirm`, `/unsubscribe`, `/contact`, `/rss.xml`,
`/sitemap.xml`, `/robots.txt`.

## Islands (client components)

`SubscribeForm`, `ContactForm`, `UpvoteButton`, `ViewBeacon` — each talks to
site-api with `fetch`, degrades to a static message when the API is down,
and renders nothing that needs the API for the page to be readable.

## Smoke

`/` contains the site name; site-api `/health` is `ok`.
