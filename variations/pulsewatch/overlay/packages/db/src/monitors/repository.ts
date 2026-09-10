import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import { parseBooleanColumn } from "../json.js";
import type {
  Check,
  CreateMonitorInput,
  Incident,
  Monitor,
  MonitorStateInput,
  MonitorsRepository,
  MonitorsResult,
  StatusPage,
  UpdateMonitorInput,
  UpsertStatusPageInput,
} from "./types.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// ── Row mappers ────────────────────────────────────────────

function mapMonitor(row: Record<string, unknown>): Monitor {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    url: row.url as string,
    method: row.method as Monitor["method"],
    intervalSec: Number(row.interval_sec ?? 300),
    expectedStatus: Number(row.expected_status ?? 200),
    enabled: parseBooleanColumn(row.enabled),
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at as string) : null,
    lastStatus: row.last_status as Monitor["lastStatus"],
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapCheck(row: Record<string, unknown>): Check {
  return {
    id: row.id as string,
    monitorId: row.monitor_id as string,
    userId: row.user_id as string,
    checkedAt: new Date(row.checked_at as string),
    ok: parseBooleanColumn(row.ok),
    statusCode: row.status_code === null || row.status_code === undefined ? null : Number(row.status_code),
    latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    error: (row.error as string) ?? null,
  };
}

function mapIncident(row: Record<string, unknown>): Incident {
  return {
    id: row.id as string,
    monitorId: row.monitor_id as string,
    userId: row.user_id as string,
    openedAt: new Date(row.opened_at as string),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    cause: (row.cause as string) ?? null,
  };
}

function mapStatusPage(row: Record<string, unknown>): StatusPage {
  return {
    userId: row.user_id as string,
    handle: row.handle as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    isPublic: parseBooleanColumn(row.public),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function internal(message: string): MonitorsResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

// ── Repository factory ─────────────────────────────────────

export function createMonitorsRepository(executor: SqlExecutor): MonitorsRepository {
  async function many<T>(sql: string, params: unknown[], map: (r: Record<string, unknown>) => T): Promise<MonitorsResult<T[]>> {
    try {
      const r = await executor.execute<Record<string, unknown>>(sql, params);
      return { ok: true, value: r.rows.map(map) };
    } catch {
      return internal("Query failed");
    }
  }

  return {
    // ── Monitors ──────────────────────────────────────────

    listMonitors(userId) {
      return many(`SELECT * FROM monitors_monitors WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`, [userId], mapMonitor);
    },

    async getMonitor(userId, id) {
      try {
        const r = await executor.execute<Record<string, unknown>>(`SELECT * FROM monitors_monitors WHERE user_id = $1 AND id = $2`, [userId, id]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapMonitor(r.rows[0]!) };
      } catch {
        return internal("Failed to read monitor");
      }
    },

    async getMonitorById(id) {
      try {
        const r = await executor.execute<Record<string, unknown>>(`SELECT * FROM monitors_monitors WHERE id = $1`, [id]);
        return { ok: true, value: r.rowCount === 0 ? null : mapMonitor(r.rows[0]!) };
      } catch {
        return internal("Failed to read monitor");
      }
    },

    async createMonitor(input: CreateMonitorInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO monitors_monitors (id, user_id, name, url, method, interval_sec, expected_status, enabled, last_status, consecutive_failures, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'unknown', 0, ${NOW}, ${NOW})
           RETURNING *`,
          [input.id, input.userId, input.name, input.url, input.method ?? "GET", input.intervalSec ?? 300, input.expectedStatus ?? 200],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        return { ok: true, value: mapMonitor(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "monitor" } };
        return internal("Failed to create monitor");
      }
    },

    async updateMonitor(userId, id, input: UpdateMonitorInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE monitors_monitors
           SET name = COALESCE($3, name),
               url = COALESCE($4, url),
               method = COALESCE($5, method),
               interval_sec = COALESCE($6, interval_sec),
               expected_status = COALESCE($7, expected_status),
               enabled = COALESCE($8, enabled),
               updated_at = ${NOW}
           WHERE user_id = $1 AND id = $2
           RETURNING *`,
          [
            userId,
            id,
            input.name ?? null,
            input.url ?? null,
            input.method ?? null,
            input.intervalSec ?? null,
            input.expectedStatus ?? null,
            input.enabled === undefined ? null : input.enabled ? 1 : 0,
          ],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapMonitor(r.rows[0]!) };
      } catch {
        return internal("Failed to update monitor");
      }
    },

    async deleteMonitor(userId, id) {
      try {
        // Checks and incidents reference the monitor; D1 enforces the FK.
        await executor.execute(`DELETE FROM monitors_checks WHERE monitor_id IN (SELECT id FROM monitors_monitors WHERE user_id = $1 AND id = $2)`, [userId, id]);
        await executor.execute(`DELETE FROM monitors_incidents WHERE monitor_id IN (SELECT id FROM monitors_monitors WHERE user_id = $1 AND id = $2)`, [userId, id]);
        const r = await executor.execute(`DELETE FROM monitors_monitors WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to delete monitor");
      }
    },

    dueMonitors(now, limit) {
      // Due means: never checked, or the interval has elapsed.
      //
      // The comparison is on the timestamp TEXT, against a per-row threshold,
      // rather than on a julianday difference: julianday is a float, so an
      // exactly-due monitor comes out at 3599.99999 seconds and is skipped —
      // which delays every check by a whole scheduler tick. ISO-8601 text in
      // this fixed format sorts lexicographically, so the text compare is both
      // exact and index-friendly.
      return many(
        `SELECT * FROM monitors_monitors
         WHERE enabled = 1
           AND (last_checked_at IS NULL
                OR last_checked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', $1, '-' || interval_sec || ' seconds'))
         ORDER BY last_checked_at ASC NULLS FIRST, id ASC
         LIMIT $2`,
        [now.toISOString(), Math.min(Math.max(limit, 1), 200)],
        mapMonitor,
      );
    },

    async applyMonitorState(id, state: MonitorStateInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE monitors_monitors
           SET last_checked_at = $2, last_status = $3, consecutive_failures = $4, updated_at = ${NOW}
           WHERE id = $1
           RETURNING *`,
          [id, state.lastCheckedAt.toISOString(), state.lastStatus, state.consecutiveFailures],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapMonitor(r.rows[0]!) };
      } catch {
        return internal("Failed to update monitor state");
      }
    },

    // ── Checks ────────────────────────────────────────────

    async recordCheck(input) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO monitors_checks (id, monitor_id, user_id, checked_at, ok, status_code, latency_ms, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            input.id,
            input.monitorId,
            input.userId,
            input.checkedAt.toISOString(),
            input.ok ? 1 : 0,
            input.statusCode,
            input.latencyMs,
            input.error,
          ],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        return { ok: true, value: mapCheck(r.rows[0]!) };
      } catch {
        return internal("Failed to record check");
      }
    },

    listChecks(monitorId, limit) {
      return many(
        `SELECT * FROM monitors_checks WHERE monitor_id = $1 ORDER BY checked_at DESC LIMIT $2`,
        [monitorId, Math.min(Math.max(limit, 1), 500)],
        mapCheck,
      );
    },

    checksSince(monitorId, since) {
      return many(
        `SELECT * FROM monitors_checks WHERE monitor_id = $1 AND checked_at >= $2 ORDER BY checked_at DESC LIMIT 5000`,
        [monitorId, since.toISOString()],
        mapCheck,
      );
    },

    // ── Incidents ─────────────────────────────────────────

    async openIncident(input) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO monitors_incidents (id, monitor_id, user_id, opened_at, cause, created_at)
           VALUES ($1, $2, $3, $4, $5, ${NOW})
           RETURNING *`,
          [input.id, input.monitorId, input.userId, input.openedAt.toISOString(), input.cause ?? null],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        return { ok: true, value: mapIncident(r.rows[0]!) };
      } catch {
        return internal("Failed to open incident");
      }
    },

    async resolveOpenIncident(monitorId, resolvedAt) {
      try {
        await executor.execute(
          `UPDATE monitors_incidents SET resolved_at = $2 WHERE monitor_id = $1 AND resolved_at IS NULL`,
          [monitorId, resolvedAt.toISOString()],
        );
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to resolve incident");
      }
    },

    listIncidents(userId, limit) {
      // Open incidents first (they are what a person is looking for), then the
      // most recent history.
      return many(
        `SELECT * FROM monitors_incidents
         WHERE user_id = $1
         ORDER BY (resolved_at IS NULL) DESC, opened_at DESC
         LIMIT $2`,
        [userId, Math.min(Math.max(limit, 1), 200)],
        mapIncident,
      );
    },

    listIncidentsForMonitors(monitorIds, limit) {
      if (monitorIds.length === 0) return Promise.resolve({ ok: true, value: [] });
      const placeholders = monitorIds.map((_, i) => `$${i + 1}`).join(", ");
      return many(
        `SELECT * FROM monitors_incidents
         WHERE monitor_id IN (${placeholders})
         ORDER BY (resolved_at IS NULL) DESC, opened_at DESC
         LIMIT $${monitorIds.length + 1}`,
        [...monitorIds, Math.min(Math.max(limit, 1), 100)],
        mapIncident,
      );
    },

    // ── Status page ───────────────────────────────────────

    async getStatusPage(userId) {
      try {
        const r = await executor.execute<Record<string, unknown>>(`SELECT * FROM monitors_status_pages WHERE user_id = $1`, [userId]);
        return { ok: true, value: r.rowCount === 0 ? null : mapStatusPage(r.rows[0]!) };
      } catch {
        return internal("Failed to read status page");
      }
    },

    async getPublicStatusPageByHandle(handle) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `SELECT * FROM monitors_status_pages WHERE handle = $1 AND public = 1`,
          [handle.toLowerCase()],
        );
        return { ok: true, value: r.rowCount === 0 ? null : mapStatusPage(r.rows[0]!) };
      } catch {
        return internal("Failed to read status page");
      }
    },

    async upsertStatusPage(input: UpsertStatusPageInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO monitors_status_pages (user_id, handle, title, description, public, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, ${NOW}, ${NOW})
           ON CONFLICT (user_id) DO UPDATE SET
             handle = excluded.handle,
             title = excluded.title,
             description = excluded.description,
             public = excluded.public,
             updated_at = ${NOW}
           RETURNING *`,
          [input.userId, input.handle.toLowerCase(), input.title, input.description ?? null, input.isPublic ? 1 : 0],
        );
        if (r.rowCount === 0) return internal("Upsert returned no row");
        return { ok: true, value: mapStatusPage(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "handle" } };
        return internal("Failed to save status page");
      }
    },
  };
}
