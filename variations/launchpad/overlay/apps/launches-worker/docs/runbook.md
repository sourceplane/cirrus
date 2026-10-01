# launches-worker — runbook

- Health: `GET /health` reports whether `PLATFORM_DB` is bound.
- Denormalised counters (`upvote_count`, `comment_count`) are maintained by the
  writes; a mismatch is repaired by recounting from `launches_upvotes` /
  `launches_comments`.
- Slugs and handles are unique across the directory; a 409 on create means the
  caller must pick another.
