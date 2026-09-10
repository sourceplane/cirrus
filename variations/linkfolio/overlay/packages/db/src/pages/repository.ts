import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import { parseBooleanColumn, parseJsonColumn } from "../json.js";
import type {
  Block,
  ClickRow,
  CreateBlockInput,
  Page,
  PageTheme,
  PagesRepository,
  PagesResult,
  UpdateBlockInput,
  UpsertPageInput,
} from "./types.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// ── Row mappers ────────────────────────────────────────────

function mapPage(row: Record<string, unknown>): Page {
  return {
    userId: row.user_id as string,
    handle: row.handle as string,
    title: row.title as string,
    bio: (row.bio as string) ?? null,
    theme: parseJsonColumn<PageTheme>(row.theme, {}),
    published: parseBooleanColumn(row.published),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapBlock(row: Record<string, unknown>): Block {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    kind: row.kind as Block["kind"],
    title: row.title as string,
    url: (row.url as string) ?? null,
    description: (row.description as string) ?? null,
    priceCents: row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents),
    currency: (row.currency as string) ?? null,
    position: Number(row.position ?? 0),
    enabled: parseBooleanColumn(row.enabled),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function internal(message: string): PagesResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

// ── Repository factory ─────────────────────────────────────

export function createPagesRepository(executor: SqlExecutor): PagesRepository {
  async function one<T>(sql: string, params: unknown[], map: (r: Record<string, unknown>) => T): Promise<PagesResult<T | null>> {
    try {
      const r = await executor.execute<Record<string, unknown>>(sql, params);
      return { ok: true, value: r.rowCount === 0 ? null : map(r.rows[0]!) };
    } catch {
      return internal("Query failed");
    }
  }

  async function many<T>(sql: string, params: unknown[], map: (r: Record<string, unknown>) => T): Promise<PagesResult<T[]>> {
    try {
      const r = await executor.execute<Record<string, unknown>>(sql, params);
      return { ok: true, value: r.rows.map(map) };
    } catch {
      return internal("Query failed");
    }
  }

  return {
    // ── Page ──────────────────────────────────────────────

    getPageByUserId(userId) {
      return one(`SELECT * FROM pages_pages WHERE user_id = $1`, [userId], mapPage);
    },

    getPublishedPageByHandle(handle) {
      return one(`SELECT * FROM pages_pages WHERE handle = $1 AND published = 1`, [handle.toLowerCase()], mapPage);
    },

    async upsertPage(input: UpsertPageInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO pages_pages (user_id, handle, title, bio, theme, published, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, ${NOW}, ${NOW})
           ON CONFLICT (user_id) DO UPDATE SET
             handle = excluded.handle,
             title = excluded.title,
             bio = excluded.bio,
             theme = excluded.theme,
             published = excluded.published,
             updated_at = ${NOW}
           RETURNING *`,
          [
            input.userId,
            input.handle.toLowerCase(),
            input.title,
            input.bio ?? null,
            JSON.stringify(input.theme ?? {}),
            input.published ? 1 : 0,
          ],
        );
        if (r.rowCount === 0) return internal("Upsert returned no row");
        return { ok: true, value: mapPage(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "handle" } };
        return internal("Failed to save page");
      }
    },

    // ── Blocks ────────────────────────────────────────────

    listBlocks(userId) {
      return many(`SELECT * FROM pages_blocks WHERE user_id = $1 ORDER BY position ASC, id ASC LIMIT 200`, [userId], mapBlock);
    },

    listEnabledBlocks(userId) {
      return many(
        `SELECT * FROM pages_blocks WHERE user_id = $1 AND enabled = 1 ORDER BY position ASC, id ASC LIMIT 200`,
        [userId],
        mapBlock,
      );
    },

    async getBlock(userId, blockId) {
      const r = await one(`SELECT * FROM pages_blocks WHERE user_id = $1 AND id = $2`, [userId, blockId], mapBlock);
      if (!r.ok) return r;
      if (!r.value) return { ok: false, error: { kind: "not_found" } };
      return { ok: true, value: r.value };
    },

    async createBlock(input: CreateBlockInput) {
      try {
        // Append: one past the current maximum, computed in the same statement
        // so two concurrent adds cannot both claim the same position.
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO pages_blocks (id, user_id, kind, title, url, description, price_cents, currency, position, enabled, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                   (SELECT COALESCE(MAX(position), -1) + 1 FROM pages_blocks WHERE user_id = $2),
                   1, ${NOW}, ${NOW})
           RETURNING *`,
          [
            input.id,
            input.userId,
            input.kind,
            input.title,
            input.url ?? null,
            input.description ?? null,
            input.priceCents ?? null,
            input.currency ?? null,
          ],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        return { ok: true, value: mapBlock(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "block" } };
        return internal("Failed to create block");
      }
    },

    async updateBlock(userId, blockId, input: UpdateBlockInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE pages_blocks
           SET title = COALESCE($3, title),
               url = CASE WHEN $4 = 1 THEN $5 ELSE url END,
               description = CASE WHEN $6 = 1 THEN $7 ELSE description END,
               price_cents = CASE WHEN $8 = 1 THEN $9 ELSE price_cents END,
               currency = CASE WHEN $10 = 1 THEN $11 ELSE currency END,
               enabled = COALESCE($12, enabled),
               updated_at = ${NOW}
           WHERE user_id = $1 AND id = $2
           RETURNING *`,
          [
            userId,
            blockId,
            input.title ?? null,
            input.url !== undefined ? 1 : 0,
            input.url ?? null,
            input.description !== undefined ? 1 : 0,
            input.description ?? null,
            input.priceCents !== undefined ? 1 : 0,
            input.priceCents ?? null,
            input.currency !== undefined ? 1 : 0,
            input.currency ?? null,
            input.enabled === undefined ? null : input.enabled ? 1 : 0,
          ],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapBlock(r.rows[0]!) };
      } catch {
        return internal("Failed to update block");
      }
    },

    async deleteBlock(userId, blockId) {
      try {
        // Clicks reference the block: D1 enforces the FK, so they go first.
        await executor.execute(
          `DELETE FROM pages_clicks WHERE block_id IN (SELECT id FROM pages_blocks WHERE user_id = $1 AND id = $2)`,
          [userId, blockId],
        );
        const r = await executor.execute(`DELETE FROM pages_blocks WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, blockId]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to delete block");
      }
    },

    async reorderBlocks(userId, ids) {
      try {
        // Two passes: park every row in a range that cannot collide, then write
        // the final positions. D1 has no interactive transaction, so a single
        // pass would trip the (user_id, position) ordering mid-flight.
        for (let i = 0; i < ids.length; i++) {
          await executor.execute(`UPDATE pages_blocks SET position = $3 WHERE user_id = $1 AND id = $2`, [userId, ids[i]!, 1000 + i]);
        }
        for (let i = 0; i < ids.length; i++) {
          await executor.execute(`UPDATE pages_blocks SET position = $3, updated_at = ${NOW} WHERE user_id = $1 AND id = $2`, [userId, ids[i]!, i]);
        }
        return many(`SELECT * FROM pages_blocks WHERE user_id = $1 ORDER BY position ASC, id ASC`, [userId], mapBlock);
      } catch {
        return internal("Failed to reorder blocks");
      }
    },

    // ── Clicks ────────────────────────────────────────────

    async recordClick(input) {
      try {
        await executor.execute(
          `INSERT INTO pages_clicks (id, block_id, user_id, occurred_at, referrer) VALUES ($1, $2, $3, ${NOW}, $4)`,
          [input.id, input.blockId, input.userId, input.referrer ?? null],
        );
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to record click");
      }
    },

    async clicksSince(userId, since): Promise<PagesResult<ClickRow[]>> {
      const r = await many(
        `SELECT block_id, occurred_at FROM pages_clicks WHERE user_id = $1 AND occurred_at >= $2 ORDER BY occurred_at DESC LIMIT 10000`,
        [userId, since.toISOString()],
        (row) => ({ blockId: row.block_id as string, occurredAt: new Date(row.occurred_at as string) }),
      );
      return r;
    },
  };
}
