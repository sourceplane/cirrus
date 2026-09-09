# Implementation status — as built

| Milestone | Status | Landed | Notes |
|---|---|---|---|
| VG0 Genesis | ✅ Shipped | 2026-09-09 | Workspace skeleton; control migration; `tests/db` on `node:sqlite`; `verify.yml`; spec pack. |
| VG1 Data plane | ✅ Shipped | 2026-09-09 | Migrations 010–040; `audience`, `forms`, `engagement`, `newsletter` repositories; keyset cursors; 67 tests on `node:sqlite`. |
| VG2 site-api | — | | |
| VG3 mail-worker | — | | |
| VG4 web-site | — | | |
| VG5 CLI | — | | |
| VG6 Infra + CI | — | | |
| VG7 Baseline machinery | — | | |

## Verification record

- VG1: `tests/db` 9 suites / 67 tests green on `node:sqlite`; manifest checksums verified.
- VG0: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green locally on Node 22.22 / pnpm 10.12.1.
