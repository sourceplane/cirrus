# Epic: linkfolio — the creator page

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** — E1–E4 shipped (MVP slice); E5–E6 open |
| Cluster | **LF** |
| Owner(s) | pages-worker, api-edge (`pages-facade`), packages/{db,contracts,sdk}, web-console-next |
| Target branch | `main` |
| Builds on | the Solo profile (`specs/profiles/solo-m0.md`), identity, billing, notifications |
| Decisions locked | user-scoped (`/v1/me/page...`, no org in any path); the public page AND its click endpoint are anonymous; an unpublished page 404s; a block's kind is fixed once created; reorder demands a complete permutation |

## Thesis

Link-in-bio builders, creator storefronts and tip jars are the standard creator
stack in 2026. Linkfolio is one page per creator with the whole SaaS substrate
(auth, billing, email, audit) inherited from the baseline, so the product work
is the page itself.

## Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| E1 | Foundation — platform in place, Solo profile on, credential-free checks CI green | ✅ Shipped |
| E2 | Domain worker + data — `pages-worker`, migration `200_pages_core`, `@saas/db/pages`, `@saas/contracts/pages`, SQLite + router tests | ✅ Shipped |
| E3 | Edge + SDK — `pages-facade` (anonymous visitor traffic, session-only owner routes), `client.pages`, facade tests | ✅ Shipped |
| E4 | Console — editor (page + blocks + reorder), Appearance, Analytics, public page | ✅ Shipped |
| E5 | Monetisation & notifications — pro entitlement (custom domain, unlimited blocks, badge removal) via per-user Polar billing; product/tip checkout; weekly click digest | 🗓️ Planned |
| E6 | Launch readiness — OG image per page, sitemap, docs, live verification | 🗓️ Planned |

## Surface

See `apps/pages-worker/docs/architecture.md` for the route table.

## Open risks

- **Products and tips link out; they do not charge.** A product block carries a
  price and a URL, so payment happens wherever the creator already sells. E5
  decides whether checkout moves in-product (billing-worker) or stays external.
- **Click counts are un-deduplicated by design.** One row per tap, no visitor
  identity, no bot filter. If that proves noisy, the fix is a fingerprint window
  in `pages-worker`, not a schema change.
