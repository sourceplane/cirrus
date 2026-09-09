# virga

Reusable **Cloudflare-only** baseline for **single-owner websites** — launch
directories (Product Hunt–style), newsletters, portfolios, landing pages —
built as an [Orun](https://opencode.ai/docs) component-native desired-state
repo. The visitor is the user; the owner ships from git and a CLI. There is
no console.

Virga is a variation of [Cirrus](https://github.com/sourceplane/cirrus), the
Cloudflare-only multi-tenant SaaS baseline. It keeps Cirrus's data plane
(Workers, D1, KV, Email Service), its Orun CI, its deploy-time wiring and its
phased bootstrap, and replaces the 12-worker tenancy fleet plus the console
with three deployables:

| Deployable | Role |
|---|---|
| `apps/site-api` | The public edge Worker: subscribers (double opt-in), form submissions, reactions/upvotes, view counters, launch rankings, and bearer-token owner routes. |
| `apps/mail-worker` | Internal Worker behind a service binding: transactional mail and newsletter broadcasts through Cloudflare Email Service (or a local-debug provider). |
| `apps/web-site` | Next.js on Workers + Static Assets. Content lives in `content/` as Markdown with frontmatter; the site renders whichever sections have content, so one baseline yields a portfolio, a newsletter or a directory by content alone. |

## Live deployment

<!-- 08-docs:begin -->
_Not yet recorded — run `flows/phases/08-docs` after phase 06 to fill this
section from verified live state._
<!-- 08-docs:end -->

## Status

- **VG0 (genesis)**: the workspace skeleton — tooling, `packages/{shared,
  contracts,db,testing}`, the control migration, `tests/db` on a real SQLite
  engine, the spec pack. `verify.yml` is the merge gate until bootstrap.
- Everything else is tracked in
  [`specs/epics/virga-baseline/`](specs/epics/virga-baseline/README.md).

## Prerequisites

- Node.js >= 22.5 (`node:sqlite` backs the test suites; CI and components run on Node 22)
- pnpm >= 10 (`npm install -g pnpm`)
- (Optional, for local Orun validation) the `kiox` CLI on your `PATH`.

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # render wrangler configs from the committed fixtures
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Workspace layout

```
apps/site-api             Public HTTP entry point (Cloudflare Worker)
apps/mail-worker          Transactional mail + newsletter broadcasts (internal Worker)
apps/web-site             Next.js site (Cloudflare Workers + Static Assets)

packages/contracts        Shared API types and validators
packages/db               D1 executor, migrations, manifest, runner, repositories
packages/cli              `virga` owner CLI
packages/shared           Generic helpers (ids, errors) — no domain logic
packages/testing          Test fixtures + a real-SQLite D1 binding

infra/terraform/cloudflare-d1      D1 database provisioning (stage/prod)
infra/terraform/cloudflare-kv      site-api rate-limit / idempotency KV namespace
infra/terraform/cloudflare-domain  Zone adoption + site custom domain
infra/db-migrate                   Database migration runner component

tooling/tsconfig          Shared TypeScript configurations
tooling/eslint            Shared ESLint configuration
tooling/wire              Deploy-time wrangler config renderer
tooling/migrations        Manifest checksum tool
tests/*                   Per-component test suites
```

## Provenance

Virga was born from `sourceplane/cirrus` at `8f41d16` — see
[`ai/context/provenance.md`](ai/context/provenance.md) for what was kept,
what was dropped and why.
