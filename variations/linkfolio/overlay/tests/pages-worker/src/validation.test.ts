import { handleValid, validatePage, validateBlock, normalizeReferrer, isHttpUrl } from "@pages-worker/validation";
import { summarizeClicks, windowStart, dayKeys, dayKey } from "@pages-worker/analytics";
import type { Block, ClickRow } from "@saas/db/pages";

describe("handle rules", () => {
  it("accepts a normal handle and rejects reserved or malformed ones", () => {
    expect(handleValid("jane")).toBe(true);
    expect(handleValid("Jane_Doe")).toBe(true);
    expect(handleValid("jo")).toBe(false);
    expect(handleValid("me")).toBe(false);
    expect(handleValid("p")).toBe(false);
    expect(handleValid("has space")).toBe(false);
    expect(handleValid("-leading")).toBe(false);
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) only", () => {
    expect(isHttpUrl("https://acme.dev")).toBe(true);
    expect(isHttpUrl("http://acme.dev")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("ftp://acme.dev")).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});

describe("validatePage", () => {
  it("normalizes the handle and defaults published to false", () => {
    const r = validatePage({ handle: "  Jane  ", title: "Jane Doe" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ handle: "jane", title: "Jane Doe", published: false, bio: null });
  });
  it("validates the theme", () => {
    const ok = validatePage({ handle: "jane", title: "Jane", theme: { accent: "#AABBCC", layout: "grid" } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.theme).toEqual({ accent: "#aabbcc", layout: "grid" });
    const bad = validatePage({ handle: "jane", title: "Jane", theme: { accent: "red", layout: "spiral" } });
    expect(bad.ok).toBe(false);
  });
  it("collects field errors", () => {
    const r = validatePage({ handle: "me", title: "", bio: "x".repeat(281) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["bio", "handle", "title"]);
  });
});

describe("validateBlock", () => {
  it("requires a URL for everything a visitor can click", () => {
    expect(validateBlock({ kind: "link", title: "Site" }, false).ok).toBe(false);
    expect(validateBlock({ kind: "header", title: "Section" }, false).ok).toBe(true);
    const ok = validateBlock({ kind: "link", title: "Site", url: "https://acme.dev" }, false);
    expect(ok.ok).toBe(true);
  });
  it("defaults a priced block's currency on create", () => {
    const r = validateBlock({ kind: "product", title: "Guide", url: "https://acme.dev", priceCents: 1299 }, false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.currency).toBe("USD");
  });
  it("refuses to change a block's kind on patch", () => {
    const r = validateBlock({ kind: "tip" }, true, "link");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields.kind).toBeDefined();
  });
  it("uses the existing kind to decide whether a cleared URL is allowed", () => {
    expect(validateBlock({ url: null }, true, "link").ok).toBe(false);
    expect(validateBlock({ url: null }, true, "header").ok).toBe(true);
  });
  it("rejects bad prices and currencies", () => {
    expect(validateBlock({ priceCents: 12.5 }, true, "product").ok).toBe(false);
    expect(validateBlock({ priceCents: -1 }, true, "product").ok).toBe(false);
    expect(validateBlock({ currency: "dollars" }, true, "product").ok).toBe(false);
    expect(validateBlock({ currency: "EUR" }, true, "product").ok).toBe(true);
  });
});

describe("normalizeReferrer", () => {
  it("bounds visitor-supplied text and drops empties", () => {
    expect(normalizeReferrer("  https://x.com  ")).toBe("https://x.com");
    expect(normalizeReferrer("   ")).toBeNull();
    expect(normalizeReferrer(undefined)).toBeNull();
    expect(normalizeReferrer("a".repeat(1000))!.length).toBe(512);
  });
});

describe("click analytics", () => {
  const now = new Date("2026-09-09T15:30:00.000Z");

  it("windows from midnight UTC, inclusive of today", () => {
    expect(windowStart(1, now).toISOString()).toBe("2026-09-09T00:00:00.000Z");
    expect(windowStart(7, now).toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(dayKey(now)).toBe("2026-09-09");
  });

  it("lists every day in the window, oldest first", () => {
    expect(dayKeys(3, now)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });

  function block(id: string, title: string): Block {
    return {
      id, userId: "u1", kind: "link", title, url: "https://x.dev", description: null,
      priceCents: null, currency: null, position: 0, enabled: true,
      createdAt: now, updatedAt: now,
    };
  }

  it("counts per block and per day, keeping zero rows", () => {
    const clicks: ClickRow[] = [
      { blockId: "b1", occurredAt: new Date("2026-09-09T10:00:00Z") },
      { blockId: "b1", occurredAt: new Date("2026-09-09T11:00:00Z") },
      { blockId: "b2", occurredAt: new Date("2026-09-08T10:00:00Z") },
    ];
    const s = summarizeClicks(clicks, [block("b1", "Newsletter"), block("b2", "Shop"), block("b3", "Unused")], 3, now);
    expect(s.totalClicks).toBe(3);
    expect(s.byBlock.map((b) => [b.title, b.clicks])).toEqual([["Newsletter", 2], ["Shop", 1], ["Unused", 0]]);
    expect(s.byDay).toEqual([
      { date: "2026-09-07", clicks: 0 },
      { date: "2026-09-08", clicks: 1 },
      { date: "2026-09-09", clicks: 2 },
    ]);
  });

  it("counts a click older than the window in the total but in no bucket", () => {
    const s = summarizeClicks([{ blockId: "b1", occurredAt: new Date("2026-01-01T00:00:00Z") }], [block("b1", "Old")], 3, now);
    expect(s.totalClicks).toBe(1);
    expect(s.byDay.every((d) => d.clicks === 0)).toBe(true);
  });
});
