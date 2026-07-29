# cloudflare-native — the D1 dialect contract

This is the single source of truth for how Cirrus stores and queries data.
Every migration, every repository, and every review of either is measured
against it. It exists because a dialect port that leaves its rules implicit
turns into 5,900 lines of inconsistent SQL.

## 1. The interface does not change

`SqlExecutor` — `execute(text, params) → { rows, rowCount }` — is the contract
the eleven repositories are written against, and it survives the port intact.
That is what makes this epic bottom-up rather than big-bang: CN1 introduces a
D1-backed implementation, and the repositories keep compiling against the same
type while their SQL is ported context by context in CN3.

One member changes. `TransactionalSqlExecutor.transaction(fn)` — an interactive
callback that could interleave application logic between statements — has no
D1 equivalent, and pretending otherwise (running the callback outside a real
transaction) would silently drop atomicity. It is replaced by:

```ts
interface AtomicSqlExecutor extends SqlExecutor {
  atomic<T>(build: (q: StatementQueue) => T): Promise<AtomicResult<T>>;
}
```

The callback **declares** statements instead of awaiting them; the queue is
handed to `D1Database.batch()`, which is a real SQL transaction — statements
commit sequentially and non-concurrently, and a failure anywhere aborts and
rolls back the whole sequence. Call sites that genuinely need a read to decide
a later write use one of the three patterns in §6.

## 2. Naming: contexts become prefixes

SQLite has one namespace. `CREATE SCHEMA identity` and `identity.users` become
`identity_users`.

- Table name = `<context>_<table>`, contexts exactly as listed in
  `BOUNDED_CONTEXTS`.
- Index name keeps its existing shape: `<context>_<table>_<cols>_idx`.
- No table may be created without a context prefix. A migration lint enforces
  it (CN2), so the bounded-context boundary stays legible even without schemas.
- `COMMENT ON` has no SQLite equivalent. The prose moves to `--` comments
  directly above the object; it is documentation either way, and keeping it
  next to the DDL keeps it truthful.

## 3. Types

| Domain | Postgres | SQLite/D1 | Rule |
|---|---|---|---|
| Identifier | `UUID` | `TEXT` | Lower-case canonical UUID string. `asUuid()` still brands and validates at the edge. |
| Timestamp | `TIMESTAMPTZ` | `TEXT` | **ISO-8601 UTC with milliseconds**: `2026-07-29T10:00:00.000Z`. Sorts lexicographically, compares as text, and `new Date(row.created_at)` keeps working unchanged. |
| Default now | `DEFAULT now()` | `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` | Parenthesised — SQLite requires an expression default in parens. |
| Structured | `JSONB` | `TEXT` | Valid JSON text. Read through `parseJson()`; write through `JSON.stringify`. `json_extract()` is available for predicates. |
| Boolean | `BOOLEAN` | `INTEGER` | `0`/`1` with `CHECK (col IN (0,1))`. Read through `toBool()`. |
| Money | `NUMERIC` | `INTEGER` | Minor units (cents). Never `REAL` — binary floating point and money do not mix. |
| Counter | `BIGINT` | `INTEGER` | SQLite integers are 64-bit. |
| Free text | `TEXT` | `TEXT` | Unchanged. |

**Why ISO text and not epoch integers.** Epoch millis are smaller and compare
faster, but every row mapper, every fixture, every migration `DEFAULT`, and
every hand-written debugging query would have to change, and `SELECT * FROM
identity_sessions` in `wrangler d1 execute` would become unreadable. ISO-8601
UTC text sorts correctly, is directly comparable with `<`/`>`, round-trips
through `Date`, and keeps the 552 existing test fixtures meaningful. The cost
is ~24 bytes per timestamp. That is the right trade for a baseline whose value
is legibility.

## 4. Statement rules

- **Placeholders are `?N`**, one-based, matching the existing `$N` ordinals
  exactly. D1 supports ordered (`?NNN`) and anonymous (`?`) parameters only —
  named parameters are not supported. Numbered is kept because it survives
  re-ordering and reads the same as the Postgres original in review.
- **`RETURNING` is supported** and stays. It is how repositories get the
  written row back in one round trip.
- **Upsert**: `ON CONFLICT (cols) DO UPDATE SET x = excluded.x`. Lower-case
  `excluded`, and a conflict target is **required** for `DO UPDATE` (bare
  `ON CONFLICT DO NOTHING` is fine).
- **`now()` → `strftime('%Y-%m-%dT%H:%M:%fZ','now')`.** Prefer passing the
  timestamp as a bound parameter from the caller: it makes the value testable
  and identical across every row of a batch. SQL-side `now` is for defaults.
- **Interval arithmetic** → `datetime(?1, '-7 days')` or, when comparing
  against ISO text, compute the bound in TypeScript and bind it. Prefer the
  latter; it keeps the query planner on a plain index range scan.
- **`date_trunc('day', ts)`** → `substr(ts, 1, 10)` for day buckets on ISO
  text, `strftime('%Y-%m', ts)` for months. Cheaper than parsing.
- **`row_to_json(t.*)`** → `json_object('col', t.col, …)`, explicit columns.
- **Casts**: drop `::text`, keep semantics with `CAST(x AS INTEGER)` where a
  numeric comparison actually depends on it.
- **`FOR UPDATE`** does not exist and is not needed: a `batch()` is already
  serialized.

## 5. Row mapping

D1 returns SQLite storage classes, so three coercions are mandatory in every
mapper. They live in `@saas/db/sql` and are the only sanctioned way to read
these column kinds:

```ts
parseJson<T>(value: unknown, fallback: T): T   // TEXT → object
toBool(value: unknown): boolean                // 0|1|"0"|"1" → boolean
toNumber(value: unknown): number               // TEXT|INTEGER|REAL → number
```

`new Date(row.created_at as string)` needs no helper — ISO text is exactly what
`Date` wants. That is the point of §3.

## 6. Atomicity patterns

Three shapes cover every current `executor.transaction` call site:

1. **Declared batch** — the common case. All statements are known up front
   (insert org + insert member + insert role assignment). Queue them; `batch()`
   commits or rolls back as a unit.
2. **Single-statement CTE** — when a later statement depends on an earlier
   one's output. SQLite supports `WITH … INSERT … RETURNING`, and the existing
   `create_organization` CTE already has this shape.
3. **Guarded write** — when a decision genuinely needs a prior read (accept an
   invitation only if it is still pending). Express the guard as a predicate on
   the write itself — `UPDATE … WHERE status = 'pending' RETURNING *` — and
   treat `rowCount === 0` as the conflict. This is *more* correct than the
   read-then-write it replaces: it cannot race.

Pattern 3 is the interesting one. Several current call sites read inside a
transaction and then write, relying on Postgres isolation for correctness. In
D1 the guard has to be in the statement, which removes a class of TOCTOU bug
rather than introducing one.

## 7. Error mapping

Repositories classify failures (`conflict`, `not_found`, `internal`) by
inspecting driver errors. Postgres exposes `code === "23505"`; D1 raises
`D1_ERROR: UNIQUE constraint failed: identity_users.email_lower`. The
classifier moves to `@saas/db/sql`:

```ts
isUniqueViolation(err): boolean        // matches both, so the port is reversible
isForeignKeyViolation(err): boolean
constraintTarget(err): string | null   // "identity_users.email_lower"
```

Foreign keys **are** enforced by D1, so ordering inside a batch matters:
parents before children. `PRAGMA defer_foreign_keys` is not used — a batch that
needs it usually wants pattern 2 instead.

## 8. Migrations

The manifest-driven runner survives; only the adapter changes.

- Migration SQL stays a plain `.sql` file per directory, still registered in
  `packages/db/src/manifest.ts` with an id, context, path, and **sha256**. A
  file that is not in the manifest does not run — that has caught real bugs and
  is worth keeping.
- The control table becomes `control_schema_migrations`.
- Statements are split on `;` at statement boundaries and submitted through the
  D1 REST API (`POST /accounts/{account}/d1/database/{database}/query`), which
  is the supported administrative path from CI. The runner keeps `plan` (report
  pending, mutate nothing) and `apply` semantics unchanged.
- `IF NOT EXISTS` stays on every `CREATE`, so a re-run is a no-op. SQLite has
  no transactional-DDL guarantee across a REST batch, which makes idempotence
  load-bearing rather than merely tidy.

## 9. What this design does not do

- **No ORM.** The repositories are hand-written SQL against a thin executor,
  which is why a dialect port is even possible to review. Introducing Drizzle
  or Kysely here would be a second epic wearing this one's clothes.
- **No compatibility shim.** There is no runtime translator rewriting Postgres
  SQL into SQLite. The SQL in the file is the SQL that runs — anything else
  makes every future query a guess about what the shim will do.
- **No data migration.** Cirrus is a new baseline, not a cutover of a live
  Lumen deployment. Moving existing Supabase data into D1 is a product-specific
  exercise and is out of scope; the schema equivalence documented here is what
  makes it possible later.
