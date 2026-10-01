/**
 * Pure view-model helpers for the habit tracker. Dependency-free so they are
 * unit-testable; the worker owns the authoritative validation and the streak
 * definition.
 *
 * Dates here are the BROWSER's local calendar dates — the whole product treats
 * "today" as whatever day it is where the person is.
 */

import type { Cadence } from "@saas/contracts/habits";

export const CADENCES: { value: Cadence; label: string; hint: string }[] = [
  { value: "daily", label: "Every day", hint: "Seven days a week." },
  { value: "weekdays", label: "Weekdays", hint: "Monday to Friday; weekends don't count either way." },
  { value: "weekly_target", label: "Times per week", hint: "Any days you like, as long as you hit the number." },
];

export const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6"] as const;

/** Today as the browser sees it, `YYYY-MM-DD` — never a UTC shift. */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function key(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return key(d);
}

/** The Monday of the week `date` falls in. */
export function weekStartOf(date: string): string {
  const dow = parse(date).getUTCDay();
  return addDays(date, -(dow === 0 ? 6 : dow - 1));
}

/** `n` days ending at `date`, oldest first. */
export function lastNDays(date: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(date, -i));
  return out;
}

export function cadenceLabel(cadence: Cadence, targetPerWeek: number | null): string {
  if (cadence === "daily") return "Every day";
  if (cadence === "weekdays") return "Weekdays";
  return `${targetPerWeek ?? 1}× a week`;
}

/** "Mon" — the weekday initial row above the dot grid. */
export function weekdayLabel(date: string): string {
  return parse(date).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

/** "Sep 9" — for the review's week range. */
export function shortDate(date: string): string {
  const d = parse(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function weekRangeLabel(weekStart: string): string {
  return `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;
}

export interface HabitFormValues {
  name: string;
  cadence: Cadence;
  targetPerWeek: string;
  color: string;
}

export function emptyHabitForm(): HabitFormValues {
  return { name: "", cadence: "daily", targetPerWeek: "3", color: COLORS[0] };
}

export function validateHabitForm(v: HabitFormValues): Partial<Record<keyof HabitFormValues, string>> {
  const errors: Partial<Record<keyof HabitFormValues, string>> = {};
  const name = v.name.trim();
  if (name.length < 1 || name.length > 60) errors.name = "1–60 characters";
  if (v.cadence === "weekly_target") {
    const n = Number(v.targetPerWeek);
    if (!Number.isInteger(n) || n < 1 || n > 7) errors.targetPerWeek = "A whole number from 1 to 7";
  }
  return errors;
}

/** The streak wording under a habit — a count means nothing without its unit. */
export function streakLabel(streak: number, cadence: Cadence): string {
  if (streak === 0) return "No streak yet";
  const unit = cadence === "weekly_target" ? "week" : "day";
  return `${streak} ${unit}${streak === 1 ? "" : "s"}`;
}
