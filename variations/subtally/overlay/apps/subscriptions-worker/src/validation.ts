// Pure input rules for the subscriptions surface — mirrored by the console form
// model and unit-tested on their own.

import type { ExpenseCadence, TrackedSubscriptionStatus } from "@saas/db/subscriptions";
import { isDateString } from "./renewals.js";

export const CADENCES: ExpenseCadence[] = ["weekly", "monthly", "yearly", "custom"];
export const STATUSES: TrackedSubscriptionStatus[] = ["active", "paused", "cancelled"];
export const CATEGORIES = ["streaming", "software", "utilities", "insurance", "health", "food", "transport", "other"] as const;
export const CURRENCY_RE = /^[A-Z]{3}$/;

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface SubscriptionValues {
  name: string;
  amountCents: number;
  currency: string;
  cadence: ExpenseCadence;
  intervalDays: number | null;
  anchorDate: string;
  category: string;
  status: TrackedSubscriptionStatus;
  url: string | null;
  notes: string | null;
}

/**
 * Validate create (`partial: false`) or patch (`partial: true`) fields.
 * `currentCadence` is the stored cadence, so a patch is judged against the
 * cadence the row will actually have.
 */
export function validateSubscription(
  body: Record<string, unknown>,
  partial: boolean,
  currentCadence?: ExpenseCadence,
): { ok: true; value: Partial<SubscriptionValues> } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const value: Partial<SubscriptionValues> = {};

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 60) {
      fields.name = ["Name must be 1–60 characters"];
    } else value.name = body.name.trim();
  }

  if (body.amountCents !== undefined || !partial) {
    if (!Number.isInteger(body.amountCents) || (body.amountCents as number) < 0 || (body.amountCents as number) > 100_000_000_00) {
      fields.amountCents = ["Amount must be a whole number of minor units"];
    } else value.amountCents = body.amountCents as number;
  }

  if (body.currency !== undefined || !partial) {
    if (typeof body.currency !== "string" || !CURRENCY_RE.test(body.currency)) {
      fields.currency = ["Currency must be a 3-letter uppercase code, e.g. USD"];
    } else value.currency = body.currency;
  }

  let cadence: ExpenseCadence | undefined = currentCadence;
  if (body.cadence !== undefined) {
    if (typeof body.cadence !== "string" || !CADENCES.includes(body.cadence as ExpenseCadence)) {
      fields.cadence = ["Cadence must be weekly, monthly, yearly or custom"];
    } else {
      cadence = body.cadence as ExpenseCadence;
      value.cadence = cadence;
    }
  } else if (!partial) {
    cadence = "monthly";
    value.cadence = cadence;
  }

  // The interval and the cadence are one rule: custom needs a positive number
  // of days, and the fixed cadences must not carry one.
  const wantsInterval = cadence === "custom";
  if (body.intervalDays !== undefined && body.intervalDays !== null) {
    if (!Number.isInteger(body.intervalDays) || (body.intervalDays as number) < 1 || (body.intervalDays as number) > 3650) {
      fields.intervalDays = ["Interval must be a whole number of days between 1 and 3650"];
    } else if (!wantsInterval) {
      fields.intervalDays = ["Only a custom cadence takes an interval"];
    } else value.intervalDays = body.intervalDays as number;
  } else if (wantsInterval) {
    if (body.intervalDays === null || !partial || body.cadence !== undefined) {
      fields.intervalDays = ["A custom cadence needs an interval in days"];
    }
  } else if (value.cadence !== undefined && !wantsInterval) {
    value.intervalDays = null;
  }

  if (body.anchorDate !== undefined || !partial) {
    if (!isDateString(body.anchorDate)) fields.anchorDate = ["Must be a calendar date, YYYY-MM-DD"];
    else value.anchorDate = body.anchorDate;
  }

  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !(CATEGORIES as readonly string[]).includes(body.category)) {
      fields.category = [`Category must be one of: ${CATEGORIES.join(", ")}`];
    } else value.category = body.category;
  }

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSES.includes(body.status as TrackedSubscriptionStatus)) {
      fields.status = ["Status must be active, paused or cancelled"];
    } else value.status = body.status as TrackedSubscriptionStatus;
  }

  if (body.url !== undefined) {
    if (body.url === null || body.url === "") value.url = null;
    else if (!isHttpUrl(body.url)) fields.url = ["Must be a valid http(s) URL"];
    else value.url = body.url;
  }

  if (body.notes !== undefined) {
    if (body.notes === null) value.notes = null;
    else if (typeof body.notes !== "string" || body.notes.length > 1000) fields.notes = ["Notes must be at most 1000 characters"];
    else value.notes = body.notes;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}
