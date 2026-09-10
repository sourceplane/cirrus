// Pure input rules for the monitors surface — mirrored by the console form
// model and unit-tested on their own.

import type { HttpMethod } from "@saas/db/monitors";
import { isProbeableUrl } from "./probe.js";

export const METHODS: HttpMethod[] = ["GET", "HEAD"];
/** Fixed set: a monitor's interval is a choice, not a free number. */
export const INTERVALS = [60, 300, 900, 1800, 3600] as const;
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
export const RESERVED_HANDLES = new Set(["me", "admin", "api", "www", "status", "login", "about", "help", "support"]);

export interface MonitorValues {
  name: string;
  url: string;
  method: HttpMethod;
  intervalSec: number;
  expectedStatus: number;
  enabled: boolean;
}

export function validateMonitor(
  body: Record<string, unknown>,
  partial: boolean,
): { ok: true; value: Partial<MonitorValues> } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const value: Partial<MonitorValues> = {};

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 60) {
      fields.name = ["Name must be 1–60 characters"];
    } else value.name = body.name.trim();
  }

  if (body.url !== undefined || !partial) {
    if (typeof body.url !== "string" || body.url.length > 2048) {
      fields.url = ["A valid http(s) URL is required"];
    } else if (!isProbeableUrl(body.url)) {
      // Our own infrastructure makes this request, so private and loopback
      // addresses are refused up front rather than probed.
      fields.url = ["Must be a public http(s) URL — localhost and private addresses cannot be monitored"];
    } else value.url = body.url;
  }

  if (body.method !== undefined) {
    if (typeof body.method !== "string" || !METHODS.includes(body.method as HttpMethod)) {
      fields.method = ["Method must be GET or HEAD"];
    } else value.method = body.method as HttpMethod;
  }

  if (body.intervalSec !== undefined) {
    if (!Number.isInteger(body.intervalSec) || !(INTERVALS as readonly number[]).includes(body.intervalSec as number)) {
      fields.intervalSec = [`Interval must be one of: ${INTERVALS.join(", ")} seconds`];
    } else value.intervalSec = body.intervalSec as number;
  }

  if (body.expectedStatus !== undefined) {
    if (!Number.isInteger(body.expectedStatus) || (body.expectedStatus as number) < 100 || (body.expectedStatus as number) > 599) {
      fields.expectedStatus = ["Expected status must be between 100 and 599"];
    } else value.expectedStatus = body.expectedStatus as number;
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") fields.enabled = ["Enabled must be a boolean"];
    else value.enabled = body.enabled;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}

export interface StatusPageValues {
  handle: string;
  title: string;
  description: string | null;
  isPublic: boolean;
}

export function validateStatusPage(
  body: Record<string, unknown>,
): { ok: true; value: StatusPageValues } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};

  const handle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
  if (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle)) {
    fields.handle = ["Handle must be 3–32 lowercase letters, digits, hyphens or underscores"];
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 60) fields.title = ["Title must be 1–60 characters"];

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string" || body.description.length > 280) {
      fields.description = ["Description must be at most 280 characters"];
    } else description = body.description;
  }

  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean") {
    fields.isPublic = ["isPublic must be a boolean"];
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { handle, title, description, isPublic: body.isPublic === true } };
}
