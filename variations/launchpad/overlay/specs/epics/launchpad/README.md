# Epic: launchpad — the launch directory

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** — E1–E4 shipped (MVP slice); E5–E6 open |
| Cluster | **LP** |
| Owner(s) | launches-worker, api-edge (`launches-facade`), packages/{db,contracts,sdk}, web-console-next |
| Target branch | `main` |
| Builds on | Cirrus Solo profile (`specs/profiles/solo-m0.md`), identity, billing, notifications |
| Decisions locked | user-scoped (`/v1/me/...`, no org in any path); public reads need no session; one upvote per user; drafts invisible until launched; a maker profile is required to launch |

## Thesis

500+ products launch on Product Hunt every day and indie makers are moving to
smaller, curated directories. Launchpad is that directory: submit, launch,
upvote, comment, and a public profile per maker — with the whole SaaS
substrate (auth, billing, email, audit) inherited from the baseline.

## Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| E1 | Foundation — born from Cirrus, Solo on, credential-free checks CI | ✅ Shipped |
| E2 | Domain worker + data — `launches-worker`, migration `200_launches_core`, `@saas/db/launches`, `@saas/contracts/launches`, SQLite + router tests | ✅ Shipped |
| E3 | Edge + SDK — `launches-facade` (public reads, session writes), `client.launches`, facade tests | ✅ Shipped |
| E4 | Console — My launches / Submit / Edit / Maker profile; public Explore, product page, maker page; Solo nav + tabs | ✅ Shipped |
| E5 | Monetisation & notifications — pro entitlement (featured launch, analytics) via per-user Polar billing; "your launch is live" + weekly digest email | 🗓️ Planned |
| E6 | Launch readiness — OG images, sitemap, docs, live verification | 🗓️ Planned |

## Surface

See `apps/launches-worker/docs/architecture.md` for the route table.
