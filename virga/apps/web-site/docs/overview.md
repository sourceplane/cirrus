# web-site

The public site: Next.js 15 (App Router) delivered by `@opennextjs/cloudflare`
on Workers + Static Assets. Every page is statically generated from
`content/` at build time; the client islands (subscribe, contact, upvote,
view beacon, ranked launches) call site-api from the browser.

The contract is `specs/components/03-web-site.md`. Identity lives in
`site.config.ts`; content in `content/{posts,projects,launches,pages}`.

## Depends on

- **site-api** (browser calls; the deploy smoke checks its `/health`)

## Depended on by

- (none)
