import { isPagesRoute, isPublicPagesRoute, handlePagesRoute } from "@api-edge/pages-facade";
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
  const pages = fetcher({ data: { page: null }, meta: { requestId: "req_inner", cursor: null } });
  return { env: { ENVIRONMENT: "test", IDENTITY_WORKER: identity.fetcher, PAGES_WORKER: pages.fetcher, ...overrides }, pages, identity };
}

function headersOf(call: FetchCall): Headers {
  return call.init.headers as Headers;
}

describe("api-edge pages facade", () => {
  it("matches the owner and public routes only", () => {
    expect(isPagesRoute("/v1/me/page")).toBe(true);
    expect(isPagesRoute("/v1/me/page/blocks")).toBe(true);
    expect(isPagesRoute("/v1/me/page/blocks/blk_abc")).toBe(true);
    expect(isPagesRoute("/v1/me/page/blocks/reorder")).toBe(true);
    expect(isPagesRoute("/v1/me/page/analytics")).toBe(true);
    expect(isPagesRoute("/v1/p/jane")).toBe(true);
    expect(isPagesRoute("/v1/p/jane/blocks/blk_abc/click")).toBe(true);
    expect(isPagesRoute("/v1/organizations")).toBe(false);
    expect(isPagesRoute("/v1/me")).toBe(false);
    expect(isPagesRoute("/v1/p/Jane")).toBe(false);
  });

  it("classifies visitor traffic as public — the read and the click", () => {
    expect(isPublicPagesRoute("/v1/p/jane")).toBe(true);
    expect(isPublicPagesRoute("/v1/p/jane/blocks/blk_abc/click")).toBe(true);
    expect(isPublicPagesRoute("/v1/me/page")).toBe(false);
  });

  it("forwards a public page read with no actor headers and no identity hop", async () => {
    const e = env();
    const r = await handlePagesRoute(new Request("https://edge/v1/p/jane"), e.env as never, "req_1", "/v1/p/jane");
    expect(r.status).toBe(200);
    expect(e.pages.calls[0]!.url).toBe("https://pages.internal/v1/p/jane");
    expect(headersOf(e.pages.calls[0]!).get("x-actor-subject-id")).toBeNull();
    expect(e.identity.calls).toHaveLength(0);
  });

  it("forwards an anonymous click without demanding a session", async () => {
    const e = env();
    const r = await handlePagesRoute(
      new Request("https://edge/v1/p/jane/blocks/blk_abc/click", { method: "POST", body: "{}" }),
      e.env as never,
      "req_1",
      "/v1/p/jane/blocks/blk_abc/click",
    );
    expect(r.status).toBe(200);
    expect(e.pages.calls).toHaveLength(1);
    expect(e.identity.calls).toHaveLength(0);
  });

  it("requires a session on owner routes and forwards the actor", async () => {
    const e = env();
    expect((await handlePagesRoute(new Request("https://edge/v1/me/page"), e.env as never, "req_1", "/v1/me/page")).status).toBe(401);
    expect(e.pages.calls).toHaveLength(0);

    const ok = await handlePagesRoute(
      new Request("https://edge/v1/me/page", { headers: { authorization: "Bearer good" } }),
      e.env as never,
      "req_2",
      "/v1/me/page",
    );
    expect(ok.status).toBe(200);
    expect(headersOf(e.pages.calls[0]!).get("x-actor-subject-id")).toBe("usr_abc");
    expect(headersOf(e.pages.calls[0]!).get("x-actor-subject-type")).toBe("user");
  });

  it("rejects an owner route with a bad token", async () => {
    const e = env();
    const r = await handlePagesRoute(
      new Request("https://edge/v1/me/page", { headers: { authorization: "Bearer bad" } }),
      e.env as never,
      "req_1",
      "/v1/me/page",
    );
    expect(r.status).toBe(401);
  });

  it("503s when the pages binding is absent", async () => {
    const e = env({ PAGES_WORKER: undefined });
    const r = await handlePagesRoute(new Request("https://edge/v1/p/jane"), e.env as never, "req_1", "/v1/p/jane");
    expect(r.status).toBe(503);
  });

  it("is dispatched by the worker entry and never Solo-suppressed", async () => {
    const e = env({ SOLO_MODE: "true" });
    expect((await worker.fetch(new Request("https://edge/v1/p/jane"), e.env as never)).status).toBe(200);
    const me = await worker.fetch(new Request("https://edge/v1/me/page", { headers: { authorization: "Bearer good" } }), e.env as never);
    expect(me.status).toBe(200);
    expect(e.pages.calls).toHaveLength(2);
  });
});
