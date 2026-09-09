# Implementation plan — VG0–VG7

One commit (or PR) per milestone, landing green: `pnpm install && pnpm run
wire:fixture && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## VG0 — Genesis ✅

Workspace skeleton born from Cirrus by selection: root configs, tooling,
`packages/{shared,contracts,db,testing}`, the control migration, `tests/db`
on `node:sqlite`, `verify.yml`, the spec pack, `ai/`, `agents/`.
**Done when** the pipeline is green and no file outside the provenance note
presents the tree as Cirrus.

## VG1 — Data plane ✅

Migrations `010_audience`, `020_forms`, `030_engagement`, `040_newsletter`
and one repository per context (`@site/db/audience` …), with the SQLite
suite round-tripping every method, including conflict and toggle paths.
**Done when** `tests/db` proves apply, idempotence, manifest parity, and
every repository behaviour in `design.md`.

## VG2 — site-api

The public Worker per `components/01-site-api.md`: router, request ids,
error envelope, timings, KV rate limiter (fail-open), CORS, fingerprint,
Turnstile (optional), owner bearer gate, every route; `component.yaml`,
`wrangler.template.jsonc`, `wiring.fixture.json`, docs.
**Done when** `tests/site-api` drives every route through the Worker's
`fetch` against real SQLite + a fake mail binding, and `wire:fixture`
renders a config `wrangler deploy --dry-run` accepts.

## VG3 — mail-worker

Per `components/02-mail-worker.md`: templates, providers, `send`,
`broadcast` with resumable deliveries; template + fixture; docs.
**Done when** `tests/mail-worker` covers templates (escaping, unknown key),
both providers, and a broadcast with a mixed sent/failed outcome that
resumes correctly.

## VG4 — web-site

Per `components/03-web-site.md`: content loader with validation, routes,
islands, RSS/sitemap/robots, sample content for all three shapes,
`site.config.ts`, opennext build, `component.yaml` with the smoke.
**Done when** the sample content builds for Workers, `tests/web-site`
covers the loader and the ranking merge, and `/` renders the site name.

## VG5 — CLI

Per `components/05-cli.md`.
**Done when** `tests/cli` exercises every command against a stubbed
site-api and the bundled bin runs.

## VG6 — Infra + CI

Terraform roots (d1, kv, domain-parked), `db-migrate`, `intent.yaml`,
`ci.yml`, every component's `secretEnv` on `lumen/virga/<env>`, wiring
verified for both Workers, README layout matches the tree.
**Done when** every Worker dry-run deploys from its fixture and the
composition types/parameters are the ones Cirrus proved.

## VG7 — Baseline machinery

`blueprint.yaml`, `repo-blueprint.yaml`, `flows/` re-targeted (01 scaffold …
08 docs, `00-all`, common, agent brief), `BOOTSTRAP.md`, docs close-out,
`IMPLEMENTATION-STATUS.md` as-built.
**Done when** no phase references a Cirrus-only component and the repo
blueprint names every directory in the tree.
