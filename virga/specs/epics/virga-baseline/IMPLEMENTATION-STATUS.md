# Implementation status — as built

| Milestone | Status | Landed | Notes |
|---|---|---|---|
| VG0 Genesis | ✅ Shipped | 2026-09-09 | Workspace skeleton; control migration; `tests/db` on `node:sqlite`; `verify.yml`; spec pack. |
| VG1 Data plane | ✅ Shipped | 2026-09-09 | Migrations 010–040; `audience`, `forms`, `engagement`, `newsletter` repositories; keyset cursors; 67 tests on `node:sqlite`. |
| VG2 site-api | ✅ Shipped | 2026-09-09 | Public Worker: subscribe/confirm/unsubscribe, forms, reactions, views, rankings, owner routes; KV rate limits (fail-open), CORS, Turnstile, derived unsubscribe tokens; 19 tests through the router on `node:sqlite`; renders + dry-run deploys from the fixture. |
| VG3 mail-worker | ✅ Shipped | 2026-09-09 | Templates (escaped), local-debug + cloudflare-email providers, `/v1/mail/send`, resumable `/v1/mail/broadcast` with per-recipient HMAC unsubscribe links; crypto/tokens moved to `@site/shared`; 10 tests. |
| VG4 web-site | ✅ Shipped | 2026-09-09 | Next.js 15 + opennextjs/cloudflare; `content/{posts,projects,launches,pages}` with a validating loader; `site.config.ts`; static routes + RSS/sitemap/robots; islands (subscribe, contact, upvote, view beacon, ranked launches); sample content for all three shapes; 9 tests. |
| VG5 CLI | — | | |
| VG6 Infra + CI | — | | |
| VG7 Baseline machinery | — | | |

## Verification record

- VG4: `next build` prerenders every content route (SSG), `opennextjs-cloudflare build` emits the Worker + 968 KiB of assets, `wrangler deploy --dry-run` accepts it; `/` carries the `Virga` smoke marker; `tests/web-site` 2 suites / 9 tests.
- VG3: `tests/mail-worker` 3 suites / 10 tests; dry-run deploy from the fixture (52 KiB bundle).
- VG2: `tests/site-api` 5 suites / 19 tests; `wrangler deploy --dry-run` from the fixture-rendered config (95 KiB bundle).
- VG1: `tests/db` 9 suites / 67 tests green on `node:sqlite`; manifest checksums verified.
- VG0: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green locally on Node 22.22 / pnpm 10.12.1.
