import { harness, bodyOf } from "./harness";
import { tokenBucketStep, LIMITS } from "@site-api/rate-limit";

describe("site-api: edge behaviour", () => {
  it("rate-limits subscribe per visitor through KV and fails open when KV is down", async () => {
    const h = harness();
    for (let i = 0; i < LIMITS.subscribe.limit; i++) {
      const res = await h.call("POST", "/v1/subscribers", { body: { email: `s${i}@example.com` } });
      expect(res.status).toBe(202);
      expect(res.headers.get("x-ratelimit-remaining")).toBe(String(LIMITS.subscribe.limit - 1 - i));
    }
    const denied = await h.call("POST", "/v1/subscribers", { body: { email: "late@example.com" } });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await bodyOf<{ error: { code: string } }>(denied)).error.code).toBe("rate_limited");
    // Another visitor is unaffected.
    expect((await h.call("POST", "/v1/subscribers", { body: { email: "other@example.com" }, ip: "198.51.100.1" })).status).toBe(202);
    // KV outage: admitted, no limit headers.
    h.kv.fail = true;
    const open = await h.call("POST", "/v1/subscribers", { body: { email: "open@example.com" } });
    expect(open.status).toBe(202);
    expect(open.headers.get("x-ratelimit-limit")).toBeNull();
  });

  it("token bucket math refills over time", () => {
    const limits = { limit: 2, windowSec: 10 };
    const a = tokenBucketStep(null, limits, 0);
    const b = tokenBucketStep(a.next, limits, 0);
    const c = tokenBucketStep(b.next, limits, 0);
    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, false]);
    expect(c.retryAfterSec).toBe(5);
    const d = tokenBucketStep(c.next, limits, 5);
    expect(d.allowed).toBe(true);
  });

  it("answers CORS preflight only for the site's origins, and reflects them on responses", async () => {
    const h = harness();
    const ok = await h.call("OPTIONS", "/v1/subscribers", { headers: { origin: "https://site.test" } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://site.test");
    expect(ok.headers.get("access-control-allow-methods")).toContain("POST");
    const nope = await h.call("OPTIONS", "/v1/subscribers", { headers: { origin: "https://evil.test" } });
    expect(nope.headers.get("access-control-allow-origin")).toBeNull();
    const res = await h.call("GET", "/health", { headers: { origin: "https://site.test" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://site.test");
    const local = harness({ ENVIRONMENT: "prod" });
    const prodLocal = await local.call("GET", "/health", { headers: { origin: "http://localhost:3000" } });
    expect(prodLocal.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("404s unknown routes, 405s wrong methods, and reports degraded health without a database", async () => {
    const h = harness();
    expect((await h.call("GET", "/v1/nothing")).status).toBe(404);
    expect((await h.call("PUT", "/v1/subscribers")).status).toBe(405);
    const nodb = harness({ SITE_DB: undefined });
    const health = await nodb.call("GET", "/health");
    expect(health.status).toBe(503);
    expect(await bodyOf(health)).toMatchObject({ status: "degraded" });
  });
});
