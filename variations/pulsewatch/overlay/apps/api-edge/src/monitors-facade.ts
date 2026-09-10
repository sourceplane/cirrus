import type { Env } from "./env.js";
import { errorResponse } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { resolveActor } from "./resolve-actor.js";

// Uptime monitoring (Pulsewatch variation) — user-scoped. Owner routes live
// under /v1/me and need a session; the status page at /v1/status/:handle is
// anonymous, because a status page nobody can read is not a status page.
const ME_RE = /^\/v1\/me\/(monitors(\/[^/]+(\/(checks|check))?)?|incidents|status-page)$/;
const PUBLIC_RE = /^\/v1\/status\/[a-z0-9_-]+$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isMonitorsRoute(pathname: string): boolean {
  return ME_RE.test(pathname) || PUBLIC_RE.test(pathname);
}

/** Public: the status page read, and nothing else. */
export function isPublicMonitorsRead(pathname: string, method: string): boolean {
  return method === "GET" && PUBLIC_RE.test(pathname);
}

export async function handleMonitorsRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  const allowed = ["GET", "POST", "PATCH", "PUT", "DELETE"];
  if (!allowed.includes(request.method)) {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const forward = async (): Promise<Response> => {
    if (!env.MONITORS_WORKER) {
      return errorResponse("internal_error", "Monitors service unavailable", 503, requestId);
    }

    const headers = new Headers();
    headers.set("x-request-id", requestId);

    if (!isPublicMonitorsRead(pathname, request.method)) {
      if (!env.IDENTITY_WORKER) {
        return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
      }
      const actor = await resolveActor(request, env, requestId);
      if ("error" in actor) return actor.error;
      headers.set("x-actor-subject-id", actor.subjectId);
      headers.set("x-actor-subject-type", actor.subjectType);
      headers.set("x-actor-email", actor.email);
    }

    for (const name of FORWARDED_HEADERS) {
      if (name === "x-request-id") continue;
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const url = new URL(request.url);
    const target = new URL(pathname + url.search, "https://monitors.internal");
    try {
      const init: RequestInit = { method: request.method, headers };
      if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
        init.body = request.body;
      }
      const downstream = await env.MONITORS_WORKER.fetch(target.toString(), init);
      return new Response(downstream.body, { status: downstream.status, headers: downstream.headers });
    } catch {
      return errorResponse("internal_error", "Monitors service unavailable", 503, requestId);
    }
  };

  if (request.method === "GET") return forward();
  return replayOrExecute(request, requestId, env, "monitors", forward);
}
