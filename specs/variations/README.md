# User-scoped variations of Cirrus

Status: Normative register · Opened 2026-09-09 · Owner: platform

Cirrus is a multi-tenant baseline: user → organization → project → environment.
A large share of what solo builders actually ship in 2026 never needs that
hierarchy. The user *is* the tenant, there is no console for "other members",
and the product is one focused surface. This register names five such
variations, each born from Cirrus with the **Solo profile**
([`../profiles/solo-m0.md`](../profiles/solo-m0.md)) switched on and one new
bounded context added for the product domain. Each lives in its own repo and
tracks its own work as GitHub epics.

## Evidence — what people are building (Sept 2026)

Reddit's own pages block crawlers, so the Reddit signal below is read through
the secondary sources that aggregate r/SaaS, r/microsaas, r/indiehackers and
r/SideProject, plus Product Hunt and Indie Hackers directly.

| Signal | Source |
|---|---|
| Six categories cover ~80% of successful micro-SaaS: AI tool wrappers, vertical CRMs, internal tools, content-driven utilities, **niche directories**, **productivity apps**. | [Superframeworks](https://superframeworks.com/articles/best-micro-saas-ideas-solopreneurs) (aggregating r/SaaS, r/microsaas, IH) |
| "Surgical instruments, not Swiss Army knives" — single-purpose tools beat bloated platforms; users prefer one-time unlocks / lifetime deals for low-frequency tools. | [Superframeworks](https://superframeworks.com/articles/best-micro-saas-ideas-solopreneurs), [mean.ceo Micro-SaaS Trends Sept 2026](https://blog.mean.ceo/micro-saas-trends-september-2026/), [Noonlaunch PH review](https://noonlaunch.com/blog/product-hunt-review) |
| 500+ launches/day on Product Hunt; indie makers move to smaller launch directories (Uneed, MicroLaunch, Fazier, StartupBase…) and keep "evergreen directory listings" working. | [Pinggy](https://pinggy.io/blog/best_producthunt_alternatives/), [LaunchList](https://getlaunchlist.com/blog/product-hunt-alternatives), [StartupBase](https://startupbase.io/blog/product-hunt-alternatives) |
| Link-in-bio page builders ($10–25/mo), affiliate link managers, creator storefronts (Stan.store-style), paid digital products and tips are the creator stack. | [ideaproof 50 micro-SaaS ideas](https://ideaproof.io/lists/micro-saas-ideas), [Uscreen creator trends](https://www.uscreen.tv/blog/creator-economy-trends/), [Influencer Marketing Factory](https://theinfluencermarketingfactory.com/best-creator-platforms-2026/) |
| Productivity / health / finance consumer utilities are the categories that "gain visibility" for solo launches on Product Hunt; 7 of the top-10 PH products of 2025 were individual-user tools. | [Noonlaunch](https://noonlaunch.com/blog/product-hunt-review), [Product Hunt yearly leaderboard 2025](https://www.producthunt.com/leaderboard/yearly/2025) |
| Subscription fatigue; utilities with one-time pricing; "creator accounting and tax utilities"; Etsy fee calculators. | [mean.ceo Sept 2026](https://blog.mean.ceo/micro-saas-trends-september-2026/) |
| "Narrow tools people already pay for": developer uptime monitors, tiny status-page tools with postmortems. | [TrendGap 27 SaaS ideas 2026](https://trendgap.io/blog/best-saas-ideas-for-indie-hackers-in-2026), [Superframeworks](https://superframeworks.com/articles/best-micro-saas-ideas-solopreneurs) |
| Utility tools that solve one recurring pain (file conversion, tracking, export) are the most consistently profitable IH niche; solo founders are 36% of new startups. | [Indie Hackers — what indie hackers need in 2026](https://www.indiehackers.com/post/from-side-project-to-profitable-product-what-indie-hackers-need-in-2026-8ByGRZ3D5SzR1zjwB8w4), [IH solo founders](https://www.indiehackers.com/post/how-solo-founders-are-building-profitable-businesses-from-scratch-algo4ZMMnrzcgYU4gkZN) |
| Default indie stack is "auth + DB + payments + email + analytics for < $20/mo" — exactly the baseline Cirrus already carries (identity, D1, Polar billing, notifications). | [Superframeworks](https://superframeworks.com/articles/best-micro-saas-ideas-solopreneurs), [TLDL stack 2026](https://www.tldl.io/resources/indie-hacker-saas-stack-2026) |

## The five variations

Each row is one repo under `sourceplane/`, born from Cirrus (Solo profile on,
product-only content) plus **one new bounded context** — a Cloudflare Worker,
its D1 migration, contracts, an api-edge facade at `/v1/me/...` (user-scoped,
no organization in the path) and public read routes where the product has a
public surface, an SDK client, and console pages.

| # | Repo | Product | Category (evidence) | New bounded context | Public surface |
|---|------|---------|---------------------|---------------------|----------------|
| 1 | [`launchpad`](https://github.com/sourceplane/launchpad) | Product Hunt-style launch directory: makers submit products, everyone upvotes and comments, daily/weekly leaderboards, maker profiles. | Niche directories / launch platforms | `launches-worker` — products, upvotes, comments, maker profiles | `/v1/launches` (feed), `/v1/launches/:slug`, `/v1/makers/:handle` |
| 2 | [`linkfolio`](https://github.com/sourceplane/linkfolio) | Creator link-in-bio page + storefront: one public page per user with links, embeds, digital products and tips; click analytics. | Creator stack / content-driven utilities | `pages-worker` — page, blocks (links/products/tips), click events | `/v1/p/:handle` (public page) |
| 3 | [`streakly`](https://github.com/sourceplane/streakly) | Habit & streak tracker: habits with schedules, daily check-ins, streak math, weekly review, email reminders. | Productivity / health consumer utilities | `habits-worker` — habits, check-ins, streak rollups | none (private by default; optional share card) |
| 4 | [`subtally`](https://github.com/sourceplane/subtally) | Subscription & recurring-expense tracker: subscriptions with cadence, next-renewal computation, monthly/yearly totals, renewal reminders. | Personal finance utilities / subscription fatigue | `subscriptions-worker` — subscriptions, renewal schedule, summaries | none |
| 5 | [`pulsewatch`](https://github.com/sourceplane/pulsewatch) | Uptime monitor + public status page for indie devs: HTTP monitors on a cron, incident timeline, per-user public status page. | Developer utilities ("tools people already pay for") | `monitors-worker` — monitors, checks, incidents, status page | `/v1/status/:handle` (public status page) |

### What "user-scoped" means in code

- **No organization in the URL.** Everything private hangs off `/v1/me/...`
  and is keyed by the authenticated actor's user id. The personal organization
  that Solo auto-provisions still exists underneath (billing, audit and RBAC
  keep running on it) but no product route names it.
- **Public routes are unauthenticated GETs** keyed by a user-chosen handle or a
  product slug, served by the same worker behind the edge.
- **Per-user billing** (Polar checkout/portal from the baseline) is the paywall
  for the product's pro features; there is no per-seat or per-org plan.
- **No member/invite/project/API-key surfaces** — the Solo profile 404s them at
  the edge and the console never renders them.

### What every variation keeps from Cirrus

Identity (magic link + OAuth), the Solo personal workspace, notifications
(email), billing (Polar), config (settings/flags), events/audit, the Next.js
console shell, the SDK/CLI, the D1 data plane, Orun CI and the deploy-time
wiring. The full worker fleet is kept, not deleted ("suppress, don't remove"),
so a variation can grow back into multi-tenant by flipping `SOLO_MODE`.

## Epics per variation

Every repo opens with the same epic ladder as GitHub issues (one parent epic
per row, milestones as sub-issues):

| Epic | Scope |
|---|---|
| E1 Foundation | Repo born from Cirrus; rebrand; Solo profile on; credential-free `checks` CI green (typecheck + tests). |
| E2 Domain worker + data | New worker, D1 migration + manifest entry, repository, contracts, unit tests. |
| E3 Edge + SDK | `/v1/me/...` and public routes at api-edge (Solo-safe), SDK resource client, facade tests. |
| E4 Console | Product pages in the console under Solo; nav; empty states. |
| E5 Monetisation & notifications | Pro entitlement gate via per-user billing; product emails (digest/reminder/alert) through notifications-worker. |
| E6 Launch readiness | Public surface polish, docs, deploy notes, live verification. |

The build order across variations is 1 → 5; E1–E4 are the MVP slice built
first in every repo, E5–E6 follow.

## Status

All five variations are built through **E4** (the MVP slice: domain worker and
data, edge and SDK, console), each verified with `build`, `typecheck` and the
full test suite in its own working copy. Each lives here as an overlay under
`variations/<name>/`, which
[`tooling/variations/materialize.sh`](../../tooling/variations/materialize.sh)
turns into a standalone, rebranded repo:

```bash
tooling/variations/materialize.sh <name> ~/sourceplane/<name> --verify
```

| # | Variation | Bounded context | Worker routes | Public surface | Product tests |
|---|---|---|---|---|---|
| 1 | `launchpad` | `launches` | `/v1/me/products*`, `/v1/me/profile`, `/v1/launches*`, `/v1/makers/*` | feed, product page, maker page | router + SQLite + facade + console model |
| 2 | `linkfolio` | `pages` | `/v1/me/page*`, `/v1/p/:handle`, click | the creator page | as above, plus click analytics |
| 3 | `streakly` | `habits` | `/v1/me/habits*`, `/v1/me/today`, `/v1/me/review` | none (private) | as above, plus the streak rules |
| 4 | `subtally` | `subscriptions` | `/v1/me/subscriptions*` (+ summary, upcoming) | none (private) | as above, plus renewal arithmetic |
| 5 | `pulsewatch` | `monitors` | `/v1/me/monitors*`, `/v1/me/incidents`, `/v1/me/status-page`, `/v1/status/:handle` | the status page | as above, plus incidents and the scheduler |

E5 (per-user pro entitlement and product emails) and E6 (launch readiness) are
planned in every variation's own `specs/epics/<name>/`.

### Repos

The five product repos do not exist yet: creating a repository is refused for
this session's GitHub app installation (403 on `POST /orgs/sourceplane/repos`).
Until they are created by hand, each variation's epic is tracked as an issue on
this repository — [#25](https://github.com/sourceplane/cirrus/issues/25),
[#26](https://github.com/sourceplane/cirrus/issues/26),
[#27](https://github.com/sourceplane/cirrus/issues/27),
[#28](https://github.com/sourceplane/cirrus/issues/28),
[#29](https://github.com/sourceplane/cirrus/issues/29) — and the overlay is
ready to materialize and push the moment a repo exists.
