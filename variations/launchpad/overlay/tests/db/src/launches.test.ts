import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor, type D1Binding } from "@saas/db/d1";
import { createLaunchesRepository, feedWindowStart } from "@saas/db/launches";
import { D1ApiAdapter } from "@saas/db/runner";

// The launches repository against a REAL SQLite engine (D1 is SQLite), through
// the same migrations the runner applies — so the SQL text, the ON CONFLICT
// shapes and the FK order are all exercised, not just asserted as strings.

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");

function d1Over(db: DatabaseSync): D1Binding {
  return {
    prepare(query: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { bound = values; return statement; },
        all<T>() {
          const prepared = db.prepare(query);
          const rows = prepared.all(...(bound as never[])) as T[];
          return Promise.resolve({ results: rows, success: true });
        },
      };
      return statement;
    },
  } as unknown as D1Binding;
}

function migrated(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const dir of readdirSync(MIGRATIONS_ROOT).filter((d) => existsSync(join(MIGRATIONS_ROOT, d, "up.sql"))).sort()) {
    for (const st of D1ApiAdapter.splitStatements(readFileSync(join(MIGRATIONS_ROOT, dir, "up.sql"), "utf8"))) db.exec(st);
  }
  return db;
}

const U1 = "usr_11111111111111111111111111111111";
const U2 = "usr_22222222222222222222222222222222";
const P1 = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";

describe("feedWindowStart", () => {
  const now = new Date("2026-09-09T15:30:00.000Z");
  it("today = start of the UTC day", () => expect(feedWindowStart("today", now)).toBe("2026-09-09T00:00:00.000Z"));
  it("week = seven days inclusive", () => expect(feedWindowStart("week", now)).toBe("2026-09-03T00:00:00.000Z"));
  it("all = no window", () => expect(feedWindowStart("all", now)).toBeNull());
});

describe("launches repository (SQLite)", () => {
  it("round-trips makers, products, votes and comments", async () => {
    const db = migrated();
    const repo = createLaunchesRepository(createSqlExecutor(d1Over(db)));

    const maker = await repo.upsertMaker({ userId: U1, handle: "Jane", displayName: "Jane" });
    expect(maker.ok && maker.value.handle).toBe("jane");
    const dup = await repo.upsertMaker({ userId: U2, handle: "jane", displayName: "Impostor" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.kind).toBe("conflict");
    const byHandle = await repo.getMakerByHandle("JANE");
    expect(byHandle.ok && byHandle.value?.userId).toBe(U1);

    const created = await repo.createProduct({ id: P1, userId: U1, slug: "acme", name: "Acme", tagline: "Tag", url: "https://acme.dev", tags: ["ai", "dev"] });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.status).toBe("draft");
      expect(created.value.tags).toEqual(["ai", "dev"]);
    }
    const dupSlug = await repo.createProduct({ id: P2, userId: U2, slug: "acme", name: "Other", tagline: "Tag", url: "https://o.dev" });
    expect(dupSlug.ok).toBe(false);

    // Draft is invisible publicly.
    expect((await repo.getLiveProductBySlug("acme")).ok && (await repo.getLiveProductBySlug("acme"))).toMatchObject({ ok: true, value: null });

    const launched = await repo.launchProduct(U1, P1, new Date("2026-09-09T10:00:00.000Z"));
    expect(launched.ok && launched.value.status).toBe("live");
    expect(launched.ok && launched.value.launchedAt?.toISOString()).toBe("2026-09-09T10:00:00.000Z");

    const feed = await repo.feed({ range: "today", limit: 10, now: new Date("2026-09-09T12:00:00.000Z") });
    expect(feed.ok && feed.value.map((p) => p.slug)).toEqual(["acme"]);
    const stale = await repo.feed({ range: "today", limit: 10, now: new Date("2026-09-10T12:00:00.000Z") });
    expect(stale.ok && stale.value).toEqual([]);
    const week = await repo.feed({ range: "week", limit: 10, now: new Date("2026-09-10T12:00:00.000Z") });
    expect(week.ok && week.value).toHaveLength(1);

    // Votes: one per user, counter maintained, idempotent.
    expect((await repo.upvote(P1, U2))).toMatchObject({ ok: true, value: { upvoteCount: 1, changed: true } });
    expect((await repo.upvote(P1, U2))).toMatchObject({ ok: true, value: { upvoteCount: 1, changed: false } });
    expect((await repo.upvote(P1, U1))).toMatchObject({ ok: true, value: { upvoteCount: 2, changed: true } });
    const voted = await repo.hasUpvoted(U2, [P1, P2]);
    expect(voted.ok && [...voted.value]).toEqual([P1]);
    expect((await repo.removeUpvote(P1, U2))).toMatchObject({ ok: true, value: { upvoteCount: 1, changed: true } });
    expect((await repo.removeUpvote(P1, U2))).toMatchObject({ ok: true, value: { upvoteCount: 1, changed: false } });

    // Comments, counted.
    const c = await repo.addComment({ id: "20000000-0000-4000-8000-000000000001", productId: P1, userId: U2, body: "Nice" });
    expect(c.ok).toBe(true);
    const list = await repo.listComments(P1, 50);
    expect(list.ok && list.value.map((x) => x.body)).toEqual(["Nice"]);
    const live = await repo.getLiveProductBySlug("acme");
    expect(live.ok && live.value?.commentCount).toBe(1);
    expect(live.ok && live.value?.upvoteCount).toBe(1);

    // Owner scoping and archive/un-launch.
    expect((await repo.getProductForUser(U2, P1)).ok).toBe(false);
    const archived = await repo.updateProduct(U1, P1, { status: "archived" });
    expect(archived.ok && archived.value.status).toBe("archived");
    expect((await repo.getLiveProductBySlug("acme")).ok && (await repo.getLiveProductBySlug("acme"))).toMatchObject({ value: null });
    const redraft = await repo.updateProduct(U1, P1, { status: "draft", name: "Acme 2" });
    expect(redraft.ok && redraft.value.launchedAt).toBeNull();
    expect(redraft.ok && redraft.value.name).toBe("Acme 2");

    // Delete removes children first (FK enforced).
    expect((await repo.deleteProduct(U1, P1)).ok).toBe(true);
    expect((await repo.listProductsByUser(U1)).ok && (await repo.listProductsByUser(U1))).toMatchObject({ value: [] });
    db.close();
  });
});
