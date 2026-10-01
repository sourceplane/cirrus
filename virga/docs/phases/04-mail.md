# 04-mail — the migration runner and the mail Worker

**Lands:** `infra/db-migrate`, `apps/mail-worker`, `tests/mail-worker`.

The migration runner applies every migration to the databases
`03-infrastructure` created, then the mail Worker deploys against them.

## It will not start until the wiring is published

`requires.secrets` blocks on `orun.secrets/exists@v1` finding both `WIRING_*`
keys on stage and prod, polling for up to ten minutes. The Workers read their
D1 and KV ids from those secrets; starting without them would deploy a Worker
bound to nothing.

## What the mail Worker is

Internal — service-bound, never publicly routed. Four escaped templates, a
local-debug provider and a Cloudflare Email Service provider, and resumable
newsletter broadcasts: one delivery row per confirmed subscriber, a batch
budget per run, and a per-recipient HMAC unsubscribe URL derived rather than
stored.

**Real email is human-gated.** Cloudflare Email Service needs a Workers Paid
plan and a domain verified in the account. The local-debug provider is what
this phase's convergence proves; sending for real is an operator step recorded
in `ai/deferred.md`.

## Verified by

The convergence run after the merge: the migrations applied and the mail
Worker deployed on both environments. There is no probe — the Worker has no
public route, which is the point.
