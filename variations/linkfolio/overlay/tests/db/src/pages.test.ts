import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor, type D1Binding } from "@saas/db/d1";
import { createPagesRepository } from "@saas/db/pages";
import { D1ApiAdapter } from "@saas/db/runner";

// The pages repository against a REAL SQLite engine (D1 is SQLite), through the
// same migrations the runner applies — so the SQL text, the ON CONFLICT shapes,
// the CHECK constraints and the FK order are exercised, not just asserted.

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
const B1 = "10000000-0000-4000-8000-000000000001";
const B2 = "10000000-0000-4000-8000-000000000002";
const B3 = "10000000-0000-4000-8000-000000000003";

describe("pages repository (SQLite)", () => {
  it("round-trips the page, its blocks and its clicks", async () => {
    const db = migrated();
    const repo = createPagesRepository(createSqlExecutor(d1Over(db)));

    // Page: handle is unique and lower-cased; theme round-trips as JSON.
    const page = await repo.upsertPage({ userId: U1, handle: "Jane", title: "Jane", theme: { accent: "#6366f1", layout: "grid" }, published: true });
    expect(page.ok && page.value).toMatchObject({ handle: "jane", published: true, theme: { accent: "#6366f1", layout: "grid" } });
    const taken = await repo.upsertPage({ userId: U2, handle: "jane", title: "Impostor" });
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error.kind).toBe("conflict");

    // Upsert is an update for the same owner.
    const renamed = await repo.upsertPage({ userId: U1, handle: "jane", title: "Jane D", published: true });
    expect(renamed.ok && renamed.value.title).toBe("Jane D");
    expect((await repo.getPublishedPageByHandle("JANE")).ok).toBe(true);

    // Blocks append in creation order.
    await repo.createBlock({ id: B1, userId: U1, kind: "link", title: "One", url: "https://one.dev" });
    await repo.createBlock({ id: B2, userId: U1, kind: "product", title: "Two", url: "https://two.dev", priceCents: 1299, currency: "USD" });
    await repo.createBlock({ id: B3, userId: U1, kind: "header", title: "Section" });
    const listed = await repo.listBlocks(U1);
    expect(listed.ok && listed.value.map((b) => [b.title, b.position])).toEqual([["One", 0], ["Two", 1], ["Section", 2]]);
    expect(listed.ok && listed.value[1]!.priceCents).toBe(1299);

    // A clickable block without a URL is refused by the schema.
    const noUrl = await repo.createBlock({ id: "10000000-0000-4000-8000-000000000009", userId: U1, kind: "link", title: "Bad" });
    expect(noUrl.ok).toBe(false);

    // Reorder rewrites positions wholesale.
    const reordered = await repo.reorderBlocks(U1, [B3, B2, B1]);
    expect(reordered.ok && reordered.value.map((b) => b.title)).toEqual(["Section", "Two", "One"]);

    // Disabled blocks drop out of the public list.
    await repo.updateBlock(U1, B2, { enabled: false });
    const enabled = await repo.listEnabledBlocks(U1);
    expect(enabled.ok && enabled.value.map((b) => b.title)).toEqual(["Section", "One"]);

    // Patch semantics: absent fields are untouched, explicit null clears.
    const patched = await repo.updateBlock(U1, B1, { description: "note" });
    expect(patched.ok && patched.value).toMatchObject({ title: "One", description: "note" });
    const cleared = await repo.updateBlock(U1, B1, { description: null });
    expect(cleared.ok && cleared.value.description).toBeNull();

    // Owner scoping.
    expect((await repo.getBlock(U2, B1)).ok).toBe(false);
    expect((await repo.updateBlock(U2, B1, { title: "Hijack" })).ok).toBe(false);
    expect((await repo.deleteBlock(U2, B1)).ok).toBe(false);

    // Clicks: recorded against the owner, windowed on read.
    await repo.recordClick({ id: "20000000-0000-4000-8000-000000000001", blockId: B1, userId: U1, referrer: "https://x.com" });
    await repo.recordClick({ id: "20000000-0000-4000-8000-000000000002", blockId: B1, userId: U1 });
    const recent = await repo.clicksSince(U1, new Date("2000-01-01T00:00:00Z"));
    expect(recent.ok && recent.value).toHaveLength(2);
    const future = await repo.clicksSince(U1, new Date("2100-01-01T00:00:00Z"));
    expect(future.ok && future.value).toEqual([]);

    // Delete removes the clicks first (the FK is enforced).
    expect((await repo.deleteBlock(U1, B1)).ok).toBe(true);
    const after = await repo.clicksSince(U1, new Date("2000-01-01T00:00:00Z"));
    expect(after.ok && after.value).toEqual([]);
    db.close();
  });

  it("keeps an unpublished page invisible to the public read", async () => {
    const db = migrated();
    const repo = createPagesRepository(createSqlExecutor(d1Over(db)));
    await repo.upsertPage({ userId: U1, handle: "draft", title: "Draft", published: false });
    expect((await repo.getPublishedPageByHandle("draft")).ok).toBe(true);
    const hidden = await repo.getPublishedPageByHandle("draft");
    expect(hidden.ok && hidden.value).toBeNull();
    const owner = await repo.getPageByUserId(U1);
    expect(owner.ok && owner.value?.handle).toBe("draft");
    db.close();
  });
});
