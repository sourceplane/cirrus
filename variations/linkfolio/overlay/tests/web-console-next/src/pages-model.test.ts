import {
  handleValid,
  parsePriceInput,
  formatPrice,
  moveItem,
  validateBlockForm,
  emptyBlockForm,
  blockToForm,
  barHeights,
  shortDate,
  BLOCK_KINDS,
} from "@web-console-next/components/pages/model";
import { landingDestination, publicPagePath, PRODUCT_HOME, PRODUCT_NAV, PRODUCT_TABS } from "@web-console-next/lib/product";
import { buildNavSections, isLinkActive } from "@web-console-next/components/shell/nav-items";
import type { PublicBlock } from "@saas/contracts/pages";

describe("pages view model", () => {
  it("mirrors the worker's handle rule", () => {
    expect(handleValid("jane")).toBe(true);
    expect(handleValid("jo")).toBe(false);
    expect(handleValid("me")).toBe(false);
  });

  it("parses money input strictly", () => {
    expect(parsePriceInput("12.99")).toBe(1299);
    expect(parsePriceInput("5")).toBe(500);
    expect(parsePriceInput(" 7.5 ")).toBe(750);
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("12.999")).toBeNull();
    expect(parsePriceInput("free")).toBeNull();
  });

  it("formats money, falling back when the code is not a currency", () => {
    expect(formatPrice(null, "USD")).toBe("");
    expect(formatPrice(1299, "USD")).toContain("12.99");
    // A well-formed but unknown code still formats (Intl prints the code).
    expect(formatPrice(1299, "ZZZ")).toContain("12.99");
    // A malformed code makes Intl throw; the price must still render.
    expect(formatPrice(1299, "US")).toBe("12.99 US");
  });

  it("moves an item within the order and refuses to fall off the ends", () => {
    const ids = ["a", "b", "c"];
    expect(moveItem(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveItem(ids, "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveItem(ids, "a", "up")).toBe(ids);
    expect(moveItem(ids, "c", "down")).toBe(ids);
    expect(moveItem(ids, "zz", "up")).toBe(ids);
  });

  it("validates the block form by kind", () => {
    expect(validateBlockForm({ ...emptyBlockForm("header"), title: "Section" })).toEqual({});
    const link = validateBlockForm({ ...emptyBlockForm("link"), title: "Site", url: "nope" });
    expect(link.url).toBeDefined();
    const ok = validateBlockForm({ ...emptyBlockForm("link"), title: "Site", url: "https://acme.dev" });
    expect(ok).toEqual({});
    const priced = validateBlockForm({ ...emptyBlockForm("product"), title: "Guide", url: "https://acme.dev", price: "12.999" });
    expect(priced.price).toBeDefined();
  });

  it("seeds the edit form from a block", () => {
    const block: PublicBlock = {
      id: "blk_1", kind: "product", title: "Guide", url: "https://acme.dev",
      description: "A guide", priceCents: 1299, currency: "EUR", position: 0, enabled: true,
    };
    expect(blockToForm(block)).toEqual({ kind: "product", title: "Guide", url: "https://acme.dev", description: "A guide", price: "12.99", currency: "EUR" });
  });

  it("offers exactly the kinds the worker accepts", () => {
    expect(BLOCK_KINDS.map((k) => k.value)).toEqual(["link", "header", "product", "tip"]);
  });

  it("scales chart bars against the busiest day", () => {
    expect(barHeights([{ date: "2026-09-08", clicks: 2 }, { date: "2026-09-09", clicks: 4 }])).toEqual([
      { date: "2026-09-08", clicks: 2, height: 50 },
      { date: "2026-09-09", clicks: 4, height: 100 },
    ]);
    expect(barHeights([{ date: "2026-09-09", clicks: 0 }])[0]!.height).toBe(0);
  });

  it("formats an axis date in UTC", () => {
    expect(shortDate("2026-09-09")).toMatch(/Sep/);
    expect(shortDate("nonsense")).toBe("nonsense");
  });
});

describe("product surface registration", () => {
  it("lands on the product under Solo, passes through otherwise", () => {
    expect(landingDestination("/orgs/acme/settings", true)).toBe(PRODUCT_HOME);
    expect(landingDestination("/onboarding", true)).toBe("/onboarding");
    expect(landingDestination("/orgs/acme/projects", false)).toBe("/orgs/acme/projects");
  });

  it("builds the public page path", () => {
    expect(publicPagePath("jane")).toBe("/p/jane");
  });

  it("contributes a product nav section under Solo only", () => {
    const solo = buildNavSections({ orgSlug: "acme" }, true);
    expect(solo[0]!.id).toBe("product");
    expect(solo[0]!.links.map((l) => l.href)).toEqual(PRODUCT_NAV.map((l) => l.href));
    expect(buildNavSections({ orgSlug: "acme" }, false).map((s) => s.id)).not.toContain("product");
    expect(PRODUCT_TABS.length).toBeLessThanOrEqual(4);
  });

  it("keeps the editor from highlighting on its sibling pages", () => {
    expect(isLinkActive("/page", "/page")).toBe(true);
    expect(isLinkActive("/page", "/page/analytics")).toBe(false);
    expect(isLinkActive("/page/analytics", "/page/analytics")).toBe(true);
  });
});
