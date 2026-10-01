# Current Context

Launchpad is a single-user product on the Solo profile. The product bounded context is `launches` (`apps/launches-worker`,
`packages/db/src/launches`, migration `200_launches_core`), reached through
the api-edge `launches-facade` and surfaced by the console under `/launches`,
`/profile` and the public `/explore` and `/makers/:handle` routes.

Verified: typecheck and the full test suite pass locally and in
`.github/workflows/checks.yml`. Not verified: no live deployment yet —
`ci.yml` needs the repo linked to an Orun Cloud workspace.

Next: E5 (per-user pro entitlement, launch/digest emails) and E6 (OG images,
sitemap, live verification) in `specs/epics/launchpad/`.
