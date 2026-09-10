# Epic: pulsewatch — uptime monitoring

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** — E1–E4 shipped (MVP slice); E5–E6 open |
| Cluster | **PW** |
| Owner(s) | monitors-worker, api-edge (`monitors-facade`), packages/{db,contracts,sdk}, web-console-next |
| Target branch | `main` |
| Builds on | the Solo profile (`specs/profiles/solo-m0.md`), identity, billing, notifications |
| Decisions locked | user-scoped (`/v1/me/...`, no org in any path); two consecutive failures open an incident, the first success resolves it; the public status page never exposes a URL; the probe is injected and refuses private addresses; a private status page 404s |

## Thesis

"Developer uptime monitors" and "tiny status-page tools" are named among the
narrow tools people already pay for. Pulsewatch is that, with the SaaS
substrate inherited from the baseline — so the product work is the scheduler,
the incident rules and the page a user reads at 3am.

## Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| E1 | Foundation — platform in place, Solo profile on, credential-free checks CI green | ✅ Shipped |
| E2 | Domain worker + data — `monitors-worker` with its cron, migration `200_monitors_core`, `@saas/db/monitors`, `@saas/contracts/monitors`, incident + SQLite + router/scheduler tests | ✅ Shipped |
| E3 | Edge + SDK — `monitors-facade` (public status read, session everywhere else), `client.monitors`, facade tests | ✅ Shipped |
| E4 | Console — Monitors, monitor detail with "check now", Incidents, Status page settings, public status page | ✅ Shipped |
| E5 | Monetisation & notifications — pro entitlement (1-minute interval, more monitors, custom domain) via per-user Polar billing; incident-opened and resolved emails | 🗓️ Planned |
| E6 | Launch readiness — status-page polish, docs, live verification | 🗓️ Planned |

## Surface

See `apps/monitors-worker/docs/architecture.md` for the route table and
`apps/monitors-worker/src/incidents.ts` for the rules.

## Notes from the build

- **The scheduler's due-check must not use `julianday`.** It is a float: an
  exactly-due monitor came out at 3599.99999 seconds against a 3600-second
  interval and was skipped, delaying every check by a whole tick. The query
  compares ISO-8601 text against a per-row threshold instead, which is exact.
  The SQLite suite pins the boundary to the millisecond.
- The probe refuses loopback, link-local and private addresses, since our own
  infrastructure makes the request. That is a coarse guard, not a full defence
  against DNS rebinding — E6 should decide whether that matters at this scale.
- Notifications (E5) are the point of an uptime monitor for most people; until
  then an incident is only visible in the console and on the status page.
