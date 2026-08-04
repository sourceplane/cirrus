# Open Risks

Last updated: 2026-08-04

Live risks for the Cirrus baseline. Add entries as they surface; close them
with a note when mitigated.

## Active Risks

### Not yet exercised end to end

- **No full Cirrus bootstrap has been run.** The phase workflows are
  inherited from Lumen, where they are proven; what is unproven here is phase
  03 against D1 and the `d1-edit` token path. The first real bootstrap should
  be treated as a test, watched, and its timings written back into
  `flows/phases/TIMINGS.md`.
- **The `d1-edit` scope template must exist in the platform's Cloudflare
  integration** for `create-secrets.sh` to mint `CLOUDFLARE_D1_TOKEN`. If the
  connected account's parent token lacks D1 Write, the mint is refused with
  `parent_grant_insufficient` — the operator must re-issue the Cloudflare
  token with that permission group and re-connect.

### D1 semantics

- **No rollback inside `executor.transaction(...)`.** A multi-statement
  mutation that fails partway leaves earlier statements applied. The ~20 call
  sites were written against Postgres; each is a place where a partial write
  is now possible and the compensating path (or a reshaped single statement)
  has not been individually reviewed.
- **D1 has per-database size and query limits** that Postgres did not.
  Nothing in this baseline approaches them today, but a high-volume metering
  or events workload would be the first to find out.
- **Migration failures are not atomic.** A statement failing mid-migration
  leaves the preceding statements applied. Every migration is written
  idempotently and the ledger row is written last, so a re-run heals — but a
  migration that is NOT idempotent would break this and nothing enforces it
  beyond review and the twice-applied test.

### Operational

- Secrets must never be logged. Reports may include resource ids, secret
  NAMES, and non-secret facts only; no tooling in this repo prints a value,
  and no document under `ai/context/` may contain one.
- `dev` has no database by design. Tasks must not add one unless a decision
  entry changes that scope.
- Production OAuth/magic-link auth and Stripe need human-supplied credentials
  before those surfaces work end to end (`orun secrets set … --env <env>`;
  wire-now-seed-later — nothing blocks on them).
- Notifications email needs one-time Cloudflare Email Service setup: Workers
  Paid plan and the sending domain verified (DKIM/SPF).
- GitHub Actions billing exhaustion presents as failing lanes with NO logs
  anywhere — the real message lives only in check-run annotations
  (`gh api repos/<o>/<r>/check-runs/<id>/annotations`).
