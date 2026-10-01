# Virga — Spec Pack

Status: Normative index

This directory is the authoritative spec pack for the single-owner website
baseline. It is organised into three tiers so durable contracts and
lifecycle-tracked work never get confused with each other.

> **Ground rule (from `core/constitution.md`):** trust code reality over stale
> docs. When a spec and the running system disagree, the system is the source
> of truth and the spec is the bug — fix it (or file a proposal under
> `ai/proposals/`).

## The three tiers

| Tier | Directory | What it holds | Lifecycle |
|------|-----------|---------------|-----------|
| **Core** | [`core/`](./core/) | Constitution, product overview, domain model, monorepo shape. | Normative; never archived for being "implemented". |
| **Components** | [`components/`](./components/) | One reference spec per deployable or package: the durable contract each must honour. | Stays valid after implementation; `Status:` reflects code reality. |
| **Epics** | [`epics/`](./epics/) | Orun-style work programmes. Each carries a README status table, an `implementation-plan.md` of milestones, and an `IMPLEMENTATION-STATUS.md` as-built record. | Draft → Ready → In progress → Shipped → Closed. |

Plus [`roadmap.md`](./roadmap.md), the cross-epic register.

## Status legend

| Marker | Meaning |
|---|---|
| Draft | Written, not started |
| In progress | Work landing |
| ✅ Shipped | Milestone merged and verified |
| ⛔ Blocked | Waiting on a human-supplied input (see `ai/deferred.md`) |
| Closed | Programme finished, no follow-ups |

## Read order

1. `core/constitution.md` — the rules everything obeys.
2. `core/product-overview.md` + `core/domain-model.md` — what we're building.
3. `core/repo.md` — how the monorepo and CI work.
4. `components/` — the contract for the area you're touching.
5. `epics/virga-baseline/` — the active programme (start at its README).
