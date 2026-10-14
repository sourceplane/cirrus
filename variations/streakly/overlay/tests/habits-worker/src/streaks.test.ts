import { currentStreak, bestStreak, completionRate, weekCount, weeklyTarget } from "@habits-worker/streaks";
import { addDays, weekStartOf, isWeekend, lastNDays, daysBetween, isDateString, dayOfWeek } from "@habits-worker/dates";

// 2026-09-09 is a Wednesday; 09-12 Saturday, 09-13 Sunday, 09-14 Monday.
const WED = "2026-09-09";

function set(...dates: string[]): Set<string> {
  return new Set(dates);
}

describe("calendar helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isDateString("2026-09-09")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-9-9")).toBe(false);
    expect(isDateString("yesterday")).toBe(false);
    expect(isDateString(20260909)).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("knows the weekend and the week's Monday", () => {
    expect(dayOfWeek(WED)).toBe(3);
    expect(isWeekend("2026-09-12")).toBe(true);
    expect(isWeekend("2026-09-13")).toBe(true);
    expect(isWeekend(WED)).toBe(false);
    expect(weekStartOf(WED)).toBe("2026-09-07");
    // Sunday belongs to the week that began the previous Monday.
    expect(weekStartOf("2026-09-13")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14");
  });

  it("lists the trailing window and measures gaps", () => {
    expect(lastNDays(WED, 3)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
    expect(daysBetween("2026-09-07", WED)).toBe(2);
    expect(daysBetween(WED, "2026-09-07")).toBe(-2);
  });
});

describe("daily streaks", () => {
  const input = (dates: Set<string>, today = WED) => ({ dates, cadence: "daily" as const, targetPerWeek: null, today });

  it("counts consecutive days ending today", () => {
    expect(currentStreak(input(set("2026-09-07", "2026-09-08", WED)))).toBe(3);
  });

  it("does not break on a today that is not done yet", () => {
    expect(currentStreak(input(set("2026-09-07", "2026-09-08")))).toBe(2);
  });

  it("breaks on a missed yesterday", () => {
    expect(currentStreak(input(set("2026-09-06", "2026-09-07")))).toBe(0);
  });

  it("is zero with no history", () => {
    expect(currentStreak(input(set()))).toBe(0);
    expect(bestStreak(input(set()))).toBe(0);
  });

  it("finds the longest past run", () => {
    const dates = set("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-08", WED);
    expect(bestStreak(input(dates))).toBe(4);
    expect(currentStreak(input(dates))).toBe(2);
  });
});

describe("weekday streaks", () => {
  const input = (dates: Set<string>, today: string) => ({ dates, cadence: "weekdays" as const, targetPerWeek: null, today });

  it("treats the weekend as neutral", () => {
    // Thu 10th, Fri 11th done; Sat/Sun skipped; Mon 14th done → 3 weekdays.
    const dates = set("2026-09-10", "2026-09-11", "2026-09-14");
    expect(currentStreak(input(dates, "2026-09-14"))).toBe(3);
  });

  it("does not require the weekend to be checked", () => {
    const dates = set("2026-09-11");
    // Saturday: the streak from Friday survives untouched.
    expect(currentStreak(input(dates, "2026-09-12"))).toBe(1);
  });

  it("breaks on a missed weekday", () => {
    const dates = set("2026-09-08", "2026-09-10");
    expect(currentStreak(input(dates, "2026-09-10"))).toBe(1);
  });
});

describe("weekly-target streaks", () => {
  const input = (dates: Set<string>, today = WED, target = 3) => ({
    dates,
    cadence: "weekly_target" as const,
    targetPerWeek: target,
    today,
  });

  it("counts a week only once the target is met", () => {
    // This week (Mon 7th–): two check-ins so far, target 3 → not yet counted.
    expect(currentStreak(input(set("2026-09-07", "2026-09-08")))).toBe(0);
    expect(currentStreak(input(set("2026-09-07", "2026-09-08", WED)))).toBe(1);
  });

  it("chains consecutive met weeks and lets an unfinished week ride", () => {
    const lastWeek = set("2026-08-31", "2026-09-01", "2026-09-02");
    // Last week met, this week only one so far: the run stands at 1.
    expect(currentStreak(input(new Set([...lastWeek, "2026-09-07"])))).toBe(1);
    // Both met: 2.
    expect(currentStreak(input(new Set([...lastWeek, "2026-09-07", "2026-09-08", WED])))).toBe(2);
  });

  it("counts weeks, not days, for the best run", () => {
    const dates = set("2026-08-24", "2026-08-25", "2026-08-26", "2026-08-31", "2026-09-01", "2026-09-02");
    expect(bestStreak(input(dates))).toBe(2);
  });

  it("weekCount and weeklyTarget agree with the cadence", () => {
    expect(weekCount(set("2026-09-07", "2026-09-08", "2026-09-13"), "2026-09-07")).toBe(3);
    expect(weeklyTarget("daily", null)).toBe(7);
    expect(weeklyTarget("weekdays", null)).toBe(5);
    expect(weeklyTarget("weekly_target", 4)).toBe(4);
    expect(weeklyTarget("weekly_target", null)).toBe(1);
  });
});

describe("completion rate", () => {
  it("is the share of expected days that were met", () => {
    // Seven-day window, daily cadence, four done.
    const dates = set("2026-09-03", "2026-09-05", "2026-09-07", WED);
    expect(completionRate(dates, "daily", null, "2026-09-03", WED)).toBe(57);
  });

  it("ignores weekends for a weekday habit", () => {
    // Mon 7th–Sun 13th: five weekdays expected, all five done.
    const dates = set("2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11");
    expect(completionRate(dates, "weekdays", null, "2026-09-07", "2026-09-13")).toBe(100);
  });

  it("spreads a weekly target across the window and never exceeds 100", () => {
    const dates = set("2026-09-07", "2026-09-08", "2026-09-09");
    expect(completionRate(dates, "weekly_target", 3, "2026-09-07", "2026-09-13")).toBe(100);
    expect(completionRate(set(), "daily", null, "2026-09-07", "2026-09-13")).toBe(0);
  });
});
