# Current Context

Pulsewatch is a user-scoped product born from the Cirrus baseline (Solo
profile). The product bounded context is `monitors` (`apps/monitors-worker`,
`packages/db/src/monitors`, migration `200_monitors_core`), reached through the
api-edge `monitors-facade` and surfaced by the console at `/monitors`,
`/incidents` and `/status-page`, plus the public `/status/:handle`.

The worker has two entry points: `fetch` for the API and `scheduled` for the
cron that actually probes. The rules that decide when something is "down" live
in `apps/monitors-worker/src/incidents.ts`; the probe is injected via `Deps`
so every test supplies a fake and no test reaches the network.

Verified: typecheck, build and the full test suite pass locally and in
`.github/workflows/checks.yml`. Not verified: no live deployment yet —
`ci.yml` needs the repo linked to an Orun Cloud workspace, and the cron has
never run against real endpoints.

Next: E5 (pro entitlement, incident emails) and E6 in
`specs/epics/pulsewatch/`.
