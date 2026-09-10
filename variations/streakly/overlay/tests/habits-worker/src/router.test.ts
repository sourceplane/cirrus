import { route } from "@habits-worker/router";
import type { Env } from "@habits-worker/env";
import type { Deps } from "@habits-worker/deps";
import type { CheckIn, Habit, HabitsRepository } from "@saas/db/habits";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const WED = "2026-09-09";

function fakeRepo(): HabitsRepository & { habits: Habit[]; checkins: CheckIn[] } {
  const habits: Habit[] = [];
  const checkins: CheckIn[] = [];

  const repo: HabitsRepository = {
    async listHabits(userId, includeArchived) {
      const rows = habits
        .filter((h) => h.userId === userId && (includeArchived || h.archivedAt === null))
        .sort((a, b) => a.position - b.position);
      return { ok: true, value: rows };
    },
    async getHabit(userId, id) {
      const h = habits.find((x) => x.userId === userId && x.id === id);
      return h ? { ok: true, value: h } : { ok: false, error: { kind: "not_found" } };
    },
    async createHabit(input) {
      const h: Habit = {
        id: input.id, userId: input.userId, name: input.name, cadence: input.cadence,
        targetPerWeek: input.targetPerWeek ?? null, color: input.color ?? null,
        position: habits.filter((x) => x.userId === input.userId).length,
        archivedAt: null, createdAt: NOW, updatedAt: NOW,
      };
      habits.push(h);
      return { ok: true, value: h };
    },
    async updateHabit(userId, id, input) {
      const h = habits.find((x) => x.userId === userId && x.id === id);
      if (!h) return { ok: false, error: { kind: "not_found" } };
      if (input.name !== undefined) h.name = input.name;
      if (input.cadence !== undefined) h.cadence = input.cadence;
      if (input.targetPerWeek !== undefined) h.targetPerWeek = input.targetPerWeek;
      if (input.color !== undefined) h.color = input.color;
      if (input.archived !== undefined) h.archivedAt = input.archived ? NOW : null;
      return { ok: true, value: h };
    },
    async deleteHabit(userId, id) {
      const i = habits.findIndex((x) => x.userId === userId && x.id === id);
      if (i < 0) return { ok: false, error: { kind: "not_found" } };
      habits.splice(i, 1);
      return { ok: true, value: undefined };
    },
    async reorderHabits(userId, ids) {
      ids.forEach((id, i) => {
        const h = habits.find((x) => x.userId === userId && x.id === id);
        if (h) h.position = i;
      });
      return { ok: true, value: habits.filter((h) => h.userId === userId).sort((a, b) => a.position - b.position) };
    },
    async checkIn(input) {
      const existing = checkins.find((c) => c.habitId === input.habitId && c.date === input.date);
      if (existing) {
        if (input.note) existing.note = input.note;
        return { ok: true, value: existing };
      }
      const c: CheckIn = { id: input.id, habitId: input.habitId, userId: input.userId, date: input.date, note: input.note ?? null, createdAt: NOW };
      checkins.push(c);
      return { ok: true, value: c };
    },
    async undoCheckIn(userId, habitId, date) {
      const i = checkins.findIndex((c) => c.userId === userId && c.habitId === habitId && c.date === date);
      if (i < 0) return { ok: false, error: { kind: "not_found" } };
      checkins.splice(i, 1);
      return { ok: true, value: undefined };
    },
    async checkInDates(userId, habitId) {
      return { ok: true, value: checkins.filter((c) => c.userId === userId && c.habitId === habitId).map((c) => c.date).sort() };
    },
    async allCheckInDates(userId) {
      const map = new Map<string, string[]>();
      for (const c of checkins.filter((x) => x.userId === userId)) {
        const list = map.get(c.habitId);
        if (list) list.push(c.date);
        else map.set(c.habitId, [c.date]);
      }
      return { ok: true, value: map };
    },
  };
  return Object.assign(repo, { habits, checkins });
}

let seq = 0;
function deps(repo: HabitsRepository): Deps {
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
  return new Request(`https://habits-worker${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

async function json(r: Response): Promise<any> {
  return r.json();
}

async function addHabit(d: Deps, user: string, body: Record<string, unknown>): Promise<string> {
  const r = await route(req("POST", "/v1/me/habits", { user, body }), env, d);
  return (await json(r)).data.habit.id;
}

describe("habits-worker router", () => {
  it("health needs no actor", async () => {
    expect((await route(req("GET", "/health"), env)).status).toBe(200);
  });

  it("503s without a database when no deps are injected", async () => {
    expect((await route(req("GET", "/v1/me/habits", { user: USER_A }), env)).status).toBe(503);
  });

  it("has no anonymous surface at all", async () => {
    const d = deps(fakeRepo());
    for (const path of ["/v1/me/habits", "/v1/me/today?date=2026-09-09", "/v1/me/review?weekStart=2026-09-07"]) {
      expect((await route(req("GET", path), env, d)).status).toBe(401);
    }
  });

  it("creates habits and enforces the cadence/target rule", async () => {
    const d = deps(fakeRepo());
    const daily = await route(req("POST", "/v1/me/habits", { user: USER_A, body: { name: "Read" } }), env, d);
    expect(daily.status).toBe(201);
    expect((await json(daily)).data.habit).toMatchObject({ name: "Read", cadence: "daily", targetPerWeek: null });

    // A weekly-target habit must carry a target; the others must not.
    expect((await route(req("POST", "/v1/me/habits", { user: USER_A, body: { name: "Gym", cadence: "weekly_target" } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/habits", { user: USER_A, body: { name: "Gym", cadence: "daily", targetPerWeek: 3 } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/habits", { user: USER_A, body: { name: "Gym", cadence: "weekly_target", targetPerWeek: 9 } }), env, d)).status).toBe(422);
    const gym = await route(req("POST", "/v1/me/habits", { user: USER_A, body: { name: "Gym", cadence: "weekly_target", targetPerWeek: 3, color: "#10B981" } }), env, d);
    expect(gym.status).toBe(201);
    expect((await json(gym)).data.habit).toMatchObject({ cadence: "weekly_target", targetPerWeek: 3, color: "#10b981" });
    expect((await route(req("POST", "/v1/me/habits", { user: USER_A, body: { name: "" } }), env, d)).status).toBe(422);
  });

  it("scopes every habit operation to its owner", async () => {
    const d = deps(fakeRepo());
    const id = await addHabit(d, USER_A, { name: "Read" });
    expect((await route(req("PATCH", `/v1/me/habits/${id}`, { user: USER_B, body: { name: "Hijack" } }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/habits/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("PUT", `/v1/me/habits/${id}/checkins/${WED}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/habits/${id}`, { user: USER_A }), env, d)).status).toBe(204);
  });

  it("archives and restores without losing the habit", async () => {
    const d = deps(fakeRepo());
    const id = await addHabit(d, USER_A, { name: "Read" });
    expect((await route(req("PATCH", `/v1/me/habits/${id}`, { user: USER_A, body: { archived: true } }), env, d)).status).toBe(200);
    expect((await json(await route(req("GET", "/v1/me/habits", { user: USER_A }), env, d))).data.habits).toEqual([]);
    const all = await route(req("GET", "/v1/me/habits?includeArchived=true", { user: USER_A }), env, d);
    expect((await json(all)).data.habits[0]).toMatchObject({ name: "Read", archived: true });
    await route(req("PATCH", `/v1/me/habits/${id}`, { user: USER_A, body: { archived: false } }), env, d);
    expect((await json(await route(req("GET", "/v1/me/habits", { user: USER_A }), env, d))).data.habits).toHaveLength(1);
  });

  it("switches cadence and clears the target with it", async () => {
    const d = deps(fakeRepo());
    const id = await addHabit(d, USER_A, { name: "Gym", cadence: "weekly_target", targetPerWeek: 3 });
    const back = await route(req("PATCH", `/v1/me/habits/${id}`, { user: USER_A, body: { cadence: "daily" } }), env, d);
    expect(back.status).toBe(200);
    expect((await json(back)).data.habit).toMatchObject({ cadence: "daily", targetPerWeek: null });
    // Moving to weekly_target without a target is refused.
    expect((await route(req("PATCH", `/v1/me/habits/${id}`, { user: USER_A, body: { cadence: "weekly_target" } }), env, d)).status).toBe(422);
  });

  it("reorders only on a complete permutation", async () => {
    const d = deps(fakeRepo());
    const a = await addHabit(d, USER_A, { name: "A" });
    const b = await addHabit(d, USER_A, { name: "B" });
    expect((await route(req("POST", "/v1/me/habits/reorder", { user: USER_A, body: { ids: [a] } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/habits/reorder", { user: USER_A, body: { ids: [a, a] } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/habits/reorder", { user: USER_A, body: { ids: ["nope", b] } }), env, d)).status).toBe(422);
    const ok = await route(req("POST", "/v1/me/habits/reorder", { user: USER_A, body: { ids: [b, a] } }), env, d);
    expect((await json(ok)).data.habits.map((h: any) => h.name)).toEqual(["B", "A"]);
  });

  it("checks in idempotently and undoes forgivingly", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    const id = await addHabit(d, USER_A, { name: "Read" });

    expect((await route(req("PUT", `/v1/me/habits/${id}/checkins/${WED}`, { user: USER_A }), env, d)).status).toBe(200);
    expect((await route(req("PUT", `/v1/me/habits/${id}/checkins/${WED}`, { user: USER_A, body: { note: "chapter 4" } }), env, d)).status).toBe(200);
    expect(repo.checkins).toHaveLength(1);
    expect(repo.checkins[0]!.note).toBe("chapter 4");

    // Undoing a day that was never checked in is a no-op, not an error.
    expect((await route(req("DELETE", `/v1/me/habits/${id}/checkins/2026-09-08`, { user: USER_A }), env, d)).status).toBe(204);
    expect((await route(req("DELETE", `/v1/me/habits/${id}/checkins/${WED}`, { user: USER_A }), env, d)).status).toBe(204);
    expect(repo.checkins).toHaveLength(0);

    expect((await route(req("PUT", `/v1/me/habits/${id}/checkins/not-a-date`, { user: USER_A }), env, d)).status).toBe(422);
    expect((await route(req("PUT", `/v1/me/habits/${id}/checkins/2026-02-30`, { user: USER_A }), env, d)).status).toBe(422);
  });

  it("builds the today board with streaks and a seven-day grid", async () => {
    const d = deps(fakeRepo());
    const id = await addHabit(d, USER_A, { name: "Read" });
    for (const date of ["2026-09-07", "2026-09-08", WED]) {
      await route(req("PUT", `/v1/me/habits/${id}/checkins/${date}`, { user: USER_A }), env, d);
    }
    const board = await route(req("GET", `/v1/me/today?date=${WED}`, { user: USER_A }), env, d);
    expect(board.status).toBe(200);
    const body = (await json(board)).data;
    expect(body.date).toBe(WED);
    expect(body.habits[0]).toMatchObject({ doneToday: true, currentStreak: 3, bestStreak: 3 });
    expect(body.habits[0].days).toHaveLength(7);
    expect(body.habits[0].days[6]).toEqual({ date: WED, done: true });
    expect(body.habits[0].completionRate30d).toBeGreaterThan(0);

    expect((await route(req("GET", "/v1/me/today", { user: USER_A }), env, d)).status).toBe(422);
    expect((await route(req("GET", "/v1/me/today?date=nope", { user: USER_A }), env, d)).status).toBe(422);
  });

  it("reviews a week, snapping any day to its Monday", async () => {
    const d = deps(fakeRepo());
    const gym = await addHabit(d, USER_A, { name: "Gym", cadence: "weekly_target", targetPerWeek: 2 });
    await route(req("PUT", `/v1/me/habits/${gym}/checkins/2026-09-07`, { user: USER_A }), env, d);
    await route(req("PUT", `/v1/me/habits/${gym}/checkins/2026-09-08`, { user: USER_A }), env, d);

    // Ask with a Wednesday; the answer is that week, starting Monday.
    const review = await route(req("GET", `/v1/me/review?weekStart=${WED}`, { user: USER_A }), env, d);
    expect(review.status).toBe(200);
    const body = (await json(review)).data;
    expect(body.weekStart).toBe("2026-09-07");
    expect(body.habits[0]).toMatchObject({ done: 2, target: 2, met: true });
    expect(body.totals).toEqual({ habits: 1, met: 1, checkIns: 2 });

    expect((await route(req("GET", "/v1/me/review", { user: USER_A }), env, d)).status).toBe(422);
  });

  it("unknown routes and wrong methods", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("GET", "/v1/nope", { user: USER_A }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", "/v1/me/habits", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("GET", "/v1/me/habits/reorder", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("PATCH", "/v1/me/habits/not-an-id", { user: USER_A, body: {} }), env, d)).status).toBe(404);
    expect((await route(req("POST", `/v1/me/today?date=${WED}`, { user: USER_A }), env, d)).status).toBe(405);
  });
});
