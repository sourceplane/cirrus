# habits-worker — runbook

- Health: `GET /health` reports whether `PLATFORM_DB` is bound.
- A check-in is idempotent per `(habit, date)`; a repeated tap updates the note
  rather than doubling the streak.
- Reorder rewrites positions in two passes (park, then place) because D1 has no
  interactive transaction; a failure mid-flight leaves habits parked at
  positions ≥ 1000, which the next successful reorder repairs.
- Deleting a habit deletes its check-ins first: D1 enforces the foreign key.
