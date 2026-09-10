import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor, type D1Binding } from "@saas/db/d1";
import { createSubscriptionsRepository } from "@saas/db/subscriptions";
import { D1ApiAdapter } from "@saas/db/runner";

// The subscriptions repository against a REAL SQLite engine (D1 is SQLite),
// through the same migrations the runner applies — so the CHECK constraints and
// the patch semantics are exercised, not just asserted.

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
const S1 = "10000000-0000-4000-8000-000000000001";
const S2 = "10000000-0000-4000-8000-000000000002";

const BASE = { userId: U1, name: "Netflix", amountCents: 1599, currency: "USD", cadence: "monthly" as const, anchorDate: "2026-09-20" };

describe("subscriptions repository (SQLite)", () => {
  it("round-trips a subscription and honours its constraints", async () => {
    const db = migrated();
    const repo = createSubscriptionsRepository(createSqlExecutor(d1Over(db)));

    const created = await repo.create({ id: S1, ...BASE, category: "streaming", url: "https://netflix.com", notes: "family" });
    expect(created.ok && created.value).toMatchObject({ name: "Netflix", status: "active", category: "streaming", intervalDays: null });

    // The schema refuses an inconsistent cadence/interval pair in both directions.
    const withInterval = await repo.create({ id: S2, ...BASE, intervalDays: 30 });
    expect(withInterval.ok).toBe(false);
    const customNoInterval = await repo.create({ id: S2, ...BASE, cadence: "custom" });
    expect(customNoInterval.ok).toBe(false);
    const custom = await repo.create({ id: S2, ...BASE, name: "Vitamins", cadence: "custom", intervalDays: 45 });
    expect(custom.ok && custom.value.intervalDays).toBe(45);

    // A negative amount is refused.
    const negative = await repo.create({ id: "10000000-0000-4000-8000-000000000009", ...BASE, amountCents: -1 });
    expect(negative.ok).toBe(false);

    // Patch semantics: absent leaves alone, explicit null clears.
    const renamed = await repo.update(U1, S1, { name: "Netflix Standard" });
    expect(renamed.ok && renamed.value).toMatchObject({ name: "Netflix Standard", url: "https://netflix.com", notes: "family" });
    const cleared = await repo.update(U1, S1, { url: null, notes: null });
    expect(cleared.ok && cleared.value).toMatchObject({ url: null, notes: null });

    // Cadence and interval move together.
    const toMonthly = await repo.update(U1, S2, { cadence: "monthly", intervalDays: null });
    expect(toMonthly.ok && toMonthly.value).toMatchObject({ cadence: "monthly", intervalDays: null });

    // Status filter.
    await repo.update(U1, S2, { status: "cancelled" });
    const active = await repo.list(U1, "active");
    expect(active.ok && active.value.map((s) => s.name)).toEqual(["Netflix Standard"]);
    const all = await repo.list(U1);
    expect(all.ok && all.value).toHaveLength(2);

    // Owner scoping.
    expect((await repo.get(U2, S1)).ok).toBe(false);
    expect((await repo.update(U2, S1, { name: "Hijack" })).ok).toBe(false);
    expect((await repo.remove(U2, S1)).ok).toBe(false);
    expect((await repo.remove(U1, S1)).ok).toBe(true);
    expect((await repo.get(U1, S1)).ok).toBe(false);
    db.close();
  });
});
