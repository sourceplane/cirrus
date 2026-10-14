import type { SqlExecutor } from "../d1/executor.js";
import { parseJsonColumn } from "../json.js";
import { decodeCursor, pageLimit, paginate } from "../cursor.js";
import type {
  CreateSubmissionInput,
  FormsRepository,
  FormsResult,
  ListSubmissionsInput,
  StoredSubmission,
  SubmissionStatus,
} from "./types.js";

const COLUMNS = "id, form, fields, status, visitor, created_at, updated_at";

function mapSubmission(row: Record<string, unknown>): StoredSubmission {
  const raw = parseJsonColumn<Record<string, unknown>>(row.fields, {});
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") fields[k] = v;
  return {
    id: row.id as string,
    form: row.form as string,
    fields,
    status: row.status as SubmissionStatus,
    visitor: (row.visitor as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function internal(err: unknown): FormsResult<never> {
  return { ok: false, error: { kind: "internal", message: err instanceof Error ? err.message : String(err) } };
}

const NOT_FOUND: FormsResult<never> = { ok: false, error: { kind: "not_found" } };

export function createFormsRepository(executor: SqlExecutor): FormsRepository {
  return {
    async create(input: CreateSubmissionInput) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `INSERT INTO forms_submissions (id, form, fields, status, visitor, created_at, updated_at)
           VALUES ($1, $2, $3, 'new', $4, $5, $5)
           RETURNING ${COLUMNS}`,
          [input.id, input.form, JSON.stringify(input.fields), input.visitor, input.now],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapSubmission(row) } : internal("insert returned no row");
      } catch (err) {
        return internal(err);
      }
    },

    async findById(id) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `SELECT ${COLUMNS} FROM forms_submissions WHERE id = $1 LIMIT 1`,
          [id],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapSubmission(row) } : NOT_FOUND;
      } catch (err) {
        return internal(err);
      }
    },

    async list(input: ListSubmissionsInput) {
      const limit = pageLimit(input.limit, 50, 500);
      const cursor = decodeCursor(input.cursor);
      const where: string[] = [];
      const params: unknown[] = [];
      if (input.form) {
        params.push(input.form);
        where.push(`form = $${params.length}`);
      }
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
        `SELECT ${COLUMNS} FROM forms_submissions` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY created_at DESC, id DESC LIMIT $${params.length}`;
      try {
        const result = await executor.execute<Record<string, unknown>>(sql, params);
        return { ok: true, value: paginate(result.rows.map(mapSubmission), limit) };
      } catch (err) {
        return internal(err);
      }
    },

    async updateStatus(id, status, now) {
      try {
        const result = await executor.execute<Record<string, unknown>>(
          `UPDATE forms_submissions SET status = $2, updated_at = $3 WHERE id = $1 RETURNING ${COLUMNS}`,
          [id, status, now],
        );
        const row = result.rows[0];
        return row ? { ok: true, value: mapSubmission(row) } : NOT_FOUND;
      } catch (err) {
        return internal(err);
      }
    },

    async counts() {
      try {
        const result = await executor.execute<{ total: number; fresh: number }>(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh
             FROM forms_submissions`,
        );
        const row = result.rows[0];
        return { ok: true, value: { new: Number(row?.fresh ?? 0), total: Number(row?.total ?? 0) } };
      } catch (err) {
        return internal(err);
      }
    },
  };
}
