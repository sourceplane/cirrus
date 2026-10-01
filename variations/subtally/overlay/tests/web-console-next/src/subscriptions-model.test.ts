import {
  formatMoney,
  cadenceLabel,
  statusTone,
  daysUntilLabel,
  localDateString,
  shortDate,
  parseAmountInput,
  emptySubscriptionForm,
  validateSubscriptionForm,
  soleCurrency,
  categoryShare,
  CATEGORIES,
  CADENCES,
} from "@web-console-next/components/subscriptions/model";
import { landingDestination, PRODUCT_HOME, PRODUCT_NAV, PRODUCT_TABS } from "@web-console-next/lib/product";
import { buildNavSections, isLinkActive } from "@web-console-next/components/shell/nav-items";

describe("subscriptions view model", () => {
  it("formats money and falls back on a malformed code", () => {
    expect(formatMoney(1599, "USD")).toContain("15.99");
    expect(formatMoney(1599, "US")).toBe("15.99 US");
  });

  it("labels cadences, including the custom interval", () => {
    expect(cadenceLabel("monthly", null)).toBe("Monthly");
    expect(cadenceLabel("yearly", null)).toBe("Yearly");
    expect(cadenceLabel("custom", 45)).toBe("Every 45 days");
    expect(cadenceLabel("custom", null)).toBe("Every 1 days");
  });

  it("tones a status", () => {
    expect(statusTone("active")).toBe("success");
    expect(statusTone("paused")).toBe("warning");
    expect(statusTone("cancelled")).toBe("secondary");
  });

  it("counts down to a renewal in words", () => {
    expect(daysUntilLabel(0)).toBe("today");
    expect(daysUntilLabel(1)).toBe("tomorrow");
    expect(daysUntilLabel(9)).toBe("in 9 days");
    expect(daysUntilLabel(-2)).toBe("today");
  });

  it("reads today from the browser's own clock", () => {
    expect(localDateString(new Date(2026, 8, 9, 23, 30))).toBe("2026-09-09");
  });

  it("formats a date and survives nonsense", () => {
    expect(shortDate("2026-09-20")).toMatch(/Sep/);
    expect(shortDate("nonsense")).toBe("nonsense");
  });

  it("parses money input strictly", () => {
    expect(parseAmountInput("15.99")).toBe(1599);
    expect(parseAmountInput("15")).toBe(1500);
    expect(parseAmountInput("15.999")).toBeNull();
    expect(parseAmountInput("free")).toBeNull();
    expect(parseAmountInput("")).toBeNull();
  });

  it("validates the form against the cadence", () => {
    const base = { ...emptySubscriptionForm("2026-09-09"), name: "Netflix", amount: "15.99" };
    expect(validateSubscriptionForm(base)).toEqual({});
    expect(validateSubscriptionForm({ ...base, amount: "" }).amount).toBeDefined();
    expect(validateSubscriptionForm({ ...base, currency: "dollars" }).currency).toBeDefined();
    expect(validateSubscriptionForm({ ...base, anchorDate: "20/09/2026" }).anchorDate).toBeDefined();
    expect(validateSubscriptionForm({ ...base, url: "javascript:alert(1)" }).url).toBeDefined();
    // The interval only matters for a custom cadence.
    expect(validateSubscriptionForm({ ...base, intervalDays: "nonsense" })).toEqual({});
    expect(validateSubscriptionForm({ ...base, cadence: "custom", intervalDays: "nonsense" }).intervalDays).toBeDefined();
    expect(validateSubscriptionForm({ ...base, cadence: "custom", intervalDays: "45" })).toEqual({});
  });

  it("names the single currency, or none when there are several", () => {
    expect(soleCurrency({ USD: 100 })).toBe("USD");
    expect(soleCurrency({ USD: 100, EUR: 50 })).toBeNull();
    expect(soleCurrency({})).toBeNull();
  });

  it("scales the category bars against the biggest", () => {
    expect(categoryShare(50, 100)).toBe(50);
    expect(categoryShare(100, 100)).toBe(100);
    expect(categoryShare(10, 0)).toBe(0);
  });

  it("offers exactly the categories and cadences the worker accepts", () => {
    expect([...CATEGORIES]).toEqual(["streaming", "software", "utilities", "insurance", "health", "food", "transport", "other"]);
    expect(CADENCES.map((c) => c.value)).toEqual(["weekly", "monthly", "yearly", "custom"]);
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

  it("keeps the list highlighted on its detail routes", () => {
    expect(isLinkActive("/subscriptions", "/subscriptions")).toBe(true);
    expect(isLinkActive("/subscriptions", "/subscriptions/sub_abc")).toBe(true);
    expect(isLinkActive("/overview", "/subscriptions")).toBe(false);
  });
});
