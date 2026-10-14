import {
  statusTone,
  statusLabel,
  overallStatus,
  formatUptime,
  formatLatency,
  intervalLabel,
  formatDuration,
  relativeTime,
  handleValid,
  emptyMonitorForm,
  validateMonitorForm,
  INTERVALS,
  METHODS,
} from "@web-console-next/components/monitors/model";
import { landingDestination, statusPagePath, PRODUCT_HOME, PRODUCT_NAV, PRODUCT_TABS } from "@web-console-next/lib/product";
import { buildNavSections, isLinkActive } from "@web-console-next/components/shell/nav-items";

describe("monitors view model", () => {
  it("tones and labels a status", () => {
    expect(statusTone("up")).toBe("success");
    expect(statusTone("down")).toBe("destructive");
    expect(statusTone("unknown")).toBe("secondary");
    expect(statusLabel("unknown")).toBe("Not checked yet");
  });

  it("summarizes a whole page in one line", () => {
    expect(overallStatus([])).toMatchObject({ tone: "secondary" });
    expect(overallStatus(["up", "up"])).toMatchObject({ label: "All systems operational", tone: "success" });
    expect(overallStatus(["up", "down"])).toMatchObject({ label: "1 monitor is down", tone: "destructive" });
    expect(overallStatus(["down", "down"]).label).toBe("2 monitors are down");
    // A monitor that has never been checked is not an outage.
    expect(overallStatus(["up", "unknown"]).tone).toBe("success");
  });

  it("formats uptime and latency, with a dash for no data", () => {
    expect(formatUptime(null)).toBe("—");
    expect(formatUptime(99.95)).toBe("100.0%");
    expect(formatUptime(66.7)).toBe("66.7%");
    expect(formatLatency(null)).toBe("—");
    expect(formatLatency(120)).toBe("120 ms");
    expect(formatLatency(2500)).toBe("2.50 s");
  });

  it("labels the fixed intervals", () => {
    expect(intervalLabel(60)).toBe("Every minute");
    expect(intervalLabel(3600)).toBe("Every hour");
    expect(intervalLabel(42)).toBe("Every 42s");
    expect(METHODS).toEqual(["GET", "HEAD"]);
    expect(INTERVALS.map((i) => i.value)).toEqual([60, 300, 900, 1800, 3600]);
  });

  it("measures an incident, open or closed", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    expect(formatDuration("2026-09-09T11:59:30Z", null, now)).toBe("30s");
    expect(formatDuration("2026-09-09T11:30:00Z", null, now)).toBe("30m");
    expect(formatDuration("2026-09-09T09:30:00Z", null, now)).toBe("2h 30m");
    expect(formatDuration("2026-09-07T09:00:00Z", null, now)).toBe("2d 3h");
    expect(formatDuration("2026-09-09T11:00:00Z", "2026-09-09T11:45:00Z", now)).toBe("45m");
    expect(formatDuration("nonsense", null, now)).toBe("—");
  });

  it("says when a monitor was last checked", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime("2026-09-09T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-09T11:30:00Z", now)).toBe("30m ago");
    expect(relativeTime("2026-09-08T12:00:00Z", now)).toBe("1d ago");
  });

  it("mirrors the worker's handle rule", () => {
    expect(handleValid("acme")).toBe(true);
    expect(handleValid("ac")).toBe(false);
    expect(handleValid("status")).toBe(false);
  });

  it("validates the monitor form, refusing what cannot be probed", () => {
    const base = { ...emptyMonitorForm(), name: "API", url: "https://api.example.com/health" };
    expect(validateMonitorForm(base)).toEqual({});
    expect(validateMonitorForm({ ...base, url: "http://localhost:3000" }).url).toBeDefined();
    expect(validateMonitorForm({ ...base, url: "nope" }).url).toBeDefined();
    expect(validateMonitorForm({ ...base, intervalSec: "42" }).intervalSec).toBeDefined();
    expect(validateMonitorForm({ ...base, expectedStatus: "900" }).expectedStatus).toBeDefined();
    expect(validateMonitorForm({ ...base, name: "" }).name).toBeDefined();
  });
});

describe("product surface registration", () => {
  it("lands on the product under Solo, passes through otherwise", () => {
    expect(landingDestination("/orgs/acme/settings", true)).toBe(PRODUCT_HOME);
    expect(landingDestination("/onboarding", true)).toBe("/onboarding");
    expect(landingDestination("/orgs/acme/projects", false)).toBe("/orgs/acme/projects");
  });

  it("builds the public status path", () => {
    expect(statusPagePath("acme")).toBe("/status/acme");
  });

  it("contributes a product nav section under Solo only", () => {
    const solo = buildNavSections({ orgSlug: "acme" }, true);
    expect(solo[0]!.id).toBe("product");
    expect(solo[0]!.links.map((l) => l.href)).toEqual(PRODUCT_NAV.map((l) => l.href));
    expect(buildNavSections({ orgSlug: "acme" }, false).map((s) => s.id)).not.toContain("product");
    expect(PRODUCT_TABS.length).toBeLessThanOrEqual(4);
  });

  it("keeps the monitor list highlighted on its detail routes", () => {
    expect(isLinkActive("/monitors", "/monitors")).toBe(true);
    expect(isLinkActive("/monitors", "/monitors/mon_abc")).toBe(true);
    expect(isLinkActive("/incidents", "/monitors")).toBe(false);
  });
});
