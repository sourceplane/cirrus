# Migration decisions — platforms

Source: `vercel/platforms` (upstream inventory: [inventory.md](inventory.md),
archetype A2:kv-backed, difficulty 2/5).

| # | Gate | Decision | Why |
|---|---|---|---|
| D1 | G0 | `next` 16.3.8 with `@opennextjs/cloudflare` 1.20.9 | Upstream ^16.2.10 is below the adapter's peer range (>=16.3.8). 16.4.0 is in range but 500s at runtime (`preview-props.json` manifest), so the tested pair is pinned. |
| D2 | G0 | `proxy.ts` → `middleware.ts` (edge) | The Node-runtime proxy is experimental in the adapter and failed the bundle. |
| D3 | G3 | `web` is `cloudflare-worker-turbo` | It binds KV and Durable Objects. The assets type's schema rejects wiring parameters (`orun plan` error). |
| D4 | — | Tenants need a zone with a wildcard route `*.<domain>/*` | workers.dev cannot serve wildcard subdomains. Upstream's `tenant---branch.vercel.app` preview hosts have no equivalent and were removed. Until the zone exists, stage and prod serve only the root and `/admin`. |
| D5 | G4 | `kvIncrementalCache` + `doShardedTagCache` + `doQueue` | `deleteSubdomainAction` calls `revalidatePath('/admin')`. KV + DO keep this archetype free of D1/R2. |
| D6 | — | `/admin` is `force-dynamic` | Upstream prerendered it at build by reading Redis; bindings are request-time on Workers. |
| D7 | — | Upstash Redis → Workers KV (`TENANTS`) | Single-key reads and writes plus a prefix listing; nothing needs atomicity. KV's ~60s cross-region consistency is acceptable: creation redirects from the writing location. |
| D8 | — | `@vercel/analytics` + `speed-insights` removed | No Cloudflare equivalent is required. Web Analytics can be enabled per zone. |

## Exceptions (waived by the residue gate)

None.
