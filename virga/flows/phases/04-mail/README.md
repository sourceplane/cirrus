# Phase 04 — mail

Lands the **mail worker** (`flows/phases/04-mail/blueprint.yaml`) and proves
it deploys.

## What it lands

`apps/mail-worker` (+ its test component): the internal Worker that renders
the four templates and sends them, with the D1 binding (database id from
`WIRING_CLOUDFLARE_D1`) and, on stage/prod, the Email Service `send_email`
binding.

**One landing, no cycle-break.** The Cirrus fleet phase this replaces had to
strip and restore service-binding feedback edges because its workers pointed
at each other. Virga's worker graph is acyclic — `site-api → mail-worker`,
one way — so the phase is a single apply → land → converge.

## Inputs

`out`, `workspace`, optional `dryrun` (see [the phases README](../README.md)).

## Steps

1. **preflight** — workspace readiness.
2. **apply** → **land** → **converge** — the standard contract
   (PR `phase(04-mail): mail worker`).
3. **verify** — nothing to probe: the worker is internal
   (`workers_dev: false`, reachable only through site-api's service binding),
   so the deploy lane's own dry-run, deploy and smoke are the verification.

## Verify / done means

The convergence is green on stage and prod, which means `wrangler deploy`
accepted the rendered config on both.

## Troubleshooting

- **Deploy lane: missing `WIRING_CLOUDFLARE_D1`**: phase 03 has not applied
  (or its apply failed) — that phase publishes the wiring document this one
  renders its `database_id` from.
- **Deploy succeeds but no mail arrives**: expected until the account is
  set up. `MAIL_PROVIDER` is `local-debug` outside prod, and
  `cloudflare-email` needs Workers Paid plus the sending domain verified in
  Email Service (DKIM/SPF) with `EMAIL_FROM_ADDRESS` on it. Failed sends are
  recorded on `newsletter_deliveries`, never silent.

## Example commands

```bash
# local mode, from the baseline checkout
orun workflow run flows/phases/04-mail/workflow.yaml \
  --set out=~/sourceplane/acme --set workspace=ws_XXXXXXXX

# preview, changing nothing
orun workflow run flows/phases/04-mail/workflow.yaml \
  --set out=~/sourceplane/acme --set workspace=ws_XXXXXXXX --set dryrun=true
```
