# monitors-worker — architecture

A `cloudflare-worker-turbo` component built from `apps/monitors-worker`, with
both a `fetch` and a `scheduled` handler.

## Bindings and wiring

- **D1** → `PLATFORM_DB` (tables prefixed `monitors_`; migration `200_monitors_core`).
- **Cron** → `* * * * *` per environment; the scheduler probes only monitors
  whose own interval has elapsed.
- No service bindings: the actor arrives on trusted internal headers set by
  api-edge; there is no organization to consult.

## Surface

| Route | Auth | Purpose |
|---|---|---|
| `GET` / `POST /v1/me/monitors` | user | list with rollups / create |
| `GET` / `PATCH` / `DELETE /v1/me/monitors/:id` | user | read / edit / delete with its history |
| `GET /v1/me/monitors/:id/checks?limit=` | user | recent probe results |
| `POST /v1/me/monitors/:id/check` | user | probe now, through the same state machine as the cron |
| `GET /v1/me/incidents?limit=` | user | open incidents first, then history |
| `GET` / `PUT /v1/me/status-page` | user | status-page settings (handle, title, public) |
| `GET /v1/status/:handle` | public | the status page: names, status, uptime, incidents |

## The rules

- `src/incidents.ts` is the state machine: one failure is a blip, **two
  consecutive failures** open an incident and flip the monitor to `down`; the
  first success resolves it immediately.
- `src/probe.ts` is the only code that reaches the outside world, and it is
  injected — every test supplies a fake. It refuses loopback, link-local and
  private addresses, since our own infrastructure makes the request.
- `src/checks.ts` orders its writes by what a failure between them would cost:
  the check row (evidence), then the incident (story), then the monitor's own
  state (a summary recomputable from the other two). D1 has no interactive
  transaction, so the order is the guarantee.
