export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../d1/executor.js";

// ── Result type ─────────────────────────────────────────────

export type SubscriptionsRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type SubscriptionsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SubscriptionsRepositoryError };

// ── Entities ────────────────────────────────────────────────

export type ExpenseCadence = "weekly" | "monthly" | "yearly" | "custom";
export type TrackedSubscriptionStatus = "active" | "paused" | "cancelled";

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: ExpenseCadence;
  intervalDays: number | null;
  /** A known billing date, `YYYY-MM-DD`; future renewals derive from it. */
  anchorDate: string;
  category: string;
  status: TrackedSubscriptionStatus;
  url: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Inputs ──────────────────────────────────────────────────

export interface CreateSubscriptionInput {
  id: string;
  userId: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: ExpenseCadence;
  intervalDays?: number | null;
  anchorDate: string;
  category?: string;
  url?: string | null;
  notes?: string | null;
}

export interface UpdateSubscriptionInput {
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

// ── Repository ──────────────────────────────────────────────

export interface SubscriptionsRepository {
  list(userId: string, status?: TrackedSubscriptionStatus): Promise<SubscriptionsResult<Subscription[]>>;
  get(userId: string, id: string): Promise<SubscriptionsResult<Subscription>>;
  create(input: CreateSubscriptionInput): Promise<SubscriptionsResult<Subscription>>;
  update(userId: string, id: string, input: UpdateSubscriptionInput): Promise<SubscriptionsResult<Subscription>>;
  remove(userId: string, id: string): Promise<SubscriptionsResult<void>>;
}
