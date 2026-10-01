import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import { parseJsonColumn } from "../json.js";
import { decodeCursor, pageLimit, paginate } from "../cursor.js";
import type {
  AudienceRepository,
  AudienceResult,
  ListSubscribersInput,
  StoredSubscriber,
  SubscriberStatus,
  UpsertPendingInput,
} from "./types.js";

const COLUMNS =
  "id, email, status, source, tags, created_at, updated_at, confirmed_at, unsubscribed_at";

function mapSubscriber(row: Record<string, unknown>): StoredSubscriber {
  const tags = parseJsonColumn<unknown>(row.tags, []);
  return {
    id: row.id as string,
    email: row.email as string,
    status: row.status as SubscriberStatus,
    source: (row.source as string | null) ?? null,
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    unsubscribedAt: (row.unsubscribed_at as string | null) ?? null,
  };
}

function internal(err: unknown): AudienceResult<never> {
  return { ok: false, error: { kind: "internal", message: err instanceof Error ? err.message : String(err) } };
}

const NOT_FOUND: AudienceResult<never> = { ok: false, error: { kind: "not_found" } };

export function createAudienceRepository(executor: SqlExecutor): AudienceRepository {
  async function findOne(where: string, params: unknown[]): Promise<AudienceResult<StoredSubscriber>> {
    try {
      const result = await executor.execute<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM audience_subscribers WHERE ${where} LIMIT 1`,
        params,
      );
      const row = result.rows[0];
      return row ? { ok: true, value: mapSubscriber(row) } : NOT_FOUND;
    } catch (err) {
      return internal(err);
    }
  }

  return {
    async upsertPending(input: UpsertPendingInput) {
      const existing = await findOne("email = $1", [input.email]);
      if (!existing.ok && existing.error.kind !== "not_found") return existing;

      // Brand-new address: insert pending. A concurrent first subscribe for
      // the same address loses on the unique index; treat that as "pending
      // already" and re-read rather than failing the visitor.
      if (!existing.ok) {
        try {
          const inserted = await executor.execute<Record<string, unknown>>(
            `INSERT INTO audience_subscribers
               (id, email, status, source, tags, confirm_token_hash, created_at, updated_at)
             VALUES ($1, $2, 'pending', $3, $4, $5, $6, $6)
             RETURNING ${COLUMNS}`,
            [input.id, input.email, input.source, JSON.stringify(input.tags), input.confirmTokenHash, input.now],
          );
          const row = inserted.rows[0];
          if (!row) return internal("insert returned no row");
          return {
            ok: true,
            value: { subscriber: mapSubscriber(row), previousStatus: null, needsConfirmation: true },
          };
        } catch (err) {
          if (!isUniqueViolation(err)) return internal(err);
          const raced = await findOne("email = $1", [input.email]);
          if (!raced.ok) return raced;
          return {
            ok: true,
            value: { subscriber: raced.value, previousStatus: raced.value.status, needsConfirmation: raced.value.status !== "confirmed" },
          };
        }
      }

      const current = existing.value;
      if (current.status === "confirmed") {
        return { ok: true, value: { subscriber: current, previousStatus: "confirmed", needsConfirmation: false } };
      }

      // Pending (rotate the token, re-mail) or unsubscribed (revive as pending).
      try {
        const updated = await executor.execute<Record<string, unknown>>(
          `UPDATE audience_subscribers
              SET status = 'pending',
                  confirm_token_hash = $2,
                  source = COALESCE($3, source),
                  unsubscribed_at = NULL,
                  updated_at = $4
            WHERE id = $1
            RETURNING ${COLUMNS}`,
          [current.id, input.confirmTokenHash, input.source, input.now],
        );
        const row = updated.rows[0];
        if (!row) return NOT_FOUND;
        return {
          ok: true,
          value: { subscriber: mapSubscriber(row), previousStatus: current.status, needsConfirmation: true },
        };
      } catch (err) {
        return internal(err);
      }
    },

    async confirmByToken(confirmTokenHash, now) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `UPDATE audience_subscribers
              SET status = 'confirmed',
                  confirm_token_hash = NULL,
                  confirmed_at = $2,
                  updated_at = $2
            WHERE confirm_token_hash = $1 AND status = 'pending'
            RETURNING ${COLUMNS}`,
          [confirmTokenHash, now],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapSubscriber(row) } : NOT_FOUND;
      } catch (err) {
        return internal(err);
      }
    },

    async unsubscribeById(id, now) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `UPDATE audience_subscribers
              SET status = 'unsubscribed',
                  confirm_token_hash = NULL,
                  unsubscribed_at = $2,
                  updated_at = $2
            WHERE id = $1 AND status <> 'unsubscribed'
            RETURNING ${COLUMNS}`,
          [id, now],
        );
        const row = result.rows[0];
        if (row) return { ok: true, value: mapSubscriber(row) };
        // Already unsubscribed is a success for the visitor; unknown id is not.
        const current = await findOne("id = $1", [id]);
        return current;
      } catch (err) {
        return internal(err);
      }
    },

    findById(id) {
      return findOne("id = $1", [id]);
    },

    findByEmail(email) {
      return findOne("email = $1", [email]);
    },

    async list(input: ListSubscribersInput) {
      const limit = pageLimit(input.limit, 50, 500);
      const cursor = decodeCursor(input.cursor);
      const where: string[] = [];
      const params: unknown[] = [];
      if (input.status) {
        params.push(input.status);
        where.push(`status = $${params.length}`);
      }
      if (cursor) {
        params.push(cursor.createdAt, cursor.id);
        where.push(`(created_at < $${params.length - 1} OR (created_at = $${params.length - 1} AND id < $${params.length}))`);
      }
      params.push(limit + 1);
      const sql =
        `SELECT ${COLUMNS} FROM audience_subscribers` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY created_at DESC, id DESC LIMIT $${params.length}`;
      try {
        const result = await executor.execute<Record<string, unknown>>(sql, params);
        return { ok: true, value: paginate(result.rows.map(mapSubscriber), limit) };
      } catch (err) {
        return internal(err);
      }
    },

    async countByStatus() {
      try {
        const result = await executor.execute<{ status: string; n: number }>(
          `SELECT status, COUNT(*) AS n FROM audience_subscribers GROUP BY status`,
        );
        const counts: Record<SubscriberStatus, number> = { pending: 0, confirmed: 0, unsubscribed: 0 };
        for (const row of result.rows) {
          if (row.status in counts) counts[row.status as SubscriberStatus] = Number(row.n);
        }
        return { ok: true, value: counts };
      } catch (err) {
        return internal(err);
      }
    },
  };
}
