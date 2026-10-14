# monitors-worker — runbook

- Health: `GET /health` reports whether `PLATFORM_DB` is bound.
- The cron wakes every minute and probes at most 100 due monitors, 10 at a
  time. If a wake is missed, the next one picks up everything still due.
- `last_status` and `consecutive_failures` are a cache of the check history: if
  they ever disagree with `monitors_checks`, the checks are the truth.
- An incident is open exactly while `resolved_at IS NULL`; the monitor being
  `down` is the same condition, which is what the check path reads.
- Handles are unique across the product; a 409 on `PUT /v1/me/status-page`
  means the handle is taken.
