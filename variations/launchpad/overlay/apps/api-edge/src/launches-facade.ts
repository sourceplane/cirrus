import type { Env } from "./env.js";
import { errorResponse } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { resolveActor } from "./resolve-actor.js";

// The launch directory (Launchpad variation) — user-scoped, no organization in
// any path. Owner routes live under /v1/me and need a session; the directory's
// reads are public (an optional session marks the viewer's own upvotes) and
// its writes (vote, comment) need a session.
const ME_RE = /^\/v1\/me\/(products(\/[^/]+(\/launch)?)?|profile)$/;
const LAUNCHES_RE = /^\/v1\/launches(\/[a-z0-9-]+(\/(comments|upvote))?)?$/;
const MAKERS_RE = /^\/v1\/makers\/[a-z0-9_-]+$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isLaunchesRoute(pathname: string): boolean {
  return ME_RE.test(pathname) || LAUNCHES_RE.test(pathname) || MAKERS_RE.test(pathname);
}

/** Public: GET on the directory and maker pages. Everything else needs a user. */
export function isPublicLaunchesRead(pathname: string, method: string): boolean {
  return method === "GET" && (LAUNCHES_RE.test(pathname) || MAKERS_RE.test(pathname));
}

export async function handleLaunchesRoute(
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
    if (!env.LAUNCHES_WORKER) {
      return errorResponse("internal_error", "Launches service unavailable", 503, requestId);
    }

    const headers = new Headers();
    headers.set("x-request-id", requestId);

    const isPublic = isPublicLaunchesRead(pathname, request.method);
    if (isPublic) {
      // Anonymous reads are fine; a bearer token, when present and valid, tags
      // the viewer so their own upvotes render. A bad token is ignored, never
      // an error — the page must load for everyone.
      if (request.headers.get("authorization") && env.IDENTITY_WORKER) {
        const actor = await resolveActor(request, env, requestId);
        if (!("error" in actor)) {
          headers.set("x-actor-subject-id", actor.subjectId);
          headers.set("x-actor-subject-type", actor.subjectType);
          headers.set("x-actor-email", actor.email);
        }
      }
    } else {
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
    const target = new URL(pathname + url.search, "https://launches.internal");
    try {
      const init: RequestInit = { method: request.method, headers };
      if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
        init.body = request.body;
      }
      const downstream = await env.LAUNCHES_WORKER.fetch(target.toString(), init);
      return new Response(downstream.body, { status: downstream.status, headers: downstream.headers });
    } catch {
      return errorResponse("internal_error", "Launches service unavailable", 503, requestId);
    }
  };

  if (request.method === "GET") return forward();
  return replayOrExecute(request, requestId, env, "launches", forward);
}
