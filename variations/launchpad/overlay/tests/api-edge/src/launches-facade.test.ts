import { isLaunchesRoute, isPublicLaunchesRead, handleLaunchesRoute } from "@api-edge/launches-facade";
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
        return Promise.resolve(Response.json({ data: { actor: { actorType: "user", actorId: "usr_abc", email: "u@t.com" }, user: { id: "usr_abc", email: "u@t.com" } }, meta: { requestId: "req_inner", cursor: null } }));
      }
      return Promise.resolve(Response.json(body));
    },
    connect() { throw new Error("not implemented"); },
  } as unknown as Fetcher;
  return { fetcher: f, calls };
}

function env(overrides: Record<string, unknown> = {}) {
  const identity = fetcher();
  const launches = fetcher({ data: { products: [] }, meta: { requestId: "req_inner", cursor: null } });
  return { env: { ENVIRONMENT: "test", IDENTITY_WORKER: identity.fetcher, LAUNCHES_WORKER: launches.fetcher, ...overrides }, launches, identity };
}

function headersOf(call: FetchCall): Headers { return call.init.headers as Headers; }

describe("api-edge launches facade", () => {
  it("matches the owner and directory routes only", () => {
    expect(isLaunchesRoute("/v1/me/products")).toBe(true);
    expect(isLaunchesRoute("/v1/me/products/lp_abc")).toBe(true);
    expect(isLaunchesRoute("/v1/me/products/lp_abc/launch")).toBe(true);
    expect(isLaunchesRoute("/v1/me/profile")).toBe(true);
    expect(isLaunchesRoute("/v1/launches")).toBe(true);
    expect(isLaunchesRoute("/v1/launches/acme-notes")).toBe(true);
    expect(isLaunchesRoute("/v1/launches/acme-notes/comments")).toBe(true);
    expect(isLaunchesRoute("/v1/launches/acme-notes/upvote")).toBe(true);
    expect(isLaunchesRoute("/v1/makers/jane_doe")).toBe(true);
    expect(isLaunchesRoute("/v1/organizations")).toBe(false);
    expect(isLaunchesRoute("/v1/me")).toBe(false);
    expect(isLaunchesRoute("/v1/launches/Acme")).toBe(false);
  });

  it("classifies public reads", () => {
    expect(isPublicLaunchesRead("/v1/launches", "GET")).toBe(true);
    expect(isPublicLaunchesRead("/v1/makers/x", "GET")).toBe(true);
    expect(isPublicLaunchesRead("/v1/launches/x/upvote", "PUT")).toBe(false);
    expect(isPublicLaunchesRead("/v1/me/products", "GET")).toBe(false);
  });

  it("forwards anonymous directory reads without actor headers", async () => {
    const e = env();
    const r = await handleLaunchesRoute(new Request("https://edge/v1/launches?range=week"), e.env as never, "req_1", "/v1/launches");
    expect(r.status).toBe(200);
    expect(e.launches.calls).toHaveLength(1);
    expect(e.launches.calls[0]!.url).toBe("https://launches.internal/v1/launches?range=week");
    expect(headersOf(e.launches.calls[0]!).get("x-actor-subject-id")).toBeNull();
    expect(e.identity.calls).toHaveLength(0);
  });

  it("tags the viewer on public reads when a valid token is present, ignores a bad one", async () => {
    const e = env();
    await handleLaunchesRoute(new Request("https://edge/v1/launches", { headers: { authorization: "Bearer good" } }), e.env as never, "req_1", "/v1/launches");
    expect(headersOf(e.launches.calls[0]!).get("x-actor-subject-id")).toBe("usr_abc");
    const r = await handleLaunchesRoute(new Request("https://edge/v1/launches", { headers: { authorization: "Bearer bad" } }), e.env as never, "req_2", "/v1/launches");
    expect(r.status).toBe(200);
    expect(headersOf(e.launches.calls[1]!).get("x-actor-subject-id")).toBeNull();
  });

  it("requires a session on owner routes and forwards the actor", async () => {
    const e = env();
    const anon = await handleLaunchesRoute(new Request("https://edge/v1/me/products"), e.env as never, "req_1", "/v1/me/products");
    expect(anon.status).toBe(401);
    expect(e.launches.calls).toHaveLength(0);
    const ok = await handleLaunchesRoute(new Request("https://edge/v1/me/products", { headers: { authorization: "Bearer good" } }), e.env as never, "req_2", "/v1/me/products");
    expect(ok.status).toBe(200);
    expect(headersOf(e.launches.calls[0]!).get("x-actor-subject-id")).toBe("usr_abc");
    expect(headersOf(e.launches.calls[0]!).get("x-actor-subject-type")).toBe("user");
  });

  it("requires a session on directory writes", async () => {
    const e = env();
    const r = await handleLaunchesRoute(new Request("https://edge/v1/launches/x/upvote", { method: "PUT" }), e.env as never, "req_1", "/v1/launches/x/upvote");
    expect(r.status).toBe(401);
  });

  it("503s when the launches binding is absent", async () => {
    const e = env({ LAUNCHES_WORKER: undefined });
    const r = await handleLaunchesRoute(new Request("https://edge/v1/launches"), e.env as never, "req_1", "/v1/launches");
    expect(r.status).toBe(503);
  });

  it("is dispatched by the worker entry and never Solo-suppressed", async () => {
    const e = env({ SOLO_MODE: "true" });
    const r = await worker.fetch(new Request("https://edge/v1/launches"), e.env as never);
    expect(r.status).toBe(200);
    expect(e.launches.calls).toHaveLength(1);
    const me = await worker.fetch(new Request("https://edge/v1/me/profile", { headers: { authorization: "Bearer good" } }), e.env as never);
    expect(me.status).toBe(200);
  });
});
