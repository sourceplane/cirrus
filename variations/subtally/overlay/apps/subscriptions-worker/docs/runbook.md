# subscriptions-worker — runbook

- Health: `GET /health` reports whether `PLATFORM_DB` is bound.
- Totals are per currency by design: the product never converts between them.
- A paused or cancelled subscription keeps its row and its history but is
  excluded from totals and from upcoming renewals.
- The cadence/interval CHECK rejects a custom cadence with no interval; the
  worker validates the same rule first, so a 500 from that constraint means the
  two have drifted apart.
