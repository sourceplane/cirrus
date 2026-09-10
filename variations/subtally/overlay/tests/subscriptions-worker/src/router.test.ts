import { route } from "@subscriptions-worker/router";
import type { Env } from "@subscriptions-worker/env";
import type { Deps } from "@subscriptions-worker/deps";
import type { Subscription, SubscriptionsRepository, TrackedSubscriptionStatus } from "@saas/db/subscriptions";

const NOW = new Date("2026-09-09T12:00:00.000Z");

function fakeRepo(): SubscriptionsRepository & { items: Subscription[] } {
  const items: Subscription[] = [];
  const repo: SubscriptionsRepository = {
    async list(userId, status) {
      return {
        ok: true,
        value: items.filter((s) => s.userId === userId && (!status || s.status === status)).sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
    async get(userId, id) {
      const s = items.find((x) => x.userId === userId && x.id === id);
      return s ? { ok: true, value: s } : { ok: false, error: { kind: "not_found" } };
    },
    async create(input) {
      const s: Subscription = {
        id: input.id, userId: input.userId, name: input.name, amountCents: input.amountCents,
        currency: input.currency, cadence: input.cadence, intervalDays: input.intervalDays ?? null,
        anchorDate: input.anchorDate, category: input.category ?? "other", status: "active",
        url: input.url ?? null, notes: input.notes ?? null, createdAt: NOW, updatedAt: NOW,
      };
      items.push(s);
      return { ok: true, value: s };
    },
    async update(userId, id, input) {
      const s = items.find((x) => x.userId === userId && x.id === id);
      if (!s) return { ok: false, error: { kind: "not_found" } };
      Object.assign(s, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
      return { ok: true, value: s };
    },
    async remove(userId, id) {
      const i = items.findIndex((x) => x.userId === userId && x.id === id);
      if (i < 0) return { ok: false, error: { kind: "not_found" } };
      items.splice(i, 1);
      return { ok: true, value: undefined };
    },
  };
  return Object.assign(repo, { items });
}

let seq = 0;
function deps(repo: SubscriptionsRepository): Deps {
  return { repo, now: () => NOW, newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, dispose: async () => {} };
}

const env: Env = { ENVIRONMENT: "test" };
const USER_A = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "usr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function req(method: string, path: string, opts: { user?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": "req_test" };
  if (opts.user) {
    headers["x-actor-subject-id"] = opts.user;
    headers["x-actor-subject-type"] = "user";
  }
  return new Request(`https://subscriptions-worker${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

async function json(r: Response): Promise<any> {
  return r.json();
}

const BASE = { name: "Netflix", amountCents: 1599, currency: "USD", cadence: "monthly", anchorDate: "2026-09-20" };

async function add(d: Deps, user: string, body: Record<string, unknown> = {}): Promise<string> {
  const r = await route(req("POST", "/v1/me/subscriptions", { user, body: { ...BASE, ...body } }), env, d);
  return (await json(r)).data.subscription.id;
}

describe("subscriptions-worker router", () => {
  it("health needs no actor", async () => {
    expect((await route(req("GET", "/health"), env)).status).toBe(200);
  });

  it("503s without a database when no deps are injected", async () => {
    expect((await route(req("GET", "/v1/me/subscriptions", { user: USER_A }), env)).status).toBe(503);
  });

  it("has no anonymous surface", async () => {
    const d = deps(fakeRepo());
    for (const path of ["/v1/me/subscriptions", "/v1/me/subscriptions/summary", "/v1/me/subscriptions/upcoming"]) {
      expect((await route(req("GET", path), env, d)).status).toBe(401);
    }
  });

  it("creates a subscription and derives its renewal and normalised cost", async () => {
    const d = deps(fakeRepo());
    const r = await route(req("POST", "/v1/me/subscriptions", { user: USER_A, body: BASE }), env, d);
    expect(r.status).toBe(201);
    const s = (await json(r)).data.subscription;
    expect(s.id).toMatch(/^sub_[0-9a-f]{32}$/);
    expect(s).toMatchObject({ status: "active", category: "other", nextRenewal: "2026-09-20", monthlyCents: 1599, yearlyCents: 19188 });
  });

  it("enforces the cadence/interval rule", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("POST", "/v1/me/subscriptions", { user: USER_A, body: { ...BASE, cadence: "custom" } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/subscriptions", { user: USER_A, body: { ...BASE, intervalDays: 30 } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/subscriptions", { user: USER_A, body: { ...BASE, cadence: "custom", intervalDays: 0 } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/subscriptions", { user: USER_A, body: { ...BASE, cadence: "custom", intervalDays: 45 } }), env, d)).status).toBe(201);
  });

  it("rejects malformed money, currency, dates and categories", async () => {
    const d = deps(fakeRepo());
    const bad = [
      { amountCents: 12.99 },
      { amountCents: -1 },
      { currency: "dollars" },
      { currency: "usd" },
      { anchorDate: "20-09-2026" },
      { anchorDate: "2026-02-30" },
      { category: "yachts" },
      { name: "" },
      { url: "javascript:alert(1)" },
    ];
    for (const patch of bad) {
      const r = await route(req("POST", "/v1/me/subscriptions", { user: USER_A, body: { ...BASE, ...patch } }), env, d);
      expect([422, 400]).toContain(r.status);
    }
  });

  it("scopes every operation to its owner", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A);
    expect((await route(req("GET", `/v1/me/subscriptions/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("PATCH", `/v1/me/subscriptions/${id}`, { user: USER_B, body: { name: "Hijack" } }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/subscriptions/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/subscriptions/${id}`, { user: USER_A }), env, d)).status).toBe(204);
  });

  it("moves a subscription through its statuses and drops it from totals", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A);
    const paused = await route(req("PATCH", `/v1/me/subscriptions/${id}`, { user: USER_A, body: { status: "paused" } }), env, d);
    expect(paused.status).toBe(200);
    // A paused subscription is not being billed, so it has no next renewal.
    expect((await json(paused)).data.subscription.nextRenewal).toBeNull();

    const summary = await route(req("GET", "/v1/me/subscriptions/summary?asOf=2026-09-09", { user: USER_A }), env, d);
    const body = (await json(summary)).data;
    expect(body).toMatchObject({ activeCount: 0, pausedCount: 1 });
    expect(body.monthlyCentsByCurrency).toEqual({});
    expect((await route(req("PATCH", `/v1/me/subscriptions/${id}`, { user: USER_A, body: { status: "flying" } }), env, d)).status).toBe(422);
  });

  it("switches cadence and clears the interval with it", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A, { cadence: "custom", intervalDays: 45 });
    const monthly = await route(req("PATCH", `/v1/me/subscriptions/${id}`, { user: USER_A, body: { cadence: "monthly" } }), env, d);
    expect(monthly.status).toBe(200);
    expect((await json(monthly)).data.subscription).toMatchObject({ cadence: "monthly", intervalDays: null });
    // Moving to custom without an interval is refused.
    expect((await route(req("PATCH", `/v1/me/subscriptions/${id}`, { user: USER_A, body: { cadence: "custom" } }), env, d)).status).toBe(422);
  });

  it("totals per currency and per category, never mixing them", async () => {
    const d = deps(fakeRepo());
    await add(d, USER_A, { name: "Netflix", amountCents: 1599, category: "streaming" });
    await add(d, USER_A, { name: "Spotify", amountCents: 1199, category: "streaming" });
    await add(d, USER_A, { name: "Domain", amountCents: 1200, cadence: "yearly", category: "software" });
    await add(d, USER_A, { name: "Euro thing", amountCents: 1000, currency: "EUR", category: "software" });

    const r = await route(req("GET", "/v1/me/subscriptions/summary?asOf=2026-09-09", { user: USER_A }), env, d);
    const body = (await json(r)).data;
    expect(body.asOf).toBe("2026-09-09");
    expect(body.activeCount).toBe(4);
    expect(body.monthlyCentsByCurrency).toEqual({ USD: 1599 + 1199 + 100, EUR: 1000 });
    expect(body.yearlyCentsByCurrency.USD).toBe(1599 * 12 + 1199 * 12 + 1200);
    // Categories are split per currency too — the same reason.
    const streaming = body.byCategory.find((c: any) => c.category === "streaming");
    expect(streaming).toMatchObject({ currency: "USD", monthlyCents: 2798, count: 2 });
    const softwareCodes = body.byCategory.filter((c: any) => c.category === "software").map((c: any) => c.currency).sort();
    expect(softwareCodes).toEqual(["EUR", "USD"]);
  });

  it("lists upcoming renewals inside the window, soonest first", async () => {
    const d = deps(fakeRepo());
    await add(d, USER_A, { name: "Soon", anchorDate: "2026-09-12" });
    await add(d, USER_A, { name: "Later", anchorDate: "2026-09-30" });
    await add(d, USER_A, { name: "Far", cadence: "yearly", anchorDate: "2026-12-01" });

    const r = await route(req("GET", "/v1/me/subscriptions/upcoming?days=30&asOf=2026-09-09", { user: USER_A }), env, d);
    expect(r.status).toBe(200);
    const body = (await json(r)).data;
    expect(body.renewals.map((x: any) => x.subscription.name)).toEqual(["Soon", "Later"]);
    expect(body.renewals[0]).toMatchObject({ nextRenewal: "2026-09-12", daysUntil: 3 });

    const narrow = await route(req("GET", "/v1/me/subscriptions/upcoming?days=5&asOf=2026-09-09", { user: USER_A }), env, d);
    expect((await json(narrow)).data.renewals.map((x: any) => x.subscription.name)).toEqual(["Soon"]);

    expect((await route(req("GET", "/v1/me/subscriptions/upcoming?days=0", { user: USER_A }), env, d)).status).toBe(422);
    expect((await route(req("GET", "/v1/me/subscriptions/upcoming?days=400", { user: USER_A }), env, d)).status).toBe(422);
  });

  it("rejects a malformed asOf once, for every view", async () => {
    const d = deps(fakeRepo());
    for (const path of ["/v1/me/subscriptions", "/v1/me/subscriptions/summary", "/v1/me/subscriptions/upcoming"]) {
      expect((await route(req("GET", `${path}?asOf=nope`, { user: USER_A }), env, d)).status).toBe(422);
    }
  });

  it("filters the list by status", async () => {
    const d = deps(fakeRepo());
    const id = await add(d, USER_A, { name: "Paused one" });
    await add(d, USER_A, { name: "Active one" });
    await route(req("PATCH", `/v1/me/subscriptions/${id}`, { user: USER_A, body: { status: "paused" } }), env, d);
    const active = await route(req("GET", "/v1/me/subscriptions?status=active", { user: USER_A }), env, d);
    expect((await json(active)).data.subscriptions.map((s: any) => s.name)).toEqual(["Active one"]);
    expect((await route(req("GET", "/v1/me/subscriptions?status=nope", { user: USER_A }), env, d)).status).toBe(422);
  });

  it("unknown routes and wrong methods", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("GET", "/v1/nope", { user: USER_A }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", "/v1/me/subscriptions", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("POST", "/v1/me/subscriptions/summary", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("PATCH", "/v1/me/subscriptions/not-an-id", { user: USER_A, body: {} }), env, d)).status).toBe(404);
  });
});
