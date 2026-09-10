import type { Env } from "./env.js";
import { createDeps, resolveActor, type Deps } from "./deps.js";
import { errorResponse, methodNotAllowed, notFound } from "./http.js";
import { generateRequestId, parseMonitorPublicId } from "./ids.js";
import { handleHealth } from "./handlers/health.js";
import {
  createMonitor,
  deleteMonitor,
  getMonitor,
  listChecks,
  listMonitors,
  runMonitorCheck,
  updateMonitor,
} from "./handlers/monitors.js";
import { listIncidents } from "./handlers/incidents.js";
import { getMyStatusPage, getPublicStatus, upsertMyStatusPage } from "./handlers/status-page.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

// Owner surface — always authenticated.
const MONITORS_RE = /^\/v1\/me\/monitors$/;
const MONITOR_RE = /^\/v1\/me\/monitors\/([^/]+)$/;
const MONITOR_CHECKS_RE = /^\/v1\/me\/monitors\/([^/]+)\/checks$/;
const MONITOR_CHECK_NOW_RE = /^\/v1\/me\/monitors\/([^/]+)\/check$/;
const INCIDENTS_RE = /^\/v1\/me\/incidents$/;
const STATUS_PAGE_RE = /^\/v1\/me\/status-page$/;
// The status page — anonymous.
const PUBLIC_STATUS_RE = /^\/v1\/status\/([a-z0-9_-]+)$/;

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return generateRequestId();
}

/**
 * Route a request. `depsOverride` lets tests inject a fake repository and a
 * fake probe; in production the deps are built from the D1 binding per request.
 */
export async function route(request: Request, env: Env, depsOverride?: Deps): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);
  const path = url.pathname;
  const method = request.method;

  if (path === "/health" && method === "GET") return handleHealth(env, requestId);

  const deps = depsOverride ?? createDeps(env);
  if (!deps) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const actor = resolveActor(request);
  const requireUser = (): Response | null =>
    actor && actor.subjectType === "user" ? null : errorResponse("unauthenticated", "Authentication required", 401, requestId);

  try {
    let m: RegExpMatchArray | null;

    // ── The public status page ───────────────────────────
    if ((m = path.match(PUBLIC_STATUS_RE))) {
      if (method === "GET") return await getPublicStatus(deps, requestId, m[1]!);
      return methodNotAllowed(requestId);
    }

    // ── /v1/me ───────────────────────────────────────────
    if (STATUS_PAGE_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await getMyStatusPage(deps, requestId, actor!);
      if (method === "PUT") return await upsertMyStatusPage(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    if (INCIDENTS_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await listIncidents(url, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    if (MONITORS_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await listMonitors(deps, requestId, actor!);
      if (method === "POST") return await createMonitor(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    // The sub-routes come before the item route: neither suffix is an id.
    if ((m = path.match(MONITOR_CHECK_NOW_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      const id = parseMonitorPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Monitor not found", 404, requestId);
      if (method === "POST") return await runMonitorCheck(deps, requestId, actor!, id);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(MONITOR_CHECKS_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      const id = parseMonitorPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Monitor not found", 404, requestId);
      if (method === "GET") return await listChecks(url, deps, requestId, actor!, id);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(MONITOR_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      const id = parseMonitorPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Monitor not found", 404, requestId);
      if (method === "GET") return await getMonitor(deps, requestId, actor!, id);
      if (method === "PATCH") return await updateMonitor(request, deps, requestId, actor!, id);
      if (method === "DELETE") return await deleteMonitor(deps, requestId, actor!, id);
      return methodNotAllowed(requestId);
    }

    return notFound(requestId, path);
  } catch {
    return errorResponse("internal_error", "Internal error", 500, requestId);
  } finally {
    if (!depsOverride) await deps.dispose();
  }
}
