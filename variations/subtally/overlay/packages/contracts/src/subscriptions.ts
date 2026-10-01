/**
 * Tracked-subscription contract types — the recurring-expense tracker (Subtally
 * variation).
 *
 * Entirely user-scoped: every route lives under `/v1/me/subscriptions...` and
 * needs a session. There is no public surface and no organization in any path.
 *
 * The billing context owns `PublicSubscription` (a plan the person pays US
 * for). These types are the opposite: recurring charges the person pays
 * SOMEONE ELSE for and tracks here — hence `PublicTrackedSubscription`.
 *
 * Money is always minor units (`amountCents`) plus a 3-letter currency; dates
 * are plain calendar dates, `YYYY-MM-DD`.
 */

export type ExpenseCadence = "weekly" | "monthly" | "yearly" | "custom";
export type TrackedSubscriptionStatus = "active" | "paused" | "cancelled";

export interface PublicTrackedSubscription {
  id: string;
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
  /** The next billing date, or null when the subscription is not active. */
  nextRenewal: string | null;
  /** What this charge costs per month / per year, normalised. */
  monthlyCents: number;
  yearlyCents: number;
  createdAt: string;
  updatedAt: string;
}

// ── CRUD ────────────────────────────────────────────────────

export interface ListSubscriptionsResponse {
  subscriptions: PublicTrackedSubscription[];
}

export interface CreateSubscriptionRequest {
  name: string;
  amountCents: number;
  currency: string;
  cadence: ExpenseCadence;
  /** Required when cadence is `custom`. */
  intervalDays?: number | null;
  anchorDate: string;
  category?: string;
  url?: string | null;
  notes?: string | null;
}

export interface UpdateSubscriptionRequest {
  name?: string;
  amountCents?: number;
  currency?: string;
  cadence?: ExpenseCadence;
  intervalDays?: number | null;
  anchorDate?: string;
  category?: string;
  status?: TrackedSubscriptionStatus;
  url?: string | null;
  notes?: string | null;
}

export interface SubscriptionResponse {
  subscription: PublicTrackedSubscription;
}

// ── Summary ─────────────────────────────────────────────────

export interface CategoryTotal {
  category: string;
  currency: string;
  monthlyCents: number;
  yearlyCents: number;
  count: number;
}

export interface SummaryResponse {
  asOf: string;
  /** Totals are per currency: mixing them would invent an exchange rate. */
  monthlyCentsByCurrency: Record<string, number>;
  yearlyCentsByCurrency: Record<string, number>;
  byCategory: CategoryTotal[];
  activeCount: number;
  pausedCount: number;
}

// ── Upcoming renewals ───────────────────────────────────────

export interface UpcomingRenewal {
  subscription: PublicTrackedSubscription;
  nextRenewal: string;
  daysUntil: number;
}

export interface UpcomingResponse {
  asOf: string;
  days: number;
  renewals: UpcomingRenewal[];
}
