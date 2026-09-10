import type { Env } from "./env.js";
import { errorResponse } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { resolveActor } from "./resolve-actor.js";

// The creator page (Linkfolio variation) — user-scoped, no organization in any
// path. Owner routes live under /v1/me/page and need a session; the public page
// and its click endpoint are anonymous by design (a visitor never signs in).
const ME_RE = /^\/v1\/me\/page(\/(blocks(\/[^/]+)?|analytics))?$/;
const PUBLIC_RE = /^\/v1\/p\/[a-z0-9_-]+(\/blocks\/[^/]+\/click)?$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isPagesRoute(pathname: string): boolean {
  return ME_RE.test(pathname) || PUBLIC_RE.test(pathname);
}

/** Public: the page read AND the click write — both are visitor traffic. */
export function isPublicPagesRoute(pathname: string): boolean {
  return PUBLIC_RE.test(pathname);
}

export async function handlePagesRoute(
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
    if (!env.PAGES_WORKER) {
      return errorResponse("internal_error", "Pages service unavailable", 503, requestId);
    }

    const headers = new Headers();
    headers.set("x-request-id", requestId);

    if (!isPublicPagesRoute(pathname)) {
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
    const target = new URL(pathname + url.search, "https://pages.internal");
    try {
      const init: RequestInit = { method: request.method, headers };
      if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
        init.body = request.body;
      }
      const downstream = await env.PAGES_WORKER.fetch(target.toString(), init);
      return new Response(downstream.body, { status: downstream.status, headers: downstream.headers });
    } catch {
      return errorResponse("internal_error", "Pages service unavailable", 503, requestId);
    }
  };

  if (request.method === "GET") return forward();
  return replayOrExecute(request, requestId, env, "pages", forward);
}
