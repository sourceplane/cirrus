import {
  nextRenewal,
  monthlyEquivalentCents,
  yearlyEquivalentCents,
  addMonthsAnchored,
  addYearsAnchored,
  addDays,
  daysBetween,
  daysInMonth,
  isDateString,
} from "@subscriptions-worker/renewals";

describe("date helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isDateString("2026-09-09")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-9-9")).toBe(false);
    expect(isDateString(20260909)).toBe(false);
  });

  it("knows month lengths, leap years included", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("adds days and measures gaps", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-09-01", "2026-09-30")).toBe(29);
    expect(daysBetween("2026-09-30", "2026-09-01")).toBe(-29);
  });
});

describe("anchored month arithmetic", () => {
  it("clamps a late day to the end of a short month, then returns", () => {
    // The rule people notice: the 31st is not "the last day", it is the 31st.
    expect(addMonthsAnchored("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsAnchored("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsAnchored("2026-01-31", 3)).toBe("2026-04-30");
    expect(addMonthsAnchored("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("crosses the year boundary", () => {
    expect(addMonthsAnchored("2026-11-15", 3)).toBe("2027-02-15");
    expect(addYearsAnchored("2026-06-01", 2)).toBe("2028-06-01");
  });

  it("clamps Feb 29 in a common year", () => {
    expect(addYearsAnchored("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYearsAnchored("2024-02-29", 4)).toBe("2028-02-29");
  });
});

describe("nextRenewal", () => {
  it("returns a future anchor unchanged", () => {
    expect(nextRenewal("2026-10-01", "monthly", null, "2026-09-09")).toBe("2026-10-01");
  });

  it("returns the anchor itself when it is today", () => {
    expect(nextRenewal("2026-09-09", "monthly", null, "2026-09-09")).toBe("2026-09-09");
  });

  it("steps weekly from the anchor", () => {
    expect(nextRenewal("2026-09-01", "weekly", null, "2026-09-09")).toBe("2026-09-15");
    expect(nextRenewal("2026-09-01", "weekly", null, "2026-09-08")).toBe("2026-09-08");
  });

  it("steps monthly, anchored on the day of month", () => {
    expect(nextRenewal("2026-01-15", "monthly", null, "2026-09-09")).toBe("2026-09-15");
    expect(nextRenewal("2026-01-15", "monthly", null, "2026-09-16")).toBe("2026-10-15");
    // Anchored on the 31st: February bills on the 28th, March back to the 31st.
    expect(nextRenewal("2026-01-31", "monthly", null, "2026-02-01")).toBe("2026-02-28");
    expect(nextRenewal("2026-01-31", "monthly", null, "2026-03-01")).toBe("2026-03-31");
  });

  it("steps yearly, clamping a leap-day anchor", () => {
    expect(nextRenewal("2024-02-29", "yearly", null, "2026-09-09")).toBe("2027-02-28");
    expect(nextRenewal("2026-03-01", "yearly", null, "2026-09-09")).toBe("2027-03-01");
  });

  it("steps by the custom interval", () => {
    expect(nextRenewal("2026-09-01", "custom", 10, "2026-09-09")).toBe("2026-09-11");
    expect(nextRenewal("2026-09-01", "custom", 10, "2026-09-11")).toBe("2026-09-11");
    // Three 90-day periods from Jan 1 is Sep 28, not the 29th.
    expect(nextRenewal("2026-01-01", "custom", 90, "2026-09-09")).toBe("2026-09-28");
  });

  it("lands on a date at or after asOf for a long back-history", () => {
    for (const cadence of ["weekly", "monthly", "yearly"] as const) {
      const next = nextRenewal("2019-01-31", cadence, null, "2026-09-09");
      expect(next >= "2026-09-09").toBe(true);
    }
  });
});

describe("normalised cost", () => {
  it("converts each cadence to a month", () => {
    expect(monthlyEquivalentCents(1000, "weekly", null)).toBe(4333);
    expect(monthlyEquivalentCents(1299, "monthly", null)).toBe(1299);
    expect(monthlyEquivalentCents(12000, "yearly", null)).toBe(1000);
    expect(monthlyEquivalentCents(3000, "custom", 90)).toBe(1015);
  });

  it("converts each cadence to a year", () => {
    expect(yearlyEquivalentCents(1000, "weekly", null)).toBe(52000);
    expect(yearlyEquivalentCents(1299, "monthly", null)).toBe(15588);
    expect(yearlyEquivalentCents(12000, "yearly", null)).toBe(12000);
    expect(yearlyEquivalentCents(3000, "custom", 30)).toBe(36525);
  });

  it("treats a missing custom interval as daily rather than dividing by zero", () => {
    expect(Number.isFinite(monthlyEquivalentCents(100, "custom", null))).toBe(true);
    expect(Number.isFinite(yearlyEquivalentCents(100, "custom", 0))).toBe(true);
  });
});
