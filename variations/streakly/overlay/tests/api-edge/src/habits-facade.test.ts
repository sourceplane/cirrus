import { isHabitsRoute, handleHabitsRoute } from "@api-edge/habits-facade";
import worker from "@api-edge/index";

interface FetchCall { url: string; init: RequestInit }

function fetcher(body: unknown = { data: {}, meta: { requestId: "req_inner", cursor: null } }): { fetcher: Fetcher; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const f = {
    fetch(input: string | Request | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: init ?? {} });
      if (url.includes("/v1/auth/resolve")) {
        const auth = (init?.headers as Headers | undefined)?.get?.("authorization") ?? "";
        if (auth.includes("bad")) return Promise.resolve(new Response("nope", { status: 401 }));
        return Promise.resolve(
          Response.json({
            data: { actor: { actorType: "user", actorId: "usr_abc", email: "u@t.com" }, user: { id: "usr_abc", email: "u@t.com" } },
            meta: { requestId: "req_inner", cursor: null },
          }),
        );
      }
      return Promise.resolve(Response.json(body));
    },
    connect() { throw new Error("not implemented"); },
  } as unknown as Fetcher;
  return { fetcher: f, calls };
}

function env(overrides: Record<string, unknown> = {}) {
  const identity = fetcher();
  const habits = fetcher({ data: { habits: [] }, meta: { requestId: "req_inner", cursor: null } });
  return { env: { ENVIRONMENT: "test", IDENTITY_WORKER: identity.fetcher, HABITS_WORKER: habits.fetcher, ...overrides }, habits, identity };
}

function headersOf(call: FetchCall): Headers {
  return call.init.headers as Headers;
}

describe("api-edge habits facade", () => {
  it("matches the owner routes only", () => {
    expect(isHabitsRoute("/v1/me/habits")).toBe(true);
    expect(isHabitsRoute("/v1/me/habits/hab_abc")).toBe(true);
    expect(isHabitsRoute("/v1/me/habits/reorder")).toBe(true);
    expect(isHabitsRoute("/v1/me/habits/hab_abc/checkins/2026-09-09")).toBe(true);
    expect(isHabitsRoute("/v1/me/today")).toBe(true);
    expect(isHabitsRoute("/v1/me/review")).toBe(true);
    expect(isHabitsRoute("/v1/organizations")).toBe(false);
    expect(isHabitsRoute("/v1/me")).toBe(false);
    expect(isHabitsRoute("/v1/habits")).toBe(false);
  });

  it("demands a session on every route — the tracker is private", async () => {
    const e = env();
    for (const path of ["/v1/me/habits", "/v1/me/today", "/v1/me/review"]) {
      const r = await handleHabitsRoute(new Request(`https://edge${path}`), e.env as never, "req_1", path);
      expect(r.status).toBe(401);
    }
    expect(e.habits.calls).toHaveLength(0);
  });

  it("forwards the actor downstream, with the query string intact", async () => {
    const e = env();
    const r = await handleHabitsRoute(
      new Request("https://edge/v1/me/today?date=2026-09-09", { headers: { authorization: "Bearer good" } }),
      e.env as never,
      "req_1",
      "/v1/me/today",
    );
    expect(r.status).toBe(200);
    expect(e.habits.calls[0]!.url).toBe("https://habits.internal/v1/me/today?date=2026-09-09");
    expect(headersOf(e.habits.calls[0]!).get("x-actor-subject-id")).toBe("usr_abc");
    expect(headersOf(e.habits.calls[0]!).get("x-actor-subject-type")).toBe("user");
  });

  it("rejects a bad token", async () => {
    const e = env();
    const r = await handleHabitsRoute(
      new Request("https://edge/v1/me/habits", { headers: { authorization: "Bearer bad" } }),
      e.env as never,
      "req_1",
      "/v1/me/habits",
    );
    expect(r.status).toBe(401);
  });

  it("503s when a binding is absent", async () => {
    const noWorker = env({ HABITS_WORKER: undefined });
    expect(
      (await handleHabitsRoute(new Request("https://edge/v1/me/habits", { headers: { authorization: "Bearer good" } }), noWorker.env as never, "req_1", "/v1/me/habits")).status,
    ).toBe(503);
    const noIdentity = env({ IDENTITY_WORKER: undefined });
    expect(
      (await handleHabitsRoute(new Request("https://edge/v1/me/habits", { headers: { authorization: "Bearer good" } }), noIdentity.env as never, "req_1", "/v1/me/habits")).status,
    ).toBe(503);
  });

  it("is dispatched by the worker entry and never Solo-suppressed", async () => {
    const e = env({ SOLO_MODE: "true" });
    const r = await worker.fetch(new Request("https://edge/v1/me/habits", { headers: { authorization: "Bearer good" } }), e.env as never);
    expect(r.status).toBe(200);
    expect(e.habits.calls).toHaveLength(1);
  });
});
