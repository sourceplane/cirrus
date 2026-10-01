import type { Actor, Deps } from "../deps.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { toPublicHabit } from "../mappers.js";
import { addDays, isDateString, lastNDays, weekStartOf } from "../dates.js";
import { bestStreak, completionRate, currentStreak, weekCount, weeklyTarget } from "../streaks.js";
import type { ReviewResponse, TodayResponse } from "@saas/contracts/habits";

/** The check-in board for one calendar day. */
export async function today(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const date = url.searchParams.get("date");
  if (!date || !isDateString(date)) {
    return validationError(requestId, { date: ["Must be a calendar date, YYYY-MM-DD"] });
  }

  const [habits, checkIns] = await Promise.all([
    deps.repo.listHabits(actor.subjectId, false),
    deps.repo.allCheckInDates(actor.subjectId),
  ]);
  if (!habits.ok || !checkIns.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const week = lastNDays(date, 7);
  const res: TodayResponse = {
    date,
    habits: habits.value.map((h) => {
      const dates = new Set(checkIns.value.get(h.id) ?? []);
      const input = { dates, cadence: h.cadence, targetPerWeek: h.targetPerWeek, today: date };
      return {
        habit: toPublicHabit(h),
        doneToday: dates.has(date),
        currentStreak: currentStreak(input),
        bestStreak: bestStreak(input),
        completionRate30d: completionRate(dates, h.cadence, h.targetPerWeek, addDays(date, -29), date),
        days: week.map((d) => ({ date: d, done: dates.has(d) })),
      };
    }),
  };
  return successResponse(res, requestId);
}

/** How one ISO week went, per habit. */
export async function review(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const raw = url.searchParams.get("weekStart");
  if (!raw || !isDateString(raw)) {
    return validationError(requestId, { weekStart: ["Must be a calendar date, YYYY-MM-DD"] });
  }
  // Snap to the Monday, so any day of the week names its week.
  const weekStart = weekStartOf(raw);

  const [habits, checkIns] = await Promise.all([
    deps.repo.listHabits(actor.subjectId, false),
    deps.repo.allCheckInDates(actor.subjectId),
  ]);
  if (!habits.ok || !checkIns.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const weekEnd = addDays(weekStart, 6);
  const rows = habits.value.map((h) => {
    const dates = new Set(checkIns.value.get(h.id) ?? []);
    const done = weekCount(dates, weekStart);
    const target = weeklyTarget(h.cadence, h.targetPerWeek);
    return {
      habit: toPublicHabit(h),
      done,
      target,
      met: done >= target,
      // The streak is read at the end of that week, not today, so a past week
      // reads as it did then.
      currentStreak: currentStreak({ dates, cadence: h.cadence, targetPerWeek: h.targetPerWeek, today: weekEnd }),
    };
  });

  const res: ReviewResponse = {
    weekStart,
    habits: rows,
    totals: {
      habits: rows.length,
      met: rows.filter((r) => r.met).length,
      checkIns: rows.reduce((sum, r) => sum + r.done, 0),
    },
  };
  return successResponse(res, requestId);
}
