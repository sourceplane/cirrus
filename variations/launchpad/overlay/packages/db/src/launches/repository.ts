import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import { parseJsonColumn } from "../json.js";
import type {
  Comment,
  CreateProductInput,
  FeedQuery,
  LaunchesRepository,
  LaunchesResult,
  Maker,
  Product,
  UpdateProductInput,
  UpsertMakerInput,
} from "./types.js";

// ── Row mappers ────────────────────────────────────────────

function mapMaker(row: Record<string, unknown>): Maker {
  return {
    userId: row.user_id as string,
    handle: row.handle as string,
    displayName: row.display_name as string,
    bio: (row.bio as string) ?? null,
    websiteUrl: (row.website_url as string) ?? null,
    twitter: (row.twitter as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    slug: row.slug as string,
    name: row.name as string,
    tagline: row.tagline as string,
    description: (row.description as string) ?? "",
    url: row.url as string,
    tags: parseJsonColumn<string[]>(row.tags, []),
    status: row.status as Product["status"],
    launchedAt: row.launched_at ? new Date(row.launched_at as string) : null,
    upvoteCount: Number(row.upvote_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    userId: row.user_id as string,
    body: row.body as string,
    createdAt: new Date(row.created_at as string),
  };
}

function internal(message: string): LaunchesResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Start of the UTC day / the 7-day window, as ISO text D1 can compare. */
export function feedWindowStart(range: FeedQuery["range"], now: Date): string | null {
  if (range === "all") return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "week") d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString();
}

// ── Repository factory ─────────────────────────────────────

export function createLaunchesRepository(executor: SqlExecutor): LaunchesRepository {
  async function one<T>(sql: string, params: unknown[], map: (r: Record<string, unknown>) => T): Promise<LaunchesResult<T | null>> {
    try {
      const r = await executor.execute<Record<string, unknown>>(sql, params);
      return { ok: true, value: r.rowCount === 0 ? null : map(r.rows[0]!) };
    } catch {
      return internal("Query failed");
    }
  }

  async function many<T>(sql: string, params: unknown[], map: (r: Record<string, unknown>) => T): Promise<LaunchesResult<T[]>> {
    try {
      const r = await executor.execute<Record<string, unknown>>(sql, params);
      return { ok: true, value: r.rows.map(map) };
    } catch {
      return internal("Query failed");
    }
  }

  return {
    // ── Makers ────────────────────────────────────────────

    getMakerByUserId(userId) {
      return one(`SELECT * FROM launches_makers WHERE user_id = $1`, [userId], mapMaker);
    },

    getMakerByHandle(handle) {
      return one(`SELECT * FROM launches_makers WHERE handle = $1`, [handle.toLowerCase()], mapMaker);
    },

    async upsertMaker(input: UpsertMakerInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO launches_makers (user_id, handle, display_name, bio, website_url, twitter, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, ${NOW}, ${NOW})
           ON CONFLICT (user_id) DO UPDATE SET
             handle = excluded.handle,
             display_name = excluded.display_name,
             bio = excluded.bio,
             website_url = excluded.website_url,
             twitter = excluded.twitter,
             updated_at = ${NOW}
           RETURNING *`,
          [input.userId, input.handle.toLowerCase(), input.displayName, input.bio ?? null, input.websiteUrl ?? null, input.twitter ?? null],
        );
        if (r.rowCount === 0) return internal("Upsert returned no row");
        return { ok: true, value: mapMaker(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "handle" } };
        return internal("Failed to save maker profile");
      }
    },

    // ── Products (owner) ──────────────────────────────────

    async createProduct(input: CreateProductInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO launches_products (id, user_id, slug, name, tagline, description, url, tags, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', ${NOW}, ${NOW})
           ON CONFLICT (slug) DO NOTHING
           RETURNING *`,
          [input.id, input.userId, input.slug, input.name, input.tagline, input.description ?? "", input.url, JSON.stringify(input.tags ?? [])],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "conflict", entity: "slug" } };
        return { ok: true, value: mapProduct(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "slug" } };
        return internal("Failed to create product");
      }
    },

    listProductsByUser(userId) {
      return many(
        `SELECT * FROM launches_products WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
        [userId],
        mapProduct,
      );
    },

    async getProductForUser(userId, productId) {
      const r = await one(`SELECT * FROM launches_products WHERE user_id = $1 AND id = $2`, [userId, productId], mapProduct);
      if (!r.ok) return r;
      if (!r.value) return { ok: false, error: { kind: "not_found" } };
      return { ok: true, value: r.value };
    },

    async updateProduct(userId, productId, input: UpdateProductInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE launches_products
           SET name = COALESCE($3, name),
               tagline = COALESCE($4, tagline),
               description = COALESCE($5, description),
               url = COALESCE($6, url),
               tags = COALESCE($7, tags),
               status = COALESCE($8, status),
               launched_at = CASE WHEN $8 = 'draft' THEN NULL ELSE launched_at END,
               updated_at = ${NOW}
           WHERE user_id = $1 AND id = $2
           RETURNING *`,
          [
            userId,
            productId,
            input.name ?? null,
            input.tagline ?? null,
            input.description ?? null,
            input.url ?? null,
            input.tags ? JSON.stringify(input.tags) : null,
            input.status ?? null,
          ],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapProduct(r.rows[0]!) };
      } catch {
        return internal("Failed to update product");
      }
    },

    async launchProduct(userId, productId, launchedAt) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE launches_products
           SET status = 'live', launched_at = COALESCE(launched_at, $3), updated_at = ${NOW}
           WHERE user_id = $1 AND id = $2
           RETURNING *`,
          [userId, productId, launchedAt.toISOString()],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapProduct(r.rows[0]!) };
      } catch {
        return internal("Failed to launch product");
      }
    },

    async deleteProduct(userId, productId) {
      try {
        // Children first: D1 enforces the FK and there is no cascade declared.
        await executor.execute(`DELETE FROM launches_upvotes WHERE product_id IN (SELECT id FROM launches_products WHERE user_id = $1 AND id = $2)`, [userId, productId]);
        await executor.execute(`DELETE FROM launches_comments WHERE product_id IN (SELECT id FROM launches_products WHERE user_id = $1 AND id = $2)`, [userId, productId]);
        const r = await executor.execute(`DELETE FROM launches_products WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, productId]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to delete product");
      }
    },

    // ── Public ────────────────────────────────────────────

    feed(query: FeedQuery) {
      const since = feedWindowStart(query.range, query.now);
      const limit = Math.min(Math.max(query.limit, 1), 100);
      if (since) {
        return many(
          `SELECT * FROM launches_products
           WHERE status = 'live' AND launched_at >= $1
           ORDER BY upvote_count DESC, launched_at DESC, id DESC
           LIMIT $2`,
          [since, limit],
          mapProduct,
        );
      }
      return many(
        `SELECT * FROM launches_products
         WHERE status = 'live'
         ORDER BY launched_at DESC, upvote_count DESC, id DESC
         LIMIT $1`,
        [limit],
        mapProduct,
      );
    },

    getLiveProductBySlug(slug) {
      return one(`SELECT * FROM launches_products WHERE slug = $1 AND status = 'live'`, [slug.toLowerCase()], mapProduct);
    },

    listLiveProductsByUser(userId) {
      return many(
        `SELECT * FROM launches_products WHERE user_id = $1 AND status = 'live' ORDER BY launched_at DESC, id DESC LIMIT 100`,
        [userId],
        mapProduct,
      );
    },

    // ── Votes & comments ──────────────────────────────────

    async upvote(productId, userId) {
      try {
        const ins = await executor.execute(
          `INSERT INTO launches_upvotes (product_id, user_id, created_at) VALUES ($1, $2, ${NOW})
           ON CONFLICT (product_id, user_id) DO NOTHING
           RETURNING product_id`,
          [productId, userId],
        );
        const changed = ins.rowCount > 0;
        if (changed) {
          await executor.execute(`UPDATE launches_products SET upvote_count = upvote_count + 1 WHERE id = $1`, [productId]);
        }
        const r = await executor.execute<Record<string, unknown>>(`SELECT upvote_count FROM launches_products WHERE id = $1`, [productId]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: { upvoteCount: Number(r.rows[0]!.upvote_count), changed } };
      } catch {
        return internal("Failed to upvote");
      }
    },

    async removeUpvote(productId, userId) {
      try {
        const del = await executor.execute(`DELETE FROM launches_upvotes WHERE product_id = $1 AND user_id = $2 RETURNING product_id`, [productId, userId]);
        const changed = del.rowCount > 0;
        if (changed) {
          await executor.execute(`UPDATE launches_products SET upvote_count = MAX(upvote_count - 1, 0) WHERE id = $1`, [productId]);
        }
        const r = await executor.execute<Record<string, unknown>>(`SELECT upvote_count FROM launches_products WHERE id = $1`, [productId]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: { upvoteCount: Number(r.rows[0]!.upvote_count), changed } };
      } catch {
        return internal("Failed to remove upvote");
      }
    },

    async hasUpvoted(userId, productIds) {
      if (productIds.length === 0) return { ok: true, value: new Set() };
      try {
        const placeholders = productIds.map((_, i) => `$${i + 2}`).join(", ");
        const r = await executor.execute<Record<string, unknown>>(
          `SELECT product_id FROM launches_upvotes WHERE user_id = $1 AND product_id IN (${placeholders})`,
          [userId, ...productIds],
        );
        return { ok: true, value: new Set(r.rows.map((row) => row.product_id as string)) };
      } catch {
        return internal("Failed to read upvotes");
      }
    },

    async addComment(input) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO launches_comments (id, product_id, user_id, body, created_at)
           VALUES ($1, $2, $3, $4, ${NOW})
           RETURNING *`,
          [input.id, input.productId, input.userId, input.body],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        await executor.execute(`UPDATE launches_products SET comment_count = comment_count + 1 WHERE id = $1`, [input.productId]);
        return { ok: true, value: mapComment(r.rows[0]!) };
      } catch {
        return internal("Failed to add comment");
      }
    },

    listComments(productId, limit) {
      return many(
        `SELECT * FROM launches_comments WHERE product_id = $1 ORDER BY created_at ASC, id ASC LIMIT $2`,
        [productId, Math.min(Math.max(limit, 1), 200)],
        mapComment,
      );
    },
  };
}
