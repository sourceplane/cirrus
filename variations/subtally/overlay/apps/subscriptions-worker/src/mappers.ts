import type { Subscription } from "@saas/db/subscriptions";
import type { PublicTrackedSubscription } from "@saas/contracts/subscriptions";
import { subscriptionPublicId } from "./ids.js";
import { monthlyEquivalentCents, nextRenewal, yearlyEquivalentCents } from "./renewals.js";

/**
 * `asOf` drives the derived renewal date, so a list and its summary always
 * agree. A subscription that is not active has no next renewal — it is not
 * being billed.
 */
export function toPublicSubscription(s: Subscription, asOf: string): PublicTrackedSubscription {
  return {
    id: subscriptionPublicId(s.id),
    name: s.name,
    amountCents: s.amountCents,
    currency: s.currency,
    cadence: s.cadence,
    intervalDays: s.intervalDays,
    anchorDate: s.anchorDate,
    category: s.category,
    status: s.status,
    url: s.url,
    notes: s.notes,
    nextRenewal: s.status === "active" ? nextRenewal(s.anchorDate, s.cadence, s.intervalDays, asOf) : null,
    monthlyCents: monthlyEquivalentCents(s.amountCents, s.cadence, s.intervalDays),
    yearlyCents: yearlyEquivalentCents(s.amountCents, s.cadence, s.intervalDays),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
