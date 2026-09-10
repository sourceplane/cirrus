import type { Actor, Deps } from "../deps.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { toPublicSubscription } from "../mappers.js";
import { asOfFrom } from "./crud.js";
import { addDays, daysBetween, isDateString } from "../renewals.js";
import type { CategoryTotal, SummaryResponse, UpcomingResponse } from "@saas/contracts/subscriptions";

const MAX_WINDOW_DAYS = 365;

/** What the person is paying, per currency and per category. */
export async function summary(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const asOf = asOfFrom(url, deps);
  if (!isDateString(asOf)) return validationError(requestId, { asOf: ["Must be a calendar date, YYYY-MM-DD"] });

  const all = await deps.repo.list(actor.subjectId);
  if (!all.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const active = all.value.filter((s) => s.status === "active").map((s) => toPublicSubscription(s, asOf));

  // Totals stay per currency: adding USD to EUR would invent an exchange rate
  // this product has no business inventing.
  const monthlyCentsByCurrency: Record<string, number> = {};
  const yearlyCentsByCurrency: Record<string, number> = {};
  const categories = new Map<string, CategoryTotal>();

  for (const s of active) {
    monthlyCentsByCurrency[s.currency] = (monthlyCentsByCurrency[s.currency] ?? 0) + s.monthlyCents;
    yearlyCentsByCurrency[s.currency] = (yearlyCentsByCurrency[s.currency] ?? 0) + s.yearlyCents;
    const key = `${s.category}:${s.currency}`;
    const row = categories.get(key);
    if (row) {
      row.monthlyCents += s.monthlyCents;
      row.yearlyCents += s.yearlyCents;
      row.count += 1;
    } else {
      categories.set(key, { category: s.category, currency: s.currency, monthlyCents: s.monthlyCents, yearlyCents: s.yearlyCents, count: 1 });
    }
  }

  const res: SummaryResponse = {
    asOf,
    monthlyCentsByCurrency,
    yearlyCentsByCurrency,
    byCategory: [...categories.values()].sort((a, b) => b.monthlyCents - a.monthlyCents || a.category.localeCompare(b.category)),
    activeCount: active.length,
    pausedCount: all.value.filter((s) => s.status === "paused").length,
  };
  return successResponse(res, requestId);
}

/** Active subscriptions renewing inside the window, soonest first. */
export async function upcoming(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const asOf = asOfFrom(url, deps);
  if (!isDateString(asOf)) return validationError(requestId, { asOf: ["Must be a calendar date, YYYY-MM-DD"] });

  const daysParam = url.searchParams.get("days");
  const days = daysParam === null ? 30 : Number(daysParam);
  if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_DAYS) {
    return validationError(requestId, { days: [`Must be an integer between 1 and ${MAX_WINDOW_DAYS}`] });
  }

  const all = await deps.repo.list(actor.subjectId, "active");
  if (!all.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const horizon = addDays(asOf, days);
  const renewals = all.value
    .map((s) => toPublicSubscription(s, asOf))
    .filter((s) => s.nextRenewal !== null && s.nextRenewal <= horizon)
    .map((s) => ({ subscription: s, nextRenewal: s.nextRenewal!, daysUntil: daysBetween(asOf, s.nextRenewal!) }))
    .sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal) || a.subscription.name.localeCompare(b.subscription.name));

  const res: UpcomingResponse = { asOf, days, renewals };
  return successResponse(res, requestId);
}
