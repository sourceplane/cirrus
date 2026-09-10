import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import type {
  CreateSubscriptionInput,
  Subscription,
  TrackedSubscriptionStatus,
  SubscriptionsRepository,
  SubscriptionsResult,
  UpdateSubscriptionInput,
} from "./types.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

function mapSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    amountCents: Number(row.amount_cents ?? 0),
    currency: row.currency as string,
    cadence: row.cadence as Subscription["cadence"],
    intervalDays: row.interval_days === null || row.interval_days === undefined ? null : Number(row.interval_days),
    anchorDate: row.anchor_date as string,
    category: row.category as string,
    status: row.status as TrackedSubscriptionStatus,
    url: (row.url as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function internal(message: string): SubscriptionsResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

export function createSubscriptionsRepository(executor: SqlExecutor): SubscriptionsRepository {
  return {
    async list(userId, status) {
      try {
        const sql = status
          ? `SELECT * FROM subscriptions_items WHERE user_id = $1 AND status = $2 ORDER BY name ASC, id ASC LIMIT 500`
          : `SELECT * FROM subscriptions_items WHERE user_id = $1 ORDER BY name ASC, id ASC LIMIT 500`;
        const params = status ? [userId, status] : [userId];
        const r = await executor.execute<Record<string, unknown>>(sql, params);
        return { ok: true, value: r.rows.map(mapSubscription) };
      } catch {
        return internal("Failed to list subscriptions");
      }
    },

    async get(userId, id) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `SELECT * FROM subscriptions_items WHERE user_id = $1 AND id = $2`,
          [userId, id],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapSubscription(r.rows[0]!) };
      } catch {
        return internal("Failed to read subscription");
      }
    },

    async create(input: CreateSubscriptionInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO subscriptions_items
             (id, user_id, name, amount_cents, currency, cadence, interval_days, anchor_date, category, status, url, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11, ${NOW}, ${NOW})
           RETURNING *`,
          [
            input.id,
            input.userId,
            input.name,
            input.amountCents,
            input.currency,
            input.cadence,
            input.intervalDays ?? null,
            input.anchorDate,
            input.category ?? "other",
            input.url ?? null,
            input.notes ?? null,
          ],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        return { ok: true, value: mapSubscription(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "subscription" } };
        return internal("Failed to create subscription");
      }
    },

    async update(userId, id, input: UpdateSubscriptionInput) {
      try {
        // The cadence and its interval move together: a CASE per nullable field
        // keeps "absent" (leave alone) distinct from "explicitly null" (clear).
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE subscriptions_items
           SET name = COALESCE($3, name),
               amount_cents = COALESCE($4, amount_cents),
               currency = COALESCE($5, currency),
               cadence = COALESCE($6, cadence),
               interval_days = CASE WHEN $7 = 1 THEN $8 ELSE interval_days END,
               anchor_date = COALESCE($9, anchor_date),
               category = COALESCE($10, category),
               status = COALESCE($11, status),
               url = CASE WHEN $12 = 1 THEN $13 ELSE url END,
               notes = CASE WHEN $14 = 1 THEN $15 ELSE notes END,
               updated_at = ${NOW}
           WHERE user_id = $1 AND id = $2
           RETURNING *`,
          [
            userId,
            id,
            input.name ?? null,
            input.amountCents ?? null,
            input.currency ?? null,
            input.cadence ?? null,
            input.intervalDays !== undefined ? 1 : 0,
            input.intervalDays ?? null,
            input.anchorDate ?? null,
            input.category ?? null,
            input.status ?? null,
            input.url !== undefined ? 1 : 0,
            input.url ?? null,
            input.notes !== undefined ? 1 : 0,
            input.notes ?? null,
          ],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapSubscription(r.rows[0]!) };
      } catch {
        // The cadence/interval CHECK is the likely cause: custom needs an
        // interval and the fixed cadences must not carry one.
        return internal("Failed to update subscription");
      }
    },

    async remove(userId, id) {
      try {
        const r = await executor.execute(`DELETE FROM subscriptions_items WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to delete subscription");
      }
    },
  };
}
