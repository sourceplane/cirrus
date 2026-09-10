export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../d1/executor.js";

// ── Result type ─────────────────────────────────────────────

export type MonitorsRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type MonitorsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MonitorsRepositoryError };

// ── Entities ────────────────────────────────────────────────

export type HttpMethod = "GET" | "HEAD";
export type MonitorStatus = "up" | "down" | "unknown";

export interface Monitor {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: HttpMethod;
  intervalSec: number;
  expectedStatus: number;
  enabled: boolean;
  lastCheckedAt: Date | null;
  lastStatus: MonitorStatus;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Check {
  id: string;
  monitorId: string;
  userId: string;
  checkedAt: Date;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface Incident {
  id: string;
  monitorId: string;
  userId: string;
  openedAt: Date;
  resolvedAt: Date | null;
  cause: string | null;
}

export interface StatusPage {
  userId: string;
  handle: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Inputs ──────────────────────────────────────────────────

export interface CreateMonitorInput {
  id: string;
  userId: string;
  name: string;
  url: string;
  method?: HttpMethod;
  intervalSec?: number;
  expectedStatus?: number;
}

export interface UpdateMonitorInput {
  name?: string;
  url?: string;
  method?: HttpMethod;
  intervalSec?: number;
  expectedStatus?: number;
  enabled?: boolean;
}

/** The state a check writes back onto its monitor. */
export interface MonitorStateInput {
  lastCheckedAt: Date;
  lastStatus: MonitorStatus;
  consecutiveFailures: number;
}

export interface UpsertStatusPageInput {
  userId: string;
  handle: string;
  title: string;
  description?: string | null;
  isPublic?: boolean;
}

// ── Repository ──────────────────────────────────────────────

export interface MonitorsRepository {
  listMonitors(userId: string): Promise<MonitorsResult<Monitor[]>>;
  getMonitor(userId: string, id: string): Promise<MonitorsResult<Monitor>>;
  /** Owner-agnostic read for the scheduler and the public page. */
  getMonitorById(id: string): Promise<MonitorsResult<Monitor | null>>;
  createMonitor(input: CreateMonitorInput): Promise<MonitorsResult<Monitor>>;
  updateMonitor(userId: string, id: string, input: UpdateMonitorInput): Promise<MonitorsResult<Monitor>>;
  deleteMonitor(userId: string, id: string): Promise<MonitorsResult<void>>;
  /** Enabled monitors whose interval has elapsed at `now`. */
  dueMonitors(now: Date, limit: number): Promise<MonitorsResult<Monitor[]>>;
  applyMonitorState(id: string, state: MonitorStateInput): Promise<MonitorsResult<Monitor>>;

  recordCheck(input: Omit<Check, "checkedAt"> & { checkedAt: Date }): Promise<MonitorsResult<Check>>;
  listChecks(monitorId: string, limit: number): Promise<MonitorsResult<Check[]>>;
  /** Checks for a monitor since an instant — the uptime window. */
  checksSince(monitorId: string, since: Date): Promise<MonitorsResult<Check[]>>;

  openIncident(input: { id: string; monitorId: string; userId: string; openedAt: Date; cause?: string | null }): Promise<MonitorsResult<Incident>>;
  resolveOpenIncident(monitorId: string, resolvedAt: Date): Promise<MonitorsResult<void>>;
  listIncidents(userId: string, limit: number): Promise<MonitorsResult<Incident[]>>;
  listIncidentsForMonitors(monitorIds: string[], limit: number): Promise<MonitorsResult<Incident[]>>;

  getStatusPage(userId: string): Promise<MonitorsResult<StatusPage | null>>;
  getPublicStatusPageByHandle(handle: string): Promise<MonitorsResult<StatusPage | null>>;
  upsertStatusPage(input: UpsertStatusPageInput): Promise<MonitorsResult<StatusPage>>;
}
