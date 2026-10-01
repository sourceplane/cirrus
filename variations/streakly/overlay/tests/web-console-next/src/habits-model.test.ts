import {
  localDateString,
  addDays,
  weekStartOf,
  lastNDays,
  cadenceLabel,
  weekdayLabel,
  shortDate,
  weekRangeLabel,
  emptyHabitForm,
  validateHabitForm,
  streakLabel,
  CADENCES,
} from "@web-console-next/components/habits/model";
import { landingDestination, PRODUCT_HOME, PRODUCT_NAV, PRODUCT_TABS } from "@web-console-next/lib/product";
import { buildNavSections } from "@web-console-next/components/shell/nav-items";

describe("habits view model", () => {
  it("reads today from the browser's own clock, not UTC", () => {
    // A local time late on the 9th must not roll forward to the 10th.
    const d = new Date(2026, 8, 9, 23, 30);
    expect(localDateString(d)).toBe("2026-09-09");
    const early = new Date(2026, 8, 9, 0, 30);
    expect(localDateString(early)).toBe("2026-09-09");
  });

  it("does calendar arithmetic across boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("snaps a date to its Monday", () => {
    expect(weekStartOf("2026-09-09")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-13")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14");
  });

  it("lists the trailing window oldest first", () => {
    expect(lastNDays("2026-09-09", 3)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });

  it("labels a cadence the way a person would say it", () => {
    expect(cadenceLabel("daily", null)).toBe("Every day");
    expect(cadenceLabel("weekdays", null)).toBe("Weekdays");
    expect(cadenceLabel("weekly_target", 3)).toBe("3× a week");
    expect(cadenceLabel("weekly_target", null)).toBe("1× a week");
  });

  it("formats dates for the grid and the week picker", () => {
    expect(weekdayLabel("2026-09-09")).toMatch(/Wed/);
    expect(shortDate("2026-09-09")).toMatch(/Sep/);
    expect(shortDate("nonsense")).toBe("nonsense");
    expect(weekRangeLabel("2026-09-07")).toMatch(/–/);
  });

  it("validates the habit form against the cadence", () => {
    const named = { ...emptyHabitForm(), name: "Read" };
    expect(validateHabitForm(named)).toEqual({});
    // A blank form is not yet valid — the name is what the person must supply.
    expect(validateHabitForm(emptyHabitForm()).name).toBeDefined();
    const weekly = { ...named, cadence: "weekly_target" as const, targetPerWeek: "9" };
    expect(validateHabitForm(weekly).targetPerWeek).toBeDefined();
    expect(validateHabitForm({ ...weekly, targetPerWeek: "3" })).toEqual({});
    // The target is ignored when the cadence does not use one.
    expect(validateHabitForm({ ...named, targetPerWeek: "nonsense" })).toEqual({});
  });

  it("offers exactly the cadences the worker accepts", () => {
    expect(CADENCES.map((c) => c.value)).toEqual(["daily", "weekdays", "weekly_target"]);
  });

  it("names the streak's unit — a bare number means nothing", () => {
    expect(streakLabel(0, "daily")).toBe("No streak yet");
    expect(streakLabel(1, "daily")).toBe("1 day");
    expect(streakLabel(4, "daily")).toBe("4 days");
    expect(streakLabel(2, "weekly_target")).toBe("2 weeks");
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
});
