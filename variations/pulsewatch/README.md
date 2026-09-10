# Variation: pulsewatch — uptime monitoring

HTTP monitors checked on a Cloudflare cron, incidents opened after two
consecutive failures, and a public status page per developer. Register row:
[`specs/variations/README.md`](../../specs/variations/README.md). Epic issue:
[sourceplane/cirrus#29](https://github.com/sourceplane/cirrus/issues/29).

- `values.json` — the rebrand identity (repo `pulsewatch`, product "Pulsewatch").
- `overlay/` — every file the variation adds or changes over the baseline,
  authored in baseline naming (the rebrand renames at materialize time):
  `apps/monitors-worker` (with `fetch` **and** `scheduled` handlers, the
  incident rules in `src/incidents.ts` and the injected probe in
  `src/probe.ts`), migration `200_monitors_core`, `@saas/db/monitors`,
  `@saas/contracts/monitors`, api-edge `monitors-facade` (+ `MONITORS_WORKER`
  binding, `monitors` rate-limit family), `client.monitors` in the SDK, the
  console's product registration and pages (Monitors, detail, Incidents,
  Status page, public status page), tests, README/specs.

This is the only variation whose worker carries a cron trigger
(`"crons": ["* * * * *"]` per environment in `wrangler.template.jsonc`).

```bash
tooling/variations/materialize.sh pulsewatch ~/sourceplane/pulsewatch --verify
cd ~/sourceplane/pulsewatch && git remote add origin git@github.com:sourceplane/pulsewatch.git && git push -u origin main
```
