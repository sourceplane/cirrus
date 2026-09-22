# Virga Constitution

Status: Normative

Applies to: every package, app, migration, API, UI surface, CLI command, and
coding agent working in this monorepo.

## Purpose

Virga is a reusable baseline for websites with **one owner and many
visitors**: launch directories, newsletters, portfolios, landing pages. It
provides the durable foundation such a site needs — a public site, the few
write paths a visitor may take, email delivery, and owner operations from
the terminal — on Cloudflare alone, with nothing a single owner has to run.

## Constitutional rules

### 1. Cloudflare-only, extraction-safe

- Compute, routing, storage, cache, mail and public ingress run on
  Cloudflare-managed primitives. Cloudflare is the only provider; adding a
  second one is a constitutional change.
- Cloudflare D1 is the system of record, reached from Workers through the
  `SITE_DB` binding. Resources are provisioned through Orun-controlled CI,
  with Terraform ownership where specified.
- No component may depend on a hosting-specific detail outside its adapter
  layer (mail providers, the D1 executor).

### 2. Contract-first

- `packages/contracts` is defined before or alongside implementation; a
  component may change its internals freely but may not silently change a
  shared contract.
- Specs define behaviour, constraints and acceptance criteria — not
  internals, unless security or platform operation requires it.

### 3. The visitor is anonymous; the owner is a token

- There are no user accounts. Visitors are identified, when they must be, by
  a salted daily fingerprint that cannot be joined to a person.
- The owner authenticates with one bearer secret on routes under
  `/v1/owner/`. No console: owner operations are the CLI and git.
- Any feature that needs a signed-in visitor belongs in Cirrus, not here.

### 4. Content is the configuration

- The site's sections exist because `content/` has files for them. A
  portfolio, a newsletter and a directory are the same tree with different
  content, never different flags.
- Content is authored in the repository (Markdown + frontmatter) and shipped
  by CI. The database holds what visitors produce, never what the owner
  writes.

### 5. Every public write path is bounded

- Rate-limited per fingerprint, size-bounded, validated against the contract,
  and idempotent where a retry is plausible (subscribe, react).
- Abuse controls fail open: a KV or Turnstile outage degrades to accept, it
  never takes the site down.

### 6. Nothing secret at rest that need not be

- Tokens sent to visitors are stored hashed. Provider credentials are
  bindings or Worker secrets resolved at deploy time, never committed. The
  owner token is never logged.

### 7. Verified over asserted

- A milestone is shipped when its suites pass on a real SQLite engine and its
  Worker renders a deployable config from the fixture. A deployment is live
  when phase 08 has recorded it from probed reality.

## Change control

Changing a constitutional rule is a proposal under `ai/proposals/`, accepted
by the Orchestrator and recorded in `ai/context/decisions.md`.
