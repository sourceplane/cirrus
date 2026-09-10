// Streak math.
//
// The rules a person expects, made explicit:
//
//   daily          every calendar day counts. Today not being done yet does not
//                  break the streak — the day is not over.
//   weekdays       Mon–Fri count; weekends are neutral (they neither extend nor
//                  break a streak).
//   weekly_target  the unit is an ISO week (Mon–Sun). A week counts when it has
//                  at least `targetPerWeek` check-ins; the current week counts
//                  only once it is already met, so an unfinished week never
//                  breaks the run.
//
// Everything here is pure: dates in, numbers out.

import { addDays, isWeekend, weekStartOf } from "./dates.js";
import type { Cadence } from "@saas/db/habits";

export interface StreakInput {
  dates: Set<string>;
  cadence: Cadence;
  targetPerWeek: number | null;
  /** The client's today. */
  today: string;
}

/** Check-ins in the ISO week starting at `weekStart`. */
export function weekCount(dates: Set<string>, weekStart: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (dates.has(addDays(weekStart, i))) n++;
  return n;
}

/** The number a week must reach for the cadence to call it met. */
export function weeklyTarget(cadence: Cadence, targetPerWeek: number | null): number {
  if (cadence === "daily") return 7;
  if (cadence === "weekdays") return 5;
  return targetPerWeek ?? 1;
}

/**
 * The run ending now. Counting stops at the first miss; today (or the current
 * week) is allowed to be unfinished.
 */
export function currentStreak({ dates, cadence, targetPerWeek, today }: StreakInput): number {
  if (dates.size === 0) return 0;

  if (cadence === "weekly_target") {
    const target = weeklyTarget(cadence, targetPerWeek);
    let week = weekStartOf(today);
    let streak = 0;
    // The current week counts only if it is already met; otherwise it is simply
    // not finished, and the run continues from last week.
    if (weekCount(dates, week) >= target) streak++;
    week = addDays(week, -7);
    while (weekCount(dates, week) >= target) {
      streak++;
      week = addDays(week, -7);
    }
    return streak;
  }

  const counts = (d: string): boolean => cadence !== "weekdays" || !isWeekend(d);

  let cursor = today;
  // Today unfinished is not a miss — start from yesterday in that case.
  if (counts(cursor) && !dates.has(cursor)) cursor = addDays(cursor, -1);

  let streak = 0;
  // Bound the walk: a decade of days is far past any real streak.
  for (let guard = 0; guard < 3700; guard++) {
    if (!counts(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!dates.has(cursor)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** The longest run in the whole history, by the same rules. */
export function bestStreak({ dates, cadence, targetPerWeek, today }: StreakInput): number {
  if (dates.size === 0) return 0;
  const sorted = [...dates].sort();
  const first = sorted[0]!;

  if (cadence === "weekly_target") {
    const target = weeklyTarget(cadence, targetPerWeek);
    let week = weekStartOf(first);
    const lastWeek = weekStartOf(today);
    let best = 0;
    let run = 0;
    while (week <= lastWeek) {
      if (weekCount(dates, week) >= target) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
      week = addDays(week, 7);
    }
    return best;
  }

  const counts = (d: string): boolean => cadence !== "weekdays" || !isWeekend(d);
  let best = 0;
  let run = 0;
  let cursor = first;
  for (let guard = 0; cursor <= today && guard < 20000; guard++) {
    if (counts(cursor)) {
      if (dates.has(cursor)) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

/**
 * Share of the cadence's expected days that were met in `[from, to]`, 0–100.
 * For a weekly target the expectation is spread evenly across the window.
 */
export function completionRate(
  dates: Set<string>,
  cadence: Cadence,
  targetPerWeek: number | null,
  from: string,
  to: string,
): number {
  let expected = 0;
  let done = 0;
  let cursor = from;
  for (let guard = 0; cursor <= to && guard < 20000; guard++) {
    const counted = cadence === "weekdays" ? !isWeekend(cursor) : true;
    if (cadence === "weekly_target") {
      expected += weeklyTarget(cadence, targetPerWeek) / 7;
      if (dates.has(cursor)) done++;
    } else if (counted) {
      expected++;
      if (dates.has(cursor)) done++;
    }
    cursor = addDays(cursor, 1);
  }
  if (expected === 0) return 0;
  return Math.min(100, Math.round((done / expected) * 100));
}
