import { applyCheck, uptimePercent, avgLatency, isDue, FAILURE_THRESHOLD } from "@monitors-worker/incidents";
import { isProbeableUrl } from "@monitors-worker/probe";
import type { Check } from "@saas/db/monitors";

function check(overrides: Partial<Check> = {}): Check {
  return {
    id: "c1",
    monitorId: "m1",
    userId: "u1",
    checkedAt: new Date("2026-09-09T12:00:00Z"),
    ok: true,
    statusCode: 200,
    latencyMs: 100,
    error: null,
    ...overrides,
  };
}

describe("incident state machine", () => {
  it("treats a single failure as a blip, not an outage", () => {
    const t = applyCheck({ status: "up", consecutiveFailures: 0, incidentOpen: false }, false);
    expect(t).toEqual({ status: "up", consecutiveFailures: 1, openIncident: false, resolveIncident: false });
  });

  it("opens an incident on the second consecutive failure", () => {
    const t = applyCheck({ status: "up", consecutiveFailures: 1, incidentOpen: false }, false);
    expect(t).toEqual({ status: "down", consecutiveFailures: 2, openIncident: true, resolveIncident: false });
    expect(FAILURE_THRESHOLD).toBe(2);
  });

  it("never opens a second incident while one is already open", () => {
    const t = applyCheck({ status: "down", consecutiveFailures: 5, incidentOpen: true }, false);
    expect(t).toMatchObject({ status: "down", consecutiveFailures: 6, openIncident: false });
  });

  it("resolves immediately on the first success", () => {
    const t = applyCheck({ status: "down", consecutiveFailures: 4, incidentOpen: true }, true);
    expect(t).toEqual({ status: "up", consecutiveFailures: 0, openIncident: false, resolveIncident: true });
  });

  it("does not resolve what was never open", () => {
    const t = applyCheck({ status: "up", consecutiveFailures: 0, incidentOpen: false }, true);
    expect(t.resolveIncident).toBe(false);
  });

  it("moves a never-checked monitor to up on its first success", () => {
    const t = applyCheck({ status: "unknown", consecutiveFailures: 0, incidentOpen: false }, true);
    expect(t.status).toBe("up");
  });

  it("keeps a never-checked monitor unknown after one failure", () => {
    const t = applyCheck({ status: "unknown", consecutiveFailures: 0, incidentOpen: false }, false);
    expect(t.status).toBe("unknown");
    expect(applyCheck({ status: "unknown", consecutiveFailures: 1, incidentOpen: false }, false).status).toBe("down");
  });
});

describe("uptime and latency", () => {
  const from = new Date("2026-09-09T00:00:00Z");
  const to = new Date("2026-09-09T23:59:59Z");

  it("is null with nothing measured", () => {
    expect(uptimePercent([], from, to)).toBeNull();
    expect(avgLatency([])).toBeNull();
  });

  it("counts successes over checks in the window, to one decimal", () => {
    const checks = [
      check({ checkedAt: new Date("2026-09-09T01:00:00Z"), ok: true }),
      check({ checkedAt: new Date("2026-09-09T02:00:00Z"), ok: true }),
      check({ checkedAt: new Date("2026-09-09T03:00:00Z"), ok: false }),
    ];
    expect(uptimePercent(checks, from, to)).toBe(66.7);
  });

  it("ignores checks outside the window", () => {
    const checks = [
      check({ checkedAt: new Date("2026-09-08T01:00:00Z"), ok: false }),
      check({ checkedAt: new Date("2026-09-09T01:00:00Z"), ok: true }),
    ];
    expect(uptimePercent(checks, from, to)).toBe(100);
  });

  it("averages only successful, timed checks", () => {
    const checks = [
      check({ ok: true, latencyMs: 100 }),
      check({ ok: true, latencyMs: 300 }),
      check({ ok: false, latencyMs: 9000 }),
      check({ ok: true, latencyMs: null }),
    ];
    expect(avgLatency(checks)).toBe(200);
  });
});

describe("scheduling", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  it("checks a monitor that has never been checked", () => {
    expect(isDue(null, 300, now)).toBe(true);
  });

  it("waits out the interval", () => {
    expect(isDue(new Date("2026-09-09T11:59:00Z"), 300, now)).toBe(false);
    expect(isDue(new Date("2026-09-09T11:55:00Z"), 300, now)).toBe(true);
    expect(isDue(new Date("2026-09-09T11:59:00Z"), 60, now)).toBe(true);
  });
});

describe("probeable URLs", () => {
  it("accepts public http(s) endpoints", () => {
    expect(isProbeableUrl("https://api.example.com/health")).toBe(true);
    expect(isProbeableUrl("http://example.com")).toBe(true);
    expect(isProbeableUrl("https://8.8.8.8/")).toBe(true);
  });

  it("refuses what our own infrastructure should not fetch", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.4.4/",
      "http://169.254.169.254/latest/meta-data/",
      "http://0.0.0.0/",
      "http://service.internal/",
      "http://box.local/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(isProbeableUrl(url)).toBe(false);
    }
  });

  it("allows a public address in a range that merely looks private", () => {
    expect(isProbeableUrl("http://172.32.0.1/")).toBe(true);
    expect(isProbeableUrl("http://11.0.0.1/")).toBe(true);
  });
});
