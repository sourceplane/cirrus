import type { Check, Incident, Monitor, StatusPage } from "@saas/db/monitors";
import type {
  PublicCheck,
  PublicIncident,
  PublicMonitor,
  PublicStatusMonitor,
  PublicStatusPage,
} from "@saas/contracts/monitors";
import { checkPublicId, incidentPublicId, monitorPublicId } from "./ids.js";

/** The rolled-up numbers a monitor is shown with. */
export interface MonitorStats {
  uptime24h: number | null;
  uptime7d: number | null;
  avgLatencyMs24h: number | null;
}

export const EMPTY_STATS: MonitorStats = { uptime24h: null, uptime7d: null, avgLatencyMs24h: null };

export function toPublicMonitor(m: Monitor, stats: MonitorStats = EMPTY_STATS): PublicMonitor {
  return {
    id: monitorPublicId(m.id),
    name: m.name,
    url: m.url,
    method: m.method,
    intervalSec: m.intervalSec,
    expectedStatus: m.expectedStatus,
    enabled: m.enabled,
    status: m.lastStatus,
    lastCheckedAt: m.lastCheckedAt ? m.lastCheckedAt.toISOString() : null,
    ...stats,
    createdAt: m.createdAt.toISOString(),
  };
}

/** The public view: what is up, not where it lives. */
export function toPublicStatusMonitor(m: Monitor, stats: MonitorStats = EMPTY_STATS): PublicStatusMonitor {
  return {
    id: monitorPublicId(m.id),
    name: m.name,
    status: m.lastStatus,
    lastCheckedAt: m.lastCheckedAt ? m.lastCheckedAt.toISOString() : null,
    ...stats,
  };
}

export function toPublicCheck(c: Check): PublicCheck {
  return {
    id: checkPublicId(c.id),
    checkedAt: c.checkedAt.toISOString(),
    ok: c.ok,
    statusCode: c.statusCode,
    latencyMs: c.latencyMs,
    error: c.error,
  };
}

export function toPublicIncident(i: Incident, monitorName: string): PublicIncident {
  return {
    id: incidentPublicId(i.id),
    monitorId: monitorPublicId(i.monitorId),
    monitorName,
    openedAt: i.openedAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    cause: i.cause,
  };
}

export function toPublicStatusPage(p: StatusPage): PublicStatusPage {
  return {
    handle: p.handle,
    title: p.title,
    description: p.description,
    isPublic: p.isPublic,
  };
}
