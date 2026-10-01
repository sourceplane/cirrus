import { route } from "@monitors-worker/router";
import { runDueChecks } from "@monitors-worker/scheduler";
import type { Env } from "@monitors-worker/env";
import type { Deps } from "@monitors-worker/deps";
import type { ProbeResult } from "@monitors-worker/probe";
import type { Check, Incident, Monitor, MonitorsRepository, StatusPage } from "@saas/db/monitors";

const NOW = new Date("2026-09-09T12:00:00.000Z");

function fakeRepo(): MonitorsRepository & { monitors: Monitor[]; checks: Check[]; incidents: Incident[]; pages: StatusPage[] } {
  const monitors: Monitor[] = [];
  const checks: Check[] = [];
  const incidents: Incident[] = [];
  const pages: StatusPage[] = [];

  const repo: MonitorsRepository = {
    async listMonitors(userId) {
      return { ok: true, value: monitors.filter((m) => m.userId === userId) };
    },
    async getMonitor(userId, id) {
      const m = monitors.find((x) => x.userId === userId && x.id === id);
      return m ? { ok: true, value: m } : { ok: false, error: { kind: "not_found" } };
    },
    async getMonitorById(id) {
      return { ok: true, value: monitors.find((x) => x.id === id) ?? null };
    },
    async createMonitor(input) {
      const m: Monitor = {
        id: input.id, userId: input.userId, name: input.name, url: input.url,
        method: input.method ?? "GET", intervalSec: input.intervalSec ?? 300,
        expectedStatus: input.expectedStatus ?? 200, enabled: true,
        lastCheckedAt: null, lastStatus: "unknown", consecutiveFailures: 0,
        createdAt: NOW, updatedAt: NOW,
      };
      monitors.push(m);
      return { ok: true, value: m };
    },
    async updateMonitor(userId, id, input) {
      const m = monitors.find((x) => x.userId === userId && x.id === id);
      if (!m) return { ok: false, error: { kind: "not_found" } };
      Object.assign(m, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
      return { ok: true, value: m };
    },
    async deleteMonitor(userId, id) {
      const i = monitors.findIndex((x) => x.userId === userId && x.id === id);
      if (i < 0) return { ok: false, error: { kind: "not_found" } };
      monitors.splice(i, 1);
      return { ok: true, value: undefined };
    },
    async dueMonitors(now, limit) {
      const due = monitors.filter(
        (m) => m.enabled && (!m.lastCheckedAt || now.getTime() - m.lastCheckedAt.getTime() >= m.intervalSec * 1000),
      );
      return { ok: true, value: due.slice(0, limit) };
    },
    async applyMonitorState(id, state) {
      const m = monitors.find((x) => x.id === id);
      if (!m) return { ok: false, error: { kind: "not_found" } };
      m.lastCheckedAt = state.lastCheckedAt;
      m.lastStatus = state.lastStatus;
      m.consecutiveFailures = state.consecutiveFailures;
      return { ok: true, value: m };
    },
    async recordCheck(input) {
      const c: Check = { ...input };
      checks.push(c);
      return { ok: true, value: c };
    },
    async listChecks(monitorId, limit) {
      return { ok: true, value: checks.filter((c) => c.monitorId === monitorId).slice(-limit).reverse() };
    },
    async checksSince(monitorId, since) {
      return { ok: true, value: checks.filter((c) => c.monitorId === monitorId && c.checkedAt >= since) };
    },
    async openIncident(input) {
      const i: Incident = { id: input.id, monitorId: input.monitorId, userId: input.userId, openedAt: input.openedAt, resolvedAt: null, cause: input.cause ?? null };
      incidents.push(i);
      return { ok: true, value: i };
    },
    async resolveOpenIncident(monitorId, resolvedAt) {
      for (const i of incidents) if (i.monitorId === monitorId && i.resolvedAt === null) i.resolvedAt = resolvedAt;
      return { ok: true, value: undefined };
    },
    async listIncidents(userId, limit) {
      return {
        ok: true,
        value: incidents
          .filter((i) => i.userId === userId)
          .sort((a, b) => Number(b.resolvedAt === null) - Number(a.resolvedAt === null))
          .slice(0, limit),
      };
    },
    async listIncidentsForMonitors(ids, limit) {
      return { ok: true, value: incidents.filter((i) => ids.includes(i.monitorId)).slice(0, limit) };
    },
    async getStatusPage(userId) {
      return { ok: true, value: pages.find((p) => p.userId === userId) ?? null };
    },
    async getPublicStatusPageByHandle(handle) {
      return { ok: true, value: pages.find((p) => p.handle === handle.toLowerCase() && p.isPublic) ?? null };
    },
    async upsertStatusPage(input) {
      if (pages.some((p) => p.handle === input.handle && p.userId !== input.userId)) {
        return { ok: false, error: { kind: "conflict", entity: "handle" } };
      }
      const existing = pages.find((p) => p.userId === input.userId);
      const page: StatusPage = {
        userId: input.userId, handle: input.handle, title: input.title,
        description: input.description ?? null, isPublic: input.isPublic ?? false,
        createdAt: existing?.createdAt ?? NOW, updatedAt: NOW,
      };
      if (existing) pages.splice(pages.indexOf(existing), 1, page);
      else pages.push(page);
      return { ok: true, value: page };
    },
  };
  return Object.assign(repo, { monitors, checks, incidents, pages });
}

let seq = 0;
function deps(repo: MonitorsRepository, probeResult: ProbeResult | (() => ProbeResult) = { ok: true, statusCode: 200, latencyMs: 120, error: null }): Deps {
  return {
    repo,
    probe: async () => (typeof probeResult === "function" ? probeResult() : probeResult),
    now: () => NOW,
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    dispose: async () => {},
  };
}

const env: Env = { ENVIRONMENT: "test" };
const USER_A = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "usr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MONITOR = { name: "API", url: "https://api.example.com/health" };

function req(method: string, path: string, opts: { user?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": "req_test" };
  if (opts.user) {
    headers["x-actor-subject-id"] = opts.user;
    headers["x-actor-subject-type"] = "user";
  }
  return new Request(`https://monitors-worker${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

async function json(r: Response): Promise<any> {
  return r.json();
}

async function add(d: Deps, user: string, body: Record<string, unknown> = {}): Promise<string> {
  const r = await route(req("POST", "/v1/me/monitors", { user, body: { ...MONITOR, ...body } }), env, d);
  return (await json(r)).data.monitor.id;
}

describe("monitors-worker router", () => {
  it("health needs no actor", async () => {
    expect((await route(req("GET", "/health"), env)).status).toBe(200);
  });

  it("503s without a database when no deps are injected", async () => {
    expect((await route(req("GET", "/v1/status/acme"), env)).status).toBe(503);
  });

  it("owner routes need a user actor", async () => {
    const d = deps(fakeRepo());
    for (const path of ["/v1/me/monitors", "/v1/me/incidents", "/v1/me/status-page"]) {
      expect((await route(req("GET", path), env, d)).status).toBe(401);
    }
  });

  it("creates a monitor and refuses one it must not fetch", async () => {
    const d = deps(fakeRepo());
    const r = await route(req("POST", "/v1/me/monitors", { user: USER_A, body: MONITOR }), env, d);
    expect(r.status).toBe(201);
    const m = (await json(r)).data.monitor;
    expect(m.id).toMatch(/^mon_[0-9a-f]{32}$/);
    expect(m).toMatchObject({ status: "unknown", enabled: true, intervalSec: 300, expectedStatus: 200, method: "GET" });

    for (const url of ["http://localhost:3000", "http://169.254.169.254/", "http://10.1.2.3/", "not a url"]) {
      expect((await route(req("POST", "/v1/me/monitors", { user: USER_A, body: { ...MONITOR, url } }), env, d)).status).toBe(422);
    }
    expect((await route(req("POST", "/v1/me/monitors", { user: USER_A, body: { ...MONITOR, intervalSec: 42 } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/monitors", { user: USER_A, body: { ...MONITOR, method: "DELETE" } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/monitors", { user: USER_A, body: { ...MONITOR, expectedStatus: 999 } }), env, d)).status).toBe(422);
  });

  it("scopes every monitor operation to its owner", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A);
    expect((await route(req("GET", `/v1/me/monitors/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("PATCH", `/v1/me/monitors/${id}`, { user: USER_B, body: { name: "Hijack" } }), env, d)).status).toBe(404);
    expect((await route(req("GET", `/v1/me/monitors/${id}/checks`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/monitors/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/monitors/${id}`, { user: USER_A }), env, d)).status).toBe(204);
  });

  it("runs a check on demand and reports its result", async () => {
    const repo = fakeRepo();
    const d = deps(repo, { ok: true, statusCode: 200, latencyMs: 87, error: null });
    const id = await add(d, USER_A);
    const r = await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_A }), env, d);
    expect(r.status).toBe(200);
    const body = (await json(r)).data;
    expect(body.check).toMatchObject({ ok: true, statusCode: 200, latencyMs: 87 });
    expect(body.monitor).toMatchObject({ status: "up", uptime24h: 100 });
    expect(repo.checks).toHaveLength(1);
  });

  it("opens an incident on the second failure and resolves it on recovery", async () => {
    const repo = fakeRepo();
    let failing = true;
    const d = deps(repo, () => (failing ? { ok: false, statusCode: 500, latencyMs: 30, error: "Expected 200, got 500" } : { ok: true, statusCode: 200, latencyMs: 40, error: null }));
    const id = await add(d, USER_A);

    const first = await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_A }), env, d);
    // One failure is a blip: no incident yet.
    expect((await json(first)).data.monitor.status).toBe("unknown");
    expect(repo.incidents).toHaveLength(0);

    const second = await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_A }), env, d);
    expect((await json(second)).data.monitor.status).toBe("down");
    expect(repo.incidents).toHaveLength(1);
    expect(repo.incidents[0]!.resolvedAt).toBeNull();
    expect(repo.incidents[0]!.cause).toContain("500");

    const incidents = await route(req("GET", "/v1/me/incidents", { user: USER_A }), env, d);
    const listed = (await json(incidents)).data.incidents;
    expect(listed[0]).toMatchObject({ monitorName: "API", resolvedAt: null });

    failing = false;
    const third = await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_A }), env, d);
    expect((await json(third)).data.monitor.status).toBe("up");
    expect(repo.incidents[0]!.resolvedAt).not.toBeNull();
    // Recovery does not open a second incident.
    expect(repo.incidents).toHaveLength(1);
  });

  it("lists checks with a bounded limit", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A);
    await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_A }), env, d);
    const r = await route(req("GET", `/v1/me/monitors/${id}/checks?limit=10`, { user: USER_A }), env, d);
    expect(r.status).toBe(200);
    expect((await json(r)).data.checks).toHaveLength(1);
    expect((await route(req("GET", `/v1/me/monitors/${id}/checks?limit=0`, { user: USER_A }), env, d)).status).toBe(422);
    expect((await route(req("GET", `/v1/me/monitors/${id}/checks?limit=9999`, { user: USER_A }), env, d)).status).toBe(422);
  });

  it("keeps the status page private until it is published, and never leaks URLs", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    const id = await add(d, USER_A);
    await route(req("POST", `/v1/me/monitors/${id}/check`, { user: USER_A }), env, d);

    expect((await json(await route(req("GET", "/v1/me/status-page", { user: USER_A }), env, d))).data.statusPage).toBeNull();
    const created = await route(req("PUT", "/v1/me/status-page", { user: USER_A, body: { handle: "Acme", title: "Acme status" } }), env, d);
    expect(created.status).toBe(200);
    expect((await json(created)).data.statusPage).toMatchObject({ handle: "acme", isPublic: false });

    // Private: invisible.
    expect((await route(req("GET", "/v1/status/acme"), env, d)).status).toBe(404);

    await route(req("PUT", "/v1/me/status-page", { user: USER_A, body: { handle: "acme", title: "Acme status", description: "Live status", isPublic: true } }), env, d);
    const page = await route(req("GET", "/v1/status/acme"), env, d);
    expect(page.status).toBe(200);
    const body = (await json(page)).data;
    expect(body.page).toEqual({ handle: "acme", title: "Acme status", description: "Live status" });
    expect(body.monitors[0]).toMatchObject({ name: "API", status: "up" });
    // The public shape carries no URL and no owner id.
    expect(JSON.stringify(body)).not.toContain("api.example.com");
    expect(JSON.stringify(body)).not.toContain(USER_A);
  });

  it("refuses a handle another owner holds and rejects a bad one", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("PUT", "/v1/me/status-page", { user: USER_A, body: { handle: "taken", title: "A" } }), env, d)).status).toBe(200);
    const conflict = await route(req("PUT", "/v1/me/status-page", { user: USER_B, body: { handle: "taken", title: "B" } }), env, d);
    expect(conflict.status).toBe(409);
    expect((await json(conflict)).error.details.field).toBe("handle");
    expect((await route(req("PUT", "/v1/me/status-page", { user: USER_A, body: { handle: "status", title: "A" } }), env, d)).status).toBe(422);
    expect((await route(req("PUT", "/v1/me/status-page", { user: USER_A, body: { handle: "ok-handle", title: "" } }), env, d)).status).toBe(422);
  });

  it("hides a disabled monitor from the status page", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A);
    await route(req("PUT", "/v1/me/status-page", { user: USER_A, body: { handle: "acme", title: "Acme", isPublic: true } }), env, d);
    await route(req("PATCH", `/v1/me/monitors/${id}`, { user: USER_A, body: { enabled: false } }), env, d);
    const page = await route(req("GET", "/v1/status/acme"), env, d);
    expect((await json(page)).data.monitors).toEqual([]);
  });

  it("unknown routes and wrong methods", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("GET", "/v1/nope", { user: USER_A }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", "/v1/me/monitors", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("PUT", "/v1/status/acme"), env, d)).status).toBe(405);
    expect((await route(req("GET", "/v1/me/monitors/not-an-id", { user: USER_A }), env, d)).status).toBe(404);
  });
});

describe("scheduler", () => {
  it("probes only what is due, and marks each monitor checked", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    const fresh = await add(d, USER_A, { name: "Fresh", intervalSec: 3600 });
    await add(d, USER_A, { name: "Never checked" });

    // Pretend the first was checked a minute ago: its hourly interval is not up.
    const freshRow = repo.monitors.find((m) => m.name === "Fresh")!;
    freshRow.lastCheckedAt = new Date(NOW.getTime() - 60_000);
    expect(fresh).toBeDefined();

    const result = await runDueChecks(d);
    expect(result).toEqual({ due: 1, checked: 1 });
    expect(repo.checks).toHaveLength(1);
    expect(repo.monitors.find((m) => m.name === "Never checked")!.lastStatus).toBe("up");
    expect(freshRow.lastStatus).toBe("unknown");
  });

  it("skips disabled monitors entirely", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    const id = await add(d, USER_A);
    await route(req("PATCH", `/v1/me/monitors/${id}`, { user: USER_A, body: { enabled: false } }), env, d);
    expect(await runDueChecks(d)).toEqual({ due: 0, checked: 0 });
    expect(repo.checks).toHaveLength(0);
  });

  it("opens incidents from the cron path, exactly as the manual check does", async () => {
    const repo = fakeRepo();
    const d = deps(repo, { ok: false, statusCode: 503, latencyMs: 20, error: "Expected 200, got 503" });
    await add(d, USER_A);

    await runDueChecks(d);
    expect(repo.incidents).toHaveLength(0);
    // The monitor is due again immediately in the fake clock's world.
    repo.monitors[0]!.lastCheckedAt = new Date(NOW.getTime() - 3_600_000);
    await runDueChecks(d);
    expect(repo.incidents).toHaveLength(1);
    expect(repo.monitors[0]!.lastStatus).toBe("down");
  });
});
