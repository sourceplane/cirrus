# cloudflare-native — risks and open questions

## Risks

### R1 — Interactive transactions have no replacement (high impact, known)

~15 call sites use `executor.transaction(async tx => …)` with reads and writes
interleaved. D1's `batch()` is atomic but pre-declared. Three of these sites
(billing reconcile, invitation accept, integrations drain) read a row, branch
in TypeScript, and then write.

*Mitigation.* design.md §6 pattern 3: push the branch condition into the
write's `WHERE` clause and treat `rowCount === 0` as the conflict. Each
converted site gets a test that asserts the guard, because the failure mode is
silent (a write that should have been rejected succeeds) rather than loud.

*Residual.* A site that needs to read from table A to decide a write to table B
cannot be expressed this way. If one turns up in CN4, the answer is a Durable
Object per aggregate, not a weaker guarantee — and that is a scope change worth
surfacing, not absorbing.

### R2 — Test suites assert SQL text (medium impact, certain)

The 552 assertions in `tests/db` include `expect(queries[0].text).toContain(…)`
against Postgres SQL. Every one that names a table or a placeholder breaks in
CN3 — by design; that is what makes them a ratchet. The risk is the temptation
to loosen the assertions instead of updating them.

*Mitigation.* Update assertion text, never delete an assertion. A CN3 PR that
reduces the assertion count needs a reason in the description.

### R3 — Write throughput is a single-writer ceiling (medium impact, inherent)

D1 is one SQLite database behind a Durable Object. Postgres on Supabase would
absorb concurrent writes across contexts that D1 serializes. High-frequency
paths — metering ingestion, event log, webhook delivery attempts — are exactly
the ones that will notice.

*Mitigation.* These three are already append-mostly and tolerant of batching.
CN6 documents Queues in front of metering ingest as the growth path. The
baseline ships correct before it ships fast, and "correct" here means the write
path is honest about being serialized.

*Open.* Whether to move `events_event_log` to Analytics Engine (append-only,
purpose-built, no size pressure on D1) rather than keeping it in the relational
store. Deferred to a follow-on epic; it is a data-model decision, not a port.

### R4 — REST-API migrations are rate-limited (low impact, easy to trip)

The D1 REST `query` endpoint is documented as best suited for administrative
use and is subject to the global Cloudflare API rate limit. Twenty migrations
split into hundreds of statements could hit it on a cold database.

*Mitigation.* The runner submits multi-statement bodies per migration rather
than per statement, and retries `429` with backoff. Statement counts per
migration stay bounded by keeping DDL in the migration and data seeding out.

### R5 — `random_password` has no analogue, which is good (positive, noted)

The Supabase root caused a real operational wart: `random_password` is
unadoptable, so the first `terraform apply` against an existing project rotated
the database password and forced a same-run re-wire of every consumer. D1 has
no password — the binding *is* the credential. CN5 deletes the whole class of
problem. Recorded here so the next person does not reintroduce a secret where
none is needed.

### R6 — Storage ceiling is a product decision, not an engineering one (medium)

A per-database storage ceiling ([limits](https://developers.cloudflare.com/d1/platform/limits/))
is fine for control-plane data and wrong for payload storage. The failure is
slow and late: a fork ships, grows, and discovers the ceiling in production.

*Mitigation.* CN6 states the sizing rule in `BOOTSTRAP.md` where a fork will
actually read it, with two escape hatches: R2 plus a pointer column for blobs,
and database-per-tenant for the tail. The schema is already tenant-scoped on
`org_id`, so the second hatch is a routing change rather than a rewrite.

## Open questions

### Q1 — Should `dev` get a real D1 database?

Lumen's `dev` environment is verify-only because a Supabase project per
developer was not worth the money. D1 databases are free to create and cost
storage only. A real `dev` database would make local `wrangler dev` exercise
the actual binding.

*Leaning yes*, in CN5, since the cost argument that produced verify-only does
not survive the move. Decide when the component lands.

### Q2 — One database, or one per bounded context?

Twelve contexts could be twelve D1 databases, each bound only into its own
worker — a genuine enforcement of the boundary that Postgres schemas only
suggested, and twelve separate storage ceilings.

*Leaning no.* The `create_organization` CTE and several joins cross contexts,
and cross-database queries do not exist in D1. Splitting would mean an
application-level join layer, which is a much larger change than this epic.
Revisit only if the ceiling becomes real.

### Q3 — Read replication?

D1 read replication would help the console's read-heavy paths. It changes
session semantics (read-your-writes needs a bookmark).

*Deferred.* Not a baseline concern until there is a product with traffic.

### Q4 — Does `api-edge` still need `nodejs_compat`?

The flag was there for `postgres.js`. Other uses may remain (crypto, buffers).

*Answer in CN4*: audit each worker's imports and drop the flag where nothing
else needs it. Removing it shrinks cold starts, so it is worth the check rather
than leaving it set out of caution.
