# Postgres / MySQL → D1 (SQLite)

Cirrus made this move once, from Lumen's Supabase Postgres to D1, and these
rules are its conventions (`ai/context/fork-from-baseline.md`,
`packages/db/src/d1`). Apply them in the order below.

## 1. Type map

| Source | D1 column | Drizzle `sqlite-core` | Prisma (`sqlite`) |
|---|---|---|---|
| `serial` / `bigserial` / `autoincrement()` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `integer().primaryKey({ autoIncrement: true })` | `Int @id @default(autoincrement())` |
| `uuid` + `gen_random_uuid()` / `defaultRandom()` | `TEXT` | `text().primaryKey().$defaultFn(() => crypto.randomUUID())` | `String @id @default(uuid())` (app-generated) |
| `timestamp` / `timestamptz` / `defaultNow()` | `TEXT` ISO-8601 (Cirrus convention) | `text().notNull().$defaultFn(() => new Date().toISOString())`, or `integer({ mode: "timestamp_ms" })` | `DateTime` |
| `boolean` | `INTEGER` 0/1 | `integer({ mode: "boolean" })` | `Boolean` |
| `json` / `jsonb` | `TEXT` | `text({ mode: "json" }).$type<T>()` | `Json` (TEXT in SQLite) |
| `pgEnum` / `CREATE TYPE … AS ENUM` | `TEXT` + `CHECK (col IN (...))` | `text({ enum: [...] as const })` | `enum` if the pinned Prisma supports SQLite enums, else `String` + app validation |
| `text[]` / `.array()` | `TEXT` JSON array, or a join table when queried | `text({ mode: "json" }).$type<string[]>()` | `Json`, or a relation |
| `numeric` / `decimal` / money | `INTEGER` minor units (cents) | `integer()` | `Int` (cents) |
| `varchar(n)` | `TEXT` (+ `CHECK(length(col) <= n)` if relied upon) | `text()` | `String` |
| `citext` | `TEXT COLLATE NOCASE` | `text()` + `sql` collate | `String` |
| schema `auth.users`, `billing.x` | table prefix `auth_users`, `billing_x` | — | `@@map("billing_x")` |
| `now()` in SQL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | — | — |

## 2. Constructs with no D1 equivalent: rewrite or except (Gate G1/G2)

| Postgres construct | Rewrite |
|---|---|
| Interactive transaction (`$transaction(async tx => …)`, `db.transaction(async …)`) | `db.batch([...])` (atomic, statements fixed up front); one statement with `RETURNING`; `INSERT … ON CONFLICT DO UPDATE`. If a read must decide a later write inside one atomic unit, route it through a Durable Object, or take the G1 exception. |
| RLS policies (`auth.uid() = user_id`) | Repository functions take the principal and always add the predicate. Add a unit test per repository asserting cross-tenant reads return nothing. |
| Triggers / plpgsql functions | Application code in the same request. Cross-entity invariants → `batch`. |
| `LISTEN/NOTIFY`, logical replication / `supabase_realtime` | Durable Object + WebSocket, or drop. |
| Full-text (`tsvector`), MySQL `FULLTEXT` | FTS5 virtual table plus sync statements in the same `batch`. |
| Extensions (`pgvector`, `postgis`, `pg_trgm`) | Vectorize (vectors); otherwise G1 exception. |
| Sequences shared across tables | App-generated IDs (Cirrus `packages/shared/src/ids.ts` style). |

## 3. Migrations — the `db-migrate` component shape

Cirrus layout (reuse it verbatim for discipline):

```text
packages/db/src/migrations/000_control/up.sql
packages/db/src/migrations/010_<context>_core/up.sql
packages/db/src/manifest.ts      # id, context, path, sha256 checksum, description
packages/db/src/runner/          # plan | apply against D1's REST API (copy from Cirrus)
infra/db-migrate/component.yaml  # type: db-migrate, path: packages/db/src/migrations
```

Generating the first migration from the source ORM:
- **Drizzle:** rewrite the schema to `sqlite-core`, then run
  `drizzle-kit generate --dialect sqlite` and move the SQL into
  `010_<name>/up.sql`. Never port the old Postgres migration history; the
  baseline starts fresh.
- **Prisma:** run `prisma migrate diff --from-empty
  --to-schema-datamodel prisma/schema.prisma --script > up.sql` with provider
  `sqlite`.
- Compute `checksum` = `sha256(up.sql)` into `manifest.ts`. The runner refuses
  checksum drift.

For a single small app where the Cirrus runner is overkill, the
`cloudflare-worker-turbo` composition has a `migrationCommand` hook
(`pnpm exec wrangler d1 migrations apply <db> --remote --env <env>`).
Recording that choice in `decisions.md` is required, because it ties schema
changes to app deploys.

## 4. Query rewrites

- `$1, $2` placeholders work through the Cirrus D1 executor. Raw D1 uses `?`.
- `ILIKE` → `LIKE` (ASCII is case-insensitive by default) or `lower(x) LIKE lower(?)`.
- `RETURNING *` is supported. `DISTINCT ON` → a window function or `GROUP BY`.
- `jsonb` operators (`->>`, `@>`) → `json_extract(col, '$.key')`.
- `NOW() - INTERVAL '7 days'` → `strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`.
- Array ops (`= ANY($1)`) → `IN (SELECT value FROM json_each(?))`.
- Each D1 query is bounded (statement size, bound params, and rows read per
  query are limited); paginate large exports.

## 5. Data move (cutover)

`pg_dump --data-only --column-inserts` → transform (UUID text, `t/f` → 1/0,
timestamps → ISO, JSON stays text, arrays → JSON) → chunked
`wrangler d1 execute <db> --remote --file chunk-N.sql`. Verify row counts per
table and a checksum of the primary keys before switching traffic.
