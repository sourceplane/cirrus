import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import { decodeCursor, pageLimit, paginate } from "../cursor.js";
import type {
  CreateIssueInput,
  DeliveryStatus,
  IssueStatus,
  ListIssuesInput,
  MarkDeliveryInput,
  NewsletterRepository,
  NewsletterResult,
  QueuedDelivery,
  StoredDelivery,
  StoredIssue,
} from "./types.js";

const ISSUE_COLUMNS = "id, slug, subject, html, text, status, created_at, updated_at, sent_at";
const DELIVERY_COLUMNS = "id, issue_id, subscriber_id, status, provider_message_id, error, attempted_at";

function mapIssue(row: Record<string, unknown>): StoredIssue {
  return {
    id: row.id as string,
    slug: row.slug as string,
    subject: row.subject as string,
    html: row.html as string,
    text: row.text as string,
    status: row.status as IssueStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    sentAt: (row.sent_at as string | null) ?? null,
  };
}

function mapDelivery(row: Record<string, unknown>): StoredDelivery {
  return {
    id: row.id as string,
    issueId: row.issue_id as string,
    subscriberId: row.subscriber_id as string,
    status: row.status as DeliveryStatus,
    providerMessageId: (row.provider_message_id as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    attemptedAt: (row.attempted_at as string | null) ?? null,
  };
}

function internal(err: unknown): NewsletterResult<never> {
  return { ok: false, error: { kind: "internal", message: err instanceof Error ? err.message : String(err) } };
}

const NOT_FOUND: NewsletterResult<never> = { ok: false, error: { kind: "not_found" } };

export function createNewsletterRepository(executor: SqlExecutor): NewsletterRepository {
  async function findIssue(where: string, params: unknown[]): Promise<NewsletterResult<StoredIssue>> {
    try {
      const result = await executor.execute<Record<string, unknown>>(
        `SELECT ${ISSUE_COLUMNS} FROM newsletter_issues WHERE ${where} LIMIT 1`,
        params,
      );
      const row = result.rows[0];
      return row ? { ok: true, value: mapIssue(row) } : NOT_FOUND;
    } catch (err) {
      return internal(err);
    }
  }

  return {
    async createIssue(input: CreateIssueInput) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `INSERT INTO newsletter_issues (id, slug, subject, html, text, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'draft', $6, $6)
           RETURNING ${ISSUE_COLUMNS}`,
          [input.id, input.slug, input.subject, input.html, input.text, input.now],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapIssue(row) } : internal("insert returned no row");
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "issue" } };
        return internal(err);
      }
    },

    findIssueById(id) {
      return findIssue("id = $1", [id]);
    },

    findIssueBySlug(slug) {
      return findIssue("slug = $1", [slug]);
    },

    async listIssues(input: ListIssuesInput) {
      const limit = pageLimit(input.limit, 50, 500);
      const cursor = decodeCursor(input.cursor);
      const params: unknown[] = [];
      let where = "";
      if (cursor) {
        params.push(cursor.createdAt, cursor.id);
        where = ` WHERE (created_at < $1 OR (created_at = $1 AND id < $2))`;
      }
      params.push(limit + 1);
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `SELECT ${ISSUE_COLUMNS} FROM newsletter_issues${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
          params,
        );
        return { ok: true, value: paginate(result.rows.map(mapIssue), limit) };
      } catch (err) {
        return internal(err);
      }
    },

    async markIssueStatus(id, status, now) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `UPDATE newsletter_issues
              SET status = $2,
                  updated_at = $3,
                  sent_at = CASE WHEN $2 = 'sent' THEN $3 ELSE sent_at END
            WHERE id = $1
            RETURNING ${ISSUE_COLUMNS}`,
          [id, status, now],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapIssue(row) } : NOT_FOUND;
      } catch (err) {
        return internal(err);
      }
    },

    // The one cross-context read in the data plane: the recipient set IS the
    // audience's confirmed subscribers at send time, and copying it into the
    // deliveries table in one statement is the atomicity D1 can give us.
    async enqueueDeliveries(issueId) {
      try {
        const result = await executor.execute<{ id: string }>(
          `INSERT INTO newsletter_deliveries (id, issue_id, subscriber_id, status)
           SELECT 'dlv_' || lower(hex(randomblob(16))), $1, s.id, 'queued'
             FROM audience_subscribers s
            WHERE s.status = 'confirmed'
              AND NOT EXISTS (
                SELECT 1 FROM newsletter_deliveries d
                 WHERE d.issue_id = $1 AND d.subscriber_id = s.id
              )
           RETURNING id`,
          [issueId],
        );
        return { ok: true, value: result.rowCount };
      } catch (err) {
        return internal(err);
      }
    },

    async nextQueuedDeliveries(issueId, limit) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `SELECT d.id, d.issue_id, d.subscriber_id, d.status, d.provider_message_id, d.error, d.attempted_at,
                  s.email
             FROM newsletter_deliveries d
             JOIN audience_subscribers s ON s.id = d.subscriber_id
            WHERE d.issue_id = $1 AND d.status = 'queued'
            ORDER BY d.id
            LIMIT $2`,
          [issueId, Math.max(1, Math.floor(limit))],
        );
        const rows: QueuedDelivery[] = result.rows.map((row) => ({
          ...mapDelivery(row),
          email: row.email as string,
        }));
        return { ok: true, value: rows };
      } catch (err) {
        return internal(err);
      }
    },

    async markDelivery(input: MarkDeliveryInput) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `UPDATE newsletter_deliveries
              SET status = $2, provider_message_id = $3, error = $4, attempted_at = $5
            WHERE id = $1
            RETURNING ${DELIVERY_COLUMNS}`,
          [input.id, input.status, input.providerMessageId, input.error, input.attemptedAt],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapDelivery(row) } : NOT_FOUND;
      } catch (err) {
        return internal(err);
      }
    },

    async deliveryCounts(issueId) {
      try {
        const result = await executor.execute<{ status: string; n: number }>(
          `SELECT status, COUNT(*) AS n FROM newsletter_deliveries WHERE issue_id = $1 GROUP BY status`,
          [issueId],
        );
        const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 };
        for (const row of result.rows) {
          if (row.status in counts) counts[row.status as DeliveryStatus] = Number(row.n);
        }
        return { ok: true, value: counts };
      } catch (err) {
        return internal(err);
      }
    },

    async countIssues() {
      try {
        const result = await executor.execute<{ sent: number; drafts: number }>(
          `SELECT SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                  SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts
             FROM newsletter_issues`,
        );
        const row = result.rows[0];
        return { ok: true, value: { sent: Number(row?.sent ?? 0), drafts: Number(row?.drafts ?? 0) } };
      } catch (err) {
        return internal(err);
      }
    },
  };
}
