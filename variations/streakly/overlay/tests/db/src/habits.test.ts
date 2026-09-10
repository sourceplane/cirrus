import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor, type D1Binding } from "@saas/db/d1";
import { createHabitsRepository } from "@saas/db/habits";
import { D1ApiAdapter } from "@saas/db/runner";

// The habits repository against a REAL SQLite engine (D1 is SQLite), through
// the same migrations the runner applies — so the CHECK constraints, the
// ON CONFLICT idempotency and the FK order are exercised, not just asserted.

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
const H1 = "10000000-0000-4000-8000-000000000001";
const H2 = "10000000-0000-4000-8000-000000000002";

describe("habits repository (SQLite)", () => {
  it("round-trips habits and check-ins", async () => {
    const db = migrated();
    const repo = createHabitsRepository(createSqlExecutor(d1Over(db)));

    const daily = await repo.createHabit({ id: H1, userId: U1, name: "Read", cadence: "daily", color: "#6366f1" });
    expect(daily.ok && daily.value).toMatchObject({ name: "Read", cadence: "daily", targetPerWeek: null, position: 0, archivedAt: null });
    const gym = await repo.createHabit({ id: H2, userId: U1, name: "Gym", cadence: "weekly_target", targetPerWeek: 3 });
    expect(gym.ok && gym.value.position).toBe(1);

    // The schema itself refuses an inconsistent cadence/target pair.
    const bad = await repo.createHabit({ id: "10000000-0000-4000-8000-000000000009", userId: U1, name: "Bad", cadence: "daily", targetPerWeek: 3 });
    expect(bad.ok).toBe(false);
    const missing = await repo.createHabit({ id: "10000000-0000-4000-8000-00000000000a", userId: U1, name: "Bad", cadence: "weekly_target" });
    expect(missing.ok).toBe(false);

    // Check-ins are idempotent per (habit, date).
    expect((await repo.checkIn({ id: "20000000-0000-4000-8000-000000000001", habitId: H1, userId: U1, date: "2026-09-09" })).ok).toBe(true);
    const again = await repo.checkIn({ id: "20000000-0000-4000-8000-000000000002", habitId: H1, userId: U1, date: "2026-09-09", note: "chapter 4" });
    expect(again.ok && again.value.note).toBe("chapter 4");
    const dates = await repo.checkInDates(U1, H1);
    expect(dates.ok && dates.value).toEqual(["2026-09-09"]);

    await repo.checkIn({ id: "20000000-0000-4000-8000-000000000003", habitId: H1, userId: U1, date: "2026-09-08" });
    await repo.checkIn({ id: "20000000-0000-4000-8000-000000000004", habitId: H2, userId: U1, date: "2026-09-08" });
    const all = await repo.allCheckInDates(U1);
    expect(all.ok && [...all.value.get(H1)!].sort()).toEqual(["2026-09-08", "2026-09-09"]);
    expect(all.ok && all.value.get(H2)).toEqual(["2026-09-08"]);

    // Undo is scoped to the owner.
    expect((await repo.undoCheckIn(U2, H1, "2026-09-09")).ok).toBe(false);
    expect((await repo.undoCheckIn(U1, H1, "2026-09-09")).ok).toBe(true);

    // Archive hides without deleting; the list opts in.
    await repo.updateHabit(U1, H2, { archived: true });
    const active = await repo.listHabits(U1, false);
    expect(active.ok && active.value.map((h) => h.name)).toEqual(["Read"]);
    const withArchived = await repo.listHabits(U1, true);
    expect(withArchived.ok && withArchived.value).toHaveLength(2);
    await repo.updateHabit(U1, H2, { archived: false });
    expect((await repo.listHabits(U1, false)).ok && (await repo.listHabits(U1, false))).toMatchObject({ ok: true });

    // Cadence switch clears the target in the same statement.
    const switched = await repo.updateHabit(U1, H2, { cadence: "daily", targetPerWeek: null });
    expect(switched.ok && switched.value).toMatchObject({ cadence: "daily", targetPerWeek: null });

    // Reorder rewrites positions wholesale.
    const reordered = await repo.reorderHabits(U1, [H2, H1]);
    expect(reordered.ok && reordered.value.map((h) => h.name)).toEqual(["Gym", "Read"]);

    // Owner scoping on reads and writes.
    expect((await repo.getHabit(U2, H1)).ok).toBe(false);
    expect((await repo.updateHabit(U2, H1, { name: "Hijack" })).ok).toBe(false);

    // Delete takes the check-ins with it (the FK is enforced).
    expect((await repo.deleteHabit(U1, H1)).ok).toBe(true);
    const left = await repo.allCheckInDates(U1);
    expect(left.ok && left.value.has(H1)).toBe(false);
    db.close();
  });
});
