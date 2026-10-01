// Renewal and normalisation math.
//
// Nothing here reads a clock or a database: a subscription stores an anchor
// date it was (or will be) billed on, and every future date is derived from it,
// so no stored "next renewal" can drift.
//
// The month rule is the one people notice: a subscription anchored on the 31st
// bills on the 28th (or 29th) in February and returns to the 31st in March. It
// is anchored, not "last month plus one".

import type { ExpenseCadence } from "@saas/db/subscriptions";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function parts(date: string): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

function key(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/** `n` months after the anchor, keeping the anchor's day clamped to month end. */
export function addMonthsAnchored(anchor: string, n: number): string {
  const { y, m, d } = parts(anchor);
  const total = (y * 12 + (m - 1)) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return key(year, month, Math.min(d, daysInMonth(year, month)));
}

/** `n` years after the anchor; Feb 29 clamps to Feb 28 in a common year. */
export function addYearsAnchored(anchor: string, n: number): string {
  return addMonthsAnchored(anchor, n * 12);
}

/**
 * The first billing date on or after `asOf`. Anchors in the future are
 * themselves the answer — a subscription that starts next month renews then.
 */
export function nextRenewal(anchorDate: string, cadence: ExpenseCadence, intervalDays: number | null, asOf: string): string {
  if (anchorDate >= asOf) return anchorDate;

  if (cadence === "weekly" || cadence === "custom") {
    const step = cadence === "weekly" ? 7 : Math.max(1, intervalDays ?? 1);
    const elapsed = daysBetween(anchorDate, asOf);
    const periods = Math.ceil(elapsed / step);
    return addDays(anchorDate, periods * step);
  }

  const step = cadence === "yearly" ? 12 : 1;
  // Jump close in one calculation, then step: clamping makes the month
  // arithmetic non-linear, so the last hop has to be verified rather than
  // computed.
  const { y: ay, m: am } = parts(anchorDate);
  const { y: sy, m: sm } = parts(asOf);
  const monthsApart = (sy * 12 + (sm - 1)) - (ay * 12 + (am - 1));
  let n = Math.max(0, Math.floor(monthsApart / step));
  let candidate = addMonthsAnchored(anchorDate, n * step);
  while (candidate < asOf) {
    n += 1;
    candidate = addMonthsAnchored(anchorDate, n * step);
  }
  return candidate;
}

const DAYS_PER_YEAR = 365.25;

/** What this charge costs in a month, normalised across cadences. */
export function monthlyEquivalentCents(amountCents: number, cadence: ExpenseCadence, intervalDays: number | null): number {
  switch (cadence) {
    case "weekly":
      return Math.round((amountCents * 52) / 12);
    case "monthly":
      return amountCents;
    case "yearly":
      return Math.round(amountCents / 12);
    case "custom": {
      const days = Math.max(1, intervalDays ?? 1);
      return Math.round((amountCents * (DAYS_PER_YEAR / days)) / 12);
    }
  }
}

/** What this charge costs in a year, normalised across cadences. */
export function yearlyEquivalentCents(amountCents: number, cadence: ExpenseCadence, intervalDays: number | null): number {
  switch (cadence) {
    case "weekly":
      return amountCents * 52;
    case "monthly":
      return amountCents * 12;
    case "yearly":
      return amountCents;
    case "custom": {
      const days = Math.max(1, intervalDays ?? 1);
      return Math.round(amountCents * (DAYS_PER_YEAR / days));
    }
  }
}
