import { isMonitorsRoute, isPublicMonitorsRead, handleMonitorsRoute } from "@api-edge/monitors-facade";
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
  const monitors = fetcher({ data: { monitors: [] }, meta: { requestId: "req_inner", cursor: null } });
  return { env: { ENVIRONMENT: "test", IDENTITY_WORKER: identity.fetcher, MONITORS_WORKER: monitors.fetcher, ...overrides }, monitors, identity };
}

function headersOf(call: FetchCall): Headers {
  return call.init.headers as Headers;
}

describe("api-edge monitors facade", () => {
  it("matches the owner and status-page routes only", () => {
    expect(isMonitorsRoute("/v1/me/monitors")).toBe(true);
    expect(isMonitorsRoute("/v1/me/monitors/mon_abc")).toBe(true);
    expect(isMonitorsRoute("/v1/me/monitors/mon_abc/checks")).toBe(true);
    expect(isMonitorsRoute("/v1/me/monitors/mon_abc/check")).toBe(true);
    expect(isMonitorsRoute("/v1/me/incidents")).toBe(true);
    expect(isMonitorsRoute("/v1/me/status-page")).toBe(true);
    expect(isMonitorsRoute("/v1/status/acme")).toBe(true);
    expect(isMonitorsRoute("/v1/organizations")).toBe(false);
    expect(isMonitorsRoute("/v1/me")).toBe(false);
    expect(isMonitorsRoute("/v1/status/Acme")).toBe(false);
  });

  it("classifies only the status-page read as public", () => {
    expect(isPublicMonitorsRead("/v1/status/acme", "GET")).toBe(true);
    expect(isPublicMonitorsRead("/v1/status/acme", "PUT")).toBe(false);
    expect(isPublicMonitorsRead("/v1/me/monitors", "GET")).toBe(false);
  });

  it("forwards a status-page read with no actor headers and no identity hop", async () => {
    const e = env();
    const r = await handleMonitorsRoute(new Request("https://edge/v1/status/acme"), e.env as never, "req_1", "/v1/status/acme");
    expect(r.status).toBe(200);
    expect(e.monitors.calls[0]!.url).toBe("https://monitors.internal/v1/status/acme");
    expect(headersOf(e.monitors.calls[0]!).get("x-actor-subject-id")).toBeNull();
    expect(e.identity.calls).toHaveLength(0);
  });

  it("requires a session on owner routes and forwards the actor", async () => {
    const e = env();
    expect((await handleMonitorsRoute(new Request("https://edge/v1/me/monitors"), e.env as never, "req_1", "/v1/me/monitors")).status).toBe(401);
    expect(e.monitors.calls).toHaveLength(0);

    const ok = await handleMonitorsRoute(
      new Request("https://edge/v1/me/monitors", { headers: { authorization: "Bearer good" } }),
      e.env as never,
      "req_2",
      "/v1/me/monitors",
    );
    expect(ok.status).toBe(200);
    expect(headersOf(e.monitors.calls[0]!).get("x-actor-subject-id")).toBe("usr_abc");
  });

  it("requires a session to run a check", async () => {
    const e = env();
    const r = await handleMonitorsRoute(
      new Request("https://edge/v1/me/monitors/mon_abc/check", { method: "POST" }),
      e.env as never,
      "req_1",
      "/v1/me/monitors/mon_abc/check",
    );
    expect(r.status).toBe(401);
  });

  it("503s when the monitors binding is absent", async () => {
    const e = env({ MONITORS_WORKER: undefined });
    const r = await handleMonitorsRoute(new Request("https://edge/v1/status/acme"), e.env as never, "req_1", "/v1/status/acme");
    expect(r.status).toBe(503);
  });

  it("is dispatched by the worker entry and never Solo-suppressed", async () => {
    const e = env({ SOLO_MODE: "true" });
    expect((await worker.fetch(new Request("https://edge/v1/status/acme"), e.env as never)).status).toBe(200);
    const me = await worker.fetch(new Request("https://edge/v1/me/monitors", { headers: { authorization: "Bearer good" } }), e.env as never);
    expect(me.status).toBe(200);
    expect(e.monitors.calls).toHaveLength(2);
  });
});
