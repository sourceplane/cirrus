import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor, type D1Binding } from "@saas/db/d1";
import { createMonitorsRepository } from "@saas/db/monitors";
import { D1ApiAdapter } from "@saas/db/runner";

// The monitors repository against a REAL SQLite engine (D1 is SQLite), through
// the same migrations the runner applies — so the CHECK constraints, the
// due-monitor arithmetic and the FK order are exercised, not just asserted.

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
const M1 = "10000000-0000-4000-8000-000000000001";
const M2 = "10000000-0000-4000-8000-000000000002";

describe("monitors repository (SQLite)", () => {
  it("round-trips monitors, checks, incidents and the status page", async () => {
    const db = migrated();
    const repo = createMonitorsRepository(createSqlExecutor(d1Over(db)));

    const created = await repo.createMonitor({ id: M1, userId: U1, name: "API", url: "https://api.example.com/health" });
    expect(created.ok && created.value).toMatchObject({ method: "GET", intervalSec: 300, expectedStatus: 200, enabled: true, lastStatus: "unknown" });

    // The schema refuses values the product does not offer.
    const badInterval = await repo.createMonitor({ id: M2, userId: U1, name: "Bad", url: "https://x.dev", intervalSec: 42 });
    expect(badInterval.ok).toBe(false);
    const badStatus = await repo.createMonitor({ id: M2, userId: U1, name: "Bad", url: "https://x.dev", expectedStatus: 999 });
    expect(badStatus.ok).toBe(false);
    const second = await repo.createMonitor({ id: M2, userId: U1, name: "Docs", url: "https://docs.example.com", intervalSec: 3600 });
    expect(second.ok).toBe(true);

    // Due: never checked counts, and the interval is respected once it has.
    const now = new Date("2026-09-09T12:00:00Z");
    const due1 = await repo.dueMonitors(now, 10);
    expect(due1.ok && due1.value).toHaveLength(2);

    await repo.applyMonitorState(M1, { lastCheckedAt: new Date("2026-09-09T11:59:00Z"), lastStatus: "up", consecutiveFailures: 0 });
    await repo.applyMonitorState(M2, { lastCheckedAt: new Date("2026-09-09T11:00:00Z"), lastStatus: "up", consecutiveFailures: 0 });
    const due2 = await repo.dueMonitors(now, 10);
    // M1 was checked a minute ago against a 5-minute interval; M2 exactly an
    // hour ago against an hourly one. The boundary case is the point: a
    // monitor due to the millisecond must be picked up on this tick, not the
    // next one.
    expect(due2.ok && due2.value.map((m) => m.name)).toEqual(["Docs"]);

    // One millisecond before its interval, it is not yet due.
    await repo.applyMonitorState(M2, { lastCheckedAt: new Date("2026-09-09T11:00:00.001Z"), lastStatus: "up", consecutiveFailures: 0 });
    const notYet = await repo.dueMonitors(now, 10);
    expect(notYet.ok && notYet.value).toEqual([]);
    await repo.applyMonitorState(M2, { lastCheckedAt: new Date("2026-09-09T11:00:00.000Z"), lastStatus: "up", consecutiveFailures: 0 });

    // A disabled monitor is never due.
    await repo.updateMonitor(U1, M2, { enabled: false });
    const due3 = await repo.dueMonitors(now, 10);
    expect(due3.ok && due3.value).toEqual([]);

    // Checks, and the windowed read behind uptime.
    await repo.recordCheck({ id: "20000000-0000-4000-8000-000000000001", monitorId: M1, userId: U1, checkedAt: new Date("2026-09-09T11:00:00Z"), ok: true, statusCode: 200, latencyMs: 120, error: null });
    await repo.recordCheck({ id: "20000000-0000-4000-8000-000000000002", monitorId: M1, userId: U1, checkedAt: new Date("2026-09-08T11:00:00Z"), ok: false, statusCode: 500, latencyMs: 30, error: "boom" });
    const recent = await repo.checksSince(M1, new Date("2026-09-09T00:00:00Z"));
    expect(recent.ok && recent.value).toHaveLength(1);
    const all = await repo.listChecks(M1, 10);
    expect(all.ok && all.value).toHaveLength(2);
    expect(all.ok && all.value[0]!.ok).toBe(true);

    // Incidents: open, then resolve.
    await repo.openIncident({ id: "30000000-0000-4000-8000-000000000001", monitorId: M1, userId: U1, openedAt: new Date("2026-09-09T10:00:00Z"), cause: "500" });
    const open = await repo.listIncidents(U1, 10);
    expect(open.ok && open.value[0]!.resolvedAt).toBeNull();
    await repo.resolveOpenIncident(M1, new Date("2026-09-09T10:30:00Z"));
    const resolved = await repo.listIncidents(U1, 10);
    expect(resolved.ok && resolved.value[0]!.resolvedAt).not.toBeNull();
    // Resolving again is a no-op, not a second write.
    await repo.resolveOpenIncident(M1, new Date("2026-09-09T11:00:00Z"));
    const stillOne = await repo.listIncidents(U1, 10);
    expect(stillOne.ok && stillOne.value).toHaveLength(1);
    expect(stillOne.ok && stillOne.value[0]!.resolvedAt?.toISOString()).toBe("2026-09-09T10:30:00.000Z");

    // Status page: handle unique and lower-cased, private by default.
    const page = await repo.upsertStatusPage({ userId: U1, handle: "Acme", title: "Acme status" });
    expect(page.ok && page.value).toMatchObject({ handle: "acme", isPublic: false });
    const hidden = await repo.getPublicStatusPageByHandle("acme");
    expect(hidden.ok && hidden.value).toBeNull();
    await repo.upsertStatusPage({ userId: U1, handle: "acme", title: "Acme status", isPublic: true });
    const visible = await repo.getPublicStatusPageByHandle("ACME");
    expect(visible.ok && visible.value?.title).toBe("Acme status");
    const taken = await repo.upsertStatusPage({ userId: U2, handle: "acme", title: "Impostor" });
    expect(taken.ok).toBe(false);

    // Owner scoping, then delete with its history.
    expect((await repo.getMonitor(U2, M1)).ok).toBe(false);
    expect((await repo.deleteMonitor(U2, M1)).ok).toBe(false);
    expect((await repo.deleteMonitor(U1, M1)).ok).toBe(true);
    const leftovers = await repo.listChecks(M1, 10);
    expect(leftovers.ok && leftovers.value).toEqual([]);
    const noIncidents = await repo.listIncidents(U1, 10);
    expect(noIncidents.ok && noIncidents.value).toEqual([]);
    db.close();
  });
});
