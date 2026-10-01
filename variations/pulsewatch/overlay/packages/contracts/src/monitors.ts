/**
 * Monitors contract types — uptime monitoring and public status pages
 * (Pulsewatch variation).
 *
 * User-scoped: the owner surface lives under `/v1/me/...` and needs a session;
 * the status page (`/v1/status/:handle`) is anonymous. No organization appears
 * in any path, and the public shape never carries the monitored URL.
 */

export type HttpMethod = "GET" | "HEAD";
export type MonitorStatus = "up" | "down" | "unknown";

export interface PublicMonitor {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  intervalSec: number;
  expectedStatus: number;
  enabled: boolean;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  /** Percentages over the trailing window, or null with nothing to measure. */
  uptime24h: number | null;
  uptime7d: number | null;
  avgLatencyMs24h: number | null;
  createdAt: string;
}

export interface PublicCheck {
  id: string;
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface PublicIncident {
  id: string;
  monitorId: string;
  monitorName: string;
  openedAt: string;
  resolvedAt: string | null;
  cause: string | null;
}

export interface PublicStatusPage {
  handle: string;
  title: string;
  description: string | null;
  isPublic: boolean;
}

// ── Owner surface ───────────────────────────────────────────

export interface ListMonitorsResponse {
  monitors: PublicMonitor[];
}

export interface CreateMonitorRequest {
  name: string;
  url: string;
  method?: HttpMethod;
  intervalSec?: number;
  expectedStatus?: number;
}

export interface UpdateMonitorRequest {
  name?: string;
  url?: string;
  method?: HttpMethod;
  intervalSec?: number;
  expectedStatus?: number;
  enabled?: boolean;
}

export interface MonitorResponse {
  monitor: PublicMonitor;
}

export interface ListChecksResponse {
  checks: PublicCheck[];
}

export interface RunCheckResponse {
  check: PublicCheck;
  monitor: PublicMonitor;
}

export interface ListIncidentsResponse {
  incidents: PublicIncident[];
}

export interface GetStatusPageResponse {
  /** null until the owner has claimed a handle. */
  statusPage: PublicStatusPage | null;
}

export interface UpsertStatusPageRequest {
  handle: string;
  title: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface StatusPageResponse {
  statusPage: PublicStatusPage;
}

// ── Public status page ──────────────────────────────────────

/** The public view of a monitor: no URL, no interval, no owner. */
export interface PublicStatusMonitor {
  id: string;
  name: string;
  status: MonitorStatus;
  uptime24h: number | null;
  uptime7d: number | null;
  avgLatencyMs24h: number | null;
  lastCheckedAt: string | null;
}

export interface PublicStatusResponse {
  page: Omit<PublicStatusPage, "isPublic">;
  monitors: PublicStatusMonitor[];
  incidents: PublicIncident[];
}
