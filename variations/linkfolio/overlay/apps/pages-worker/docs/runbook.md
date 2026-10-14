# pages-worker — runbook

- Health: `GET /health` reports whether `PLATFORM_DB` is bound.
- Handles are unique across the product; a 409 on `PUT /v1/me/page` means the
  handle is taken and the caller must choose another.
- Reorder rewrites positions in two passes (park, then place) because D1 has no
  interactive transaction; a failure mid-flight leaves blocks parked at
  positions ≥ 1000, which the next successful reorder repairs.
- Clicks are append-only and referrer text is visitor-supplied: it is truncated
  and never rendered as markup.
