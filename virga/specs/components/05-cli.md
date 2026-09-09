# 05 — cli

Status: Planned (VG5) · Owner: `packages/cli`

The owner's console is a terminal. `virga` speaks the owner contract and
nothing else.

| Command | Route |
|---|---|
| `virga health` | `GET /health` |
| `virga stats` | `GET /v1/owner/stats` |
| `virga subscribers list [--status] [--limit] [--json]` | `GET /v1/owner/subscribers` |
| `virga subscribers export > list.csv` | `GET /v1/owner/subscribers/export` |
| `virga submissions list [--form] [--status] [--json]` | `GET /v1/owner/submissions` |
| `virga submissions mark <id> <status>` | `PATCH /v1/owner/submissions/:id` |
| `virga issues list` | `GET /v1/owner/issues` |
| `virga issues create --slug --subject --html <file> [--text <file>]` | `POST /v1/owner/issues` |
| `virga issues send <id> [--yes]` | `POST /v1/owner/issues/:id/send` |

Config: `VIRGA_API_URL`, `VIRGA_OWNER_TOKEN` (or `--api-url`, `--token`).
Exit codes: 0 ok · 1 API error · 2 usage · 3 unauthenticated · 4 network.
Zero runtime dependencies; bundled with esbuild to `dist/cli.js`.
