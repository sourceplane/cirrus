# Epic: virga-baseline (VG) — the single-owner website baseline

**Cirrus for sites where the visitor is the user.** Launch directories,
newsletters, portfolios and landing pages have one owner and many readers.
They need a public site, a handful of write paths (subscribe, react, submit
a form, count a view), email delivery, and an owner who operates from git
and a CLI — not a multi-tenant console.

## Status

| Field | Value |
|-------|-------|
| Status | **In progress** — **All milestones shipped** (VG0–VG7); the baseline is complete and verified locally, and has not yet been bootstrapped |
| Cluster | **VG** |
| Owner(s) | `apps/*`, `packages/*`, `infra/*`, `tests/*`, `flows/*`, the spec pack |
| Target branch | `main` |
| Builds on | Cirrus at `8f41d16`: the D1 seam, the migration runner, deploy-time wiring, the composition stack, the phased bootstrap |
| Decisions locked | D1–D6 in `ai/context/decisions.md` |
| End-state target | Three deployables live on stage + prod from one bootstrap; the sample content renders as a directory, a newsletter and a portfolio; the owner runs `virga stats` and sees real numbers |

## Thesis

Virga keeps everything Cirrus proved and removes only what many tenants
required. What is kept: Workers, D1, KV, Email Service; Orun CI with
brokered credentials; `@@wiring@@` deploy-time binding resolution; the
phased bootstrap; the blueprint card. What is dropped: identity, membership,
projects, policy, events/audit, config, metering, billing, webhooks,
integrations, admin, the console, the SDK. What is new: four small bounded
contexts a website actually has, a mail worker that can broadcast, a content-
driven site, and a CLI that is the owner's console.

The thing that makes this a *baseline* rather than a template: the same
operational rails as Cirrus, so a Virga product converges on merge, migrates
on merge, and can be born by the same phase workflows.

## Read order

1. This README — thesis and scope.
2. [`design.md`](./design.md) — the domain model and the API in one place.
3. [`implementation-plan.md`](./implementation-plan.md) — VG0–VG7.
4. [`risks-and-open-questions.md`](./risks-and-open-questions.md).
5. [`IMPLEMENTATION-STATUS.md`](./IMPLEMENTATION-STATUS.md) — as built.

## Milestones at a glance

| # | Milestone | Status |
|---|---|---|
| VG0 | Genesis: workspace skeleton, identity, verify CI, spec pack | ✅ Shipped |
| VG1 | Data plane: migrations + repositories on real SQLite | ✅ Shipped |
| VG2 | site-api: the public Worker | ✅ Shipped |
| VG3 | mail-worker: transactional mail + broadcasts | ✅ Shipped |
| VG4 | web-site: content collections + the three site shapes | ✅ Shipped |
| VG5 | CLI: `virga` owner operations | ✅ Shipped |
| VG6 | Infra + CI: Terraform roots, db-migrate, wiring, intent, ci.yml | ✅ Shipped |
| VG7 | Baseline machinery: blueprint card, repo blueprint, flows, BOOTSTRAP, docs close-out | ✅ Shipped |
