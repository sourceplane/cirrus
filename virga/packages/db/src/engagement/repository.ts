import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import type {
  EngagementRepository,
  EngagementResult,
  RankedSlug,
  ReactionKind,
  ReactionSummary,
  ToggleReactionInput,
  TopInput,
} from "./types.js";

const KINDS: readonly ReactionKind[] = ["upvote", "like"];

function internal(err: unknown): EngagementResult<never> {
  return { ok: false, error: { kind: "internal", message: err instanceof Error ? err.message : String(err) } };
}

/** YYYY-MM-DD `days` before `today` (UTC). */
export function daysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The ranking formula, in one place: upvotes dominate, views break ties. */
export function rankScore(upvotes: number, views: number): number {
  return Math.round((upvotes * 3 + Math.log10(views + 1)) * 1000) / 1000;
}

export function createEngagementRepository(executor: SqlExecutor): EngagementRepository {
  async function summary(slug: string, visitor: string | null): Promise<ReactionSummary> {
    const counts: Record<ReactionKind, number> = { upvote: 0, like: 0 };
    const viewer: Record<ReactionKind, boolean> = { upvote: false, like: false };
    const totals = await executor.execute<{ kind: string; count: number }>(
      `SELECT kind, count FROM engagement_reaction_totals WHERE slug = $1`,
      [slug],
    );
    for (const row of totals.rows) {
      if (KINDS.includes(row.kind as ReactionKind)) counts[row.kind as ReactionKind] = Number(row.count);
    }
    if (visitor) {
      const held = await executor.execute<{ kind: string }>(
        `SELECT kind FROM engagement_reactions WHERE slug = $1 AND visitor = $2`,
        [slug, visitor],
      );
      for (const row of held.rows) {
        if (KINDS.includes(row.kind as ReactionKind)) viewer[row.kind as ReactionKind] = true;
      }
    }
    return { slug, counts, viewer };
  }

  return {
    async toggleReaction(input: ToggleReactionInput) {
      try {
        let turnedOn: boolean;
        try {
          await executor.execute(
            `INSERT INTO engagement_reactions (id, slug, kind, visitor, created_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [input.id, input.slug, input.kind, input.visitor, input.now],
          );
          turnedOn = true;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          turnedOn = false;
        }

        if (turnedOn) {
          await executor.execute(
            `INSERT INTO engagement_reaction_totals (slug, kind, count, updated_at)
             VALUES ($1, $2, 1, $3)
             ON CONFLICT (slug, kind) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
            [input.slug, input.kind, input.now],
          );
        } else {
          const deleted = await executor.execute<{ id: string }>(
            `DELETE FROM engagement_reactions WHERE slug = $1 AND kind = $2 AND visitor = $3 RETURNING id`,
            [input.slug, input.kind, input.visitor],
          );
          if (deleted.rowCount > 0) {
            await executor.execute(
              `UPDATE engagement_reaction_totals
                  SET count = MAX(count - 1, 0), updated_at = $3
                WHERE slug = $1 AND kind = $2`,
              [input.slug, input.kind, input.now],
            );
          }
        }
        return { ok: true, value: await summary(input.slug, input.visitor) };
      } catch (err) {
        return internal(err);
      }
    },

    async reactionSummary(slug, visitor) {
      try {
        return { ok: true, value: await summary(slug, visitor) };
      } catch (err) {
        return internal(err);
      }
    },

    async recordView(slug, day) {
      try {
        await executor.execute(
          `INSERT INTO engagement_view_counts (slug, day, count) VALUES ($1, $2, 1)
           ON CONFLICT (slug, day) DO UPDATE SET count = count + 1`,
          [slug, day],
        );
        return { ok: true, value: undefined };
      } catch (err) {
        return internal(err);
      }
    },

    async viewSummary(slug, today) {
      try {
        const since = daysBefore(today, 6);
        const result = await executor.execute<{ total: number; recent: number }>(
          `SELECT COALESCE(SUM(count), 0) AS total,
                  COALESCE(SUM(CASE WHEN day >= $2 THEN count ELSE 0 END), 0) AS recent
             FROM engagement_view_counts WHERE slug = $1`,
          [slug, since],
        );
        const row = result.rows[0];
        return {
          ok: true,
          value: { slug, total: Number(row?.total ?? 0), last7Days: Number(row?.recent ?? 0) },
        };
      } catch (err) {
        return internal(err);
      }
    },

    async top(input: TopInput) {
      const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 20)));
      const prefix = input.prefix ?? "";
      const like = `${prefix.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      try {
        const upvotes = new Map<string, number>();
        if (input.windowDays && input.windowDays > 0) {
          const since = `${daysBefore(input.today, input.windowDays - 1)}T00:00:00.000Z`;
          const rows = await executor.execute<{ slug: string; n: number }>(
            `SELECT slug, COUNT(*) AS n FROM engagement_reactions
              WHERE kind = 'upvote' AND created_at >= $1 AND slug LIKE $2 ESCAPE '\\'
              GROUP BY slug`,
            [since, like],
          );
          for (const r of rows.rows) upvotes.set(r.slug, Number(r.n));
        } else {
          const rows = await executor.execute<{ slug: string; count: number }>(
            `SELECT slug, count FROM engagement_reaction_totals
              WHERE kind = 'upvote' AND slug LIKE $1 ESCAPE '\\'`,
            [like],
          );
          for (const r of rows.rows) upvotes.set(r.slug, Number(r.count));
        }
        const views = new Map<string, number>();
        const viewRows = await executor.execute<{ slug: string; n: number }>(
          `SELECT slug, SUM(count) AS n FROM engagement_view_counts
            WHERE slug LIKE $1 ESCAPE '\\' GROUP BY slug`,
          [like],
        );
        for (const r of viewRows.rows) views.set(r.slug, Number(r.n));

        const slugs = new Set([...upvotes.keys(), ...views.keys()]);
        const ranked: RankedSlug[] = [...slugs].map((slug) => {
          const u = upvotes.get(slug) ?? 0;
          const v = views.get(slug) ?? 0;
          return { slug, upvotes: u, views: v, score: rankScore(u, v) };
        });
        ranked.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
        return { ok: true, value: ranked.slice(0, limit) };
      } catch (err) {
        return internal(err);
      }
    },

    async totals(today) {
      try {
        const reactions: Record<ReactionKind, number> = { upvote: 0, like: 0 };
        const r = await executor.execute<{ kind: string; n: number }>(
          `SELECT kind, COALESCE(SUM(count), 0) AS n FROM engagement_reaction_totals GROUP BY kind`,
        );
        for (const row of r.rows) {
          if (KINDS.includes(row.kind as ReactionKind)) reactions[row.kind as ReactionKind] = Number(row.n);
        }
        const since = daysBefore(today, 6);
        const v = await executor.execute<{ total: number; recent: number }>(
          `SELECT COALESCE(SUM(count), 0) AS total,
                  COALESCE(SUM(CASE WHEN day >= $1 THEN count ELSE 0 END), 0) AS recent
             FROM engagement_view_counts`,
          [since],
        );
        const row = v.rows[0];
        return {
          ok: true,
          value: { reactions, views: { total: Number(row?.total ?? 0), last7Days: Number(row?.recent ?? 0) } },
        };
      } catch (err) {
        return internal(err);
      }
    },
  };
}
