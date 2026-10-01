import { isSubscriptionsRoute, handleSubscriptionsRoute } from "@api-edge/subscriptions-facade";
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
  const subs = fetcher({ data: { subscriptions: [] }, meta: { requestId: "req_inner", cursor: null } });
  return { env: { ENVIRONMENT: "test", IDENTITY_WORKER: identity.fetcher, SUBSCRIPTIONS_WORKER: subs.fetcher, ...overrides }, subs, identity };
}

function headersOf(call: FetchCall): Headers {
  return call.init.headers as Headers;
}

describe("api-edge subscriptions facade", () => {
  it("matches the owner routes only", () => {
    expect(isSubscriptionsRoute("/v1/me/subscriptions")).toBe(true);
    expect(isSubscriptionsRoute("/v1/me/subscriptions/sub_abc")).toBe(true);
    expect(isSubscriptionsRoute("/v1/me/subscriptions/summary")).toBe(true);
    expect(isSubscriptionsRoute("/v1/me/subscriptions/upcoming")).toBe(true);
    expect(isSubscriptionsRoute("/v1/organizations")).toBe(false);
    expect(isSubscriptionsRoute("/v1/me")).toBe(false);
    expect(isSubscriptionsRoute("/v1/subscriptions")).toBe(false);
    // The billing context owns its own subscription routes; they are not ours.
    expect(isSubscriptionsRoute("/v1/organizations/org_a/billing/subscription")).toBe(false);
  });

  it("demands a session on every route — the tracker is private", async () => {
    const e = env();
    for (const path of ["/v1/me/subscriptions", "/v1/me/subscriptions/summary", "/v1/me/subscriptions/upcoming"]) {
      expect((await handleSubscriptionsRoute(new Request(`https://edge${path}`), e.env as never, "req_1", path)).status).toBe(401);
    }
    expect(e.subs.calls).toHaveLength(0);
  });

  it("forwards the actor downstream with the query string intact", async () => {
    const e = env();
    const r = await handleSubscriptionsRoute(
      new Request("https://edge/v1/me/subscriptions/upcoming?days=30", { headers: { authorization: "Bearer good" } }),
      e.env as never,
      "req_1",
      "/v1/me/subscriptions/upcoming",
    );
    expect(r.status).toBe(200);
    expect(e.subs.calls[0]!.url).toBe("https://subscriptions.internal/v1/me/subscriptions/upcoming?days=30");
    expect(headersOf(e.subs.calls[0]!).get("x-actor-subject-id")).toBe("usr_abc");
  });

  it("rejects a bad token", async () => {
    const e = env();
    const r = await handleSubscriptionsRoute(
      new Request("https://edge/v1/me/subscriptions", { headers: { authorization: "Bearer bad" } }),
      e.env as never,
      "req_1",
      "/v1/me/subscriptions",
    );
    expect(r.status).toBe(401);
  });

  it("503s when a binding is absent", async () => {
    const noWorker = env({ SUBSCRIPTIONS_WORKER: undefined });
    expect(
      (await handleSubscriptionsRoute(new Request("https://edge/v1/me/subscriptions", { headers: { authorization: "Bearer good" } }), noWorker.env as never, "req_1", "/v1/me/subscriptions")).status,
    ).toBe(503);
  });

  it("is dispatched by the worker entry and never Solo-suppressed", async () => {
    const e = env({ SOLO_MODE: "true" });
    const r = await worker.fetch(new Request("https://edge/v1/me/subscriptions", { headers: { authorization: "Bearer good" } }), e.env as never);
    expect(r.status).toBe(200);
    expect(e.subs.calls).toHaveLength(1);
  });
});
