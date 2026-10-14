# Vercel → Orun inventory: platforms

- **Archetype:** `A2:kv-backed`  **Difficulty:** 2/5 (raw 6.5)
- **Package manager:** pnpm; monorepo: false (turbo: false, packages: 1); code files: 22
- **Next app:** `.` (platforms) next@^16.2.10, router: app
- ⚠️ .: next@^16.2.10 is outside @opennextjs/cloudflare@1.20.9's peer range (>=15.5.27 <16 || >=16.3.8) — Gate G0: bump first, as its own commit
- ⚠️ .: next@^16.2.10 with proxy.ts — proxy runs on the Node runtime, which @opennextjs/cloudflare treats as experimental; rename to middleware.ts (edge) per feature-map VC-NODE-PROXY
- ⚠️ .: next@^16.2.10 — pin the Next release the adapter is TESTED with, not just its peer range (proof: adapter 1.20.9 + next 16.3.8 runs; next 16.4.0 builds but 500s at runtime on a missing preview-props.json manifest)

## Findings (rule → references/feature-map.md)

| Rule | What | Weight | Evidence |
|---|---|---|---|
| VC-UPSTASH | Upstash Redis / ratelimit / QStash | 2 | `package.json: @upstash/redis@^1.34.9` |
| VC-ISR | ISR / revalidate / unstable_cache / revalidateTag | 2 | `app/actions.ts` |
| VC-NODE-PROXY | Node-runtime middleware (proxy.ts or runtime: 'nodejs') | 1.5 | `proxy.ts` |
| VC-ANALYTICS | @vercel/analytics / speed-insights | 0.5 | `package.json: @vercel/analytics@^1.5.0`<br>`package.json: @vercel/speed-insights@^1.2.0` |
| VC-MIDDLEWARE | middleware.ts / proxy.ts (Next 16) | 0.5 | `proxy.ts` |

## Database

- Prisma providers: —
- Schema files: —
- D1 blockers: none detected
