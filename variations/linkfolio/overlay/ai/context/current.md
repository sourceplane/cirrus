# Current Context

Linkfolio is a user-scoped product born from the Cirrus baseline (Solo
profile). The product bounded context is `pages` (`apps/pages-worker`,
`packages/db/src/pages`, migration `200_pages_core`), reached through the
api-edge `pages-facade` and surfaced by the console at `/page` (editor,
appearance, analytics) and the public `/p/:handle`.

Verified: typecheck, build and the full test suite pass locally and in
`.github/workflows/checks.yml`. Not verified: no live deployment yet —
`ci.yml` needs the repo linked to an Orun Cloud workspace.

Next: E5 (per-user pro entitlement, click digest emails) and E6 (OG images,
sitemap, live verification) in `specs/epics/linkfolio/`.
