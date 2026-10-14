/**
 * Pure view-model helpers for the uptime monitor. Dependency-free so they are
 * unit-testable; the worker owns the authoritative validation and the incident
 * rules.
 */

import type { HttpMethod, MonitorStatus } from "@saas/contracts/monitors";

export const INTERVALS: { value: number; label: string }[] = [
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
  { value: 1800, label: "Every 30 minutes" },
  { value: 3600, label: "Every hour" },
];

export const METHODS: HttpMethod[] = ["GET", "HEAD"];

export function statusTone(status: MonitorStatus): "success" | "destructive" | "secondary" {
  if (status === "up") return "success";
  if (status === "down") return "destructive";
  return "secondary";
}

export function statusLabel(status: MonitorStatus): string {
  if (status === "up") return "Up";
  if (status === "down") return "Down";
  return "Not checked yet";
}

/** The banner a status page opens with. */
export function overallStatus(statuses: MonitorStatus[]): { label: string; tone: "success" | "destructive" | "secondary" } {
  if (statuses.length === 0) return { label: "Nothing monitored yet", tone: "secondary" };
  const down = statuses.filter((s) => s === "down").length;
  if (down === 0) return { label: "All systems operational", tone: "success" };
  return { label: `${down} ${down === 1 ? "monitor is" : "monitors are"} down`, tone: "destructive" };
}

/** "99.9%" — or a dash when nothing has been measured yet. */
export function formatUptime(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct.toFixed(1)}%`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function intervalLabel(intervalSec: number): string {
  return INTERVALS.find((i) => i.value === intervalSec)?.label ?? `Every ${intervalSec}s`;
}

/** How long an incident lasted, or has been running. */
export function formatDuration(openedAt: string, resolvedAt: string | null, now: Date = new Date()): string {
  const start = new Date(openedAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "—";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** "3m ago" — for last-checked timestamps. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const s = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
const RESERVED = new Set(["me", "admin", "api", "www", "status", "login", "about", "help", "support"]);

/** Mirror of the worker's handle rule, for inline form feedback. */
export function handleValid(handle: string): boolean {
  const h = handle.trim().toLowerCase();
  return HANDLE_RE.test(h) && !RESERVED.has(h);
}

export interface MonitorFormValues {
  name: string;
  url: string;
  method: HttpMethod;
  intervalSec: string;
  expectedStatus: string;
}

export function emptyMonitorForm(): MonitorFormValues {
  return { name: "", url: "", method: "GET", intervalSec: "300", expectedStatus: "200" };
}

export function validateMonitorForm(v: MonitorFormValues): Partial<Record<keyof MonitorFormValues, string>> {
  const errors: Partial<Record<keyof MonitorFormValues, string>> = {};
  const name = v.name.trim();
  if (name.length < 1 || name.length > 60) errors.name = "1–60 characters";
  try {
    const u = new URL(v.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") errors.url = "Must be an http(s) URL";
    else if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(u.hostname.toLowerCase())) {
      errors.url = "Must be reachable from the internet";
    }
  } catch {
    errors.url = "Must be a valid URL";
  }
  if (!INTERVALS.some((i) => i.value === Number(v.intervalSec))) errors.intervalSec = "Pick an interval";
  const status = Number(v.expectedStatus);
  if (!Number.isInteger(status) || status < 100 || status > 599) errors.expectedStatus = "A status code, 100–599";
  return errors;
}
