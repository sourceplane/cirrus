import { previewSlug, parseTagInput, statusLabel, displayHost, relativeTime, validateProductForm, isRange } from "@web-console-next/components/launches/model";
import { landingDestination, PRODUCT_HOME, PRODUCT_NAV, PRODUCT_TABS } from "@web-console-next/lib/product";
import { buildNavSections, isLinkActive } from "@web-console-next/components/shell/nav-items";

describe("launches view model", () => {
  it("previews the slug the worker will derive", () => {
    expect(previewSlug("Acme Notes v2!")).toBe("acme-notes-v2");
  });
  it("parses tag input (dedupe, cap 5)", () => {
    expect(parseTagInput("AI, ai, Dev Tools")).toEqual(["ai", "dev-tools"]);
    expect(parseTagInput("a,b,c,d,e,f")).toHaveLength(5);
  });
  it("labels statuses", () => {
    expect(statusLabel("live")).toEqual({ label: "Live", tone: "success" });
    expect(statusLabel("draft").label).toBe("Draft");
    expect(statusLabel("archived").tone).toBe("secondary");
  });
  it("shows a bare host", () => {
    expect(displayHost("https://www.acme.dev/path?x=1")).toBe("acme.dev");
    expect(displayHost("not a url")).toBe("not a url");
  });
  it("formats relative time", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    expect(relativeTime(null, now)).toBe("—");
    expect(relativeTime("2026-09-09T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-09T11:30:00Z", now)).toBe("30m ago");
    expect(relativeTime("2026-09-09T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-07T09:00:00Z", now)).toBe("2d ago");
  });
  it("validates the product form", () => {
    expect(validateProductForm({ name: "Acme", tagline: "Notes that sync", url: "https://acme.dev", description: "", tags: "" })).toEqual({});
    const e = validateProductForm({ name: "A", tagline: "x", url: "acme", description: "", tags: "" });
    expect(Object.keys(e).sort()).toEqual(["name", "tagline", "url"]);
  });
  it("recognises feed ranges", () => {
    expect(isRange("today")).toBe(true);
    expect(isRange("yesterday")).toBe(false);
  });
});

describe("product surface registration", () => {
  it("lands on the product under Solo, passes through otherwise", () => {
    expect(landingDestination("/orgs/acme/settings", true)).toBe(PRODUCT_HOME);
    expect(landingDestination("/onboarding", true)).toBe("/onboarding");
    expect(landingDestination("/orgs/acme/projects", false)).toBe("/orgs/acme/projects");
  });
  it("contributes a product nav section under Solo only", () => {
    const solo = buildNavSections({ orgSlug: "acme" }, true);
    expect(solo[0]!.id).toBe("product");
    expect(solo[0]!.links.map((l) => l.href)).toEqual(PRODUCT_NAV.map((l) => l.href));
    expect(buildNavSections({ orgSlug: "acme" }, false).map((s) => s.id)).not.toContain("product");
    expect(PRODUCT_TABS.length).toBeLessThanOrEqual(4);
  });
  it("keeps /launches and /launches/new from highlighting together", () => {
    expect(isLinkActive("/launches", "/launches")).toBe(true);
    expect(isLinkActive("/launches", "/launches/lp_abc")).toBe(true);
    expect(isLinkActive("/launches", "/launches/new")).toBe(false);
    expect(isLinkActive("/launches/new", "/launches/new")).toBe(true);
  });
});
