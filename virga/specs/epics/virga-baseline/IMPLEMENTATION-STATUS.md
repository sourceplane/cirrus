# Implementation status — as built

| Milestone | Status | Landed | Notes |
|---|---|---|---|
| VG0 Genesis | ✅ Shipped | 2026-09-09 | Workspace skeleton; control migration; `tests/db` on `node:sqlite`; `verify.yml`; spec pack. |
| VG1 Data plane | — | | |
| VG2 site-api | — | | |
| VG3 mail-worker | — | | |
| VG4 web-site | — | | |
| VG5 CLI | — | | |
| VG6 Infra + CI | — | | |
| VG7 Baseline machinery | — | | |

## Verification record

- VG0: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green locally on Node 22.22 / pnpm 10.12.1.
