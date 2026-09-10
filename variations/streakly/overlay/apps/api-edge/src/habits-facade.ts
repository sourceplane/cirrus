import type { Env } from "./env.js";
import { errorResponse } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { resolveActor } from "./resolve-actor.js";

// The habit tracker (Streakly variation) — user-scoped and entirely private:
// every route needs a session and there is no public surface at all.
const ME_RE = /^\/v1\/me\/(habits(\/[^/]+(\/checkins\/[^/]+)?)?|today|review)$/;

const FORWARDED_HEADERS = ["content-type", "x-request-id", "traceparent", "idempotency-key"];

export function isHabitsRoute(pathname: string): boolean {
  return ME_RE.test(pathname);
}

export async function handleHabitsRoute(
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
    if (!env.HABITS_WORKER) {
      return errorResponse("internal_error", "Habits service unavailable", 503, requestId);
    }
    if (!env.IDENTITY_WORKER) {
      return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
    }

    const actor = await resolveActor(request, env, requestId);
    if ("error" in actor) return actor.error;

    const headers = new Headers();
    headers.set("x-request-id", requestId);
    headers.set("x-actor-subject-id", actor.subjectId);
    headers.set("x-actor-subject-type", actor.subjectType);
    headers.set("x-actor-email", actor.email);

    for (const name of FORWARDED_HEADERS) {
      if (name === "x-request-id") continue;
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const url = new URL(request.url);
    const target = new URL(pathname + url.search, "https://habits.internal");
    try {
      const init: RequestInit = { method: request.method, headers };
      if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
        init.body = request.body;
      }
      const downstream = await env.HABITS_WORKER.fetch(target.toString(), init);
      return new Response(downstream.body, { status: downstream.status, headers: downstream.headers });
    } catch {
      return errorResponse("internal_error", "Habits service unavailable", 503, requestId);
    }
  };

  if (request.method === "GET") return forward();
  return replayOrExecute(request, requestId, env, "habits", forward);
}
