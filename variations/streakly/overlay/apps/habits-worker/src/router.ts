import type { Env } from "./env.js";
import { createDeps, resolveActor, type Deps } from "./deps.js";
import { errorResponse, methodNotAllowed, notFound } from "./http.js";
import { generateRequestId, parseHabitPublicId } from "./ids.js";
import { handleHealth } from "./handlers/health.js";
import { createHabit, deleteHabit, listHabits, reorderHabits, updateHabit } from "./handlers/habits.js";
import { checkIn, undoCheckIn } from "./handlers/checkins.js";
import { review, today } from "./handlers/views.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

// Every route is the owner's own: this product has no public surface.
const HABITS_RE = /^\/v1\/me\/habits$/;
const HABITS_REORDER_RE = /^\/v1\/me\/habits\/reorder$/;
const HABIT_RE = /^\/v1\/me\/habits\/([^/]+)$/;
const CHECKIN_RE = /^\/v1\/me\/habits\/([^/]+)\/checkins\/([^/]+)$/;
const TODAY_RE = /^\/v1\/me\/today$/;
const REVIEW_RE = /^\/v1\/me\/review$/;

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return generateRequestId();
}

/**
 * Route a request. `depsOverride` lets tests inject a fake repository; in
 * production the deps are built from the D1 binding per request.
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
  if (!actor || actor.subjectType !== "user") {
    return errorResponse("unauthenticated", "Authentication required", 401, requestId);
  }

  try {
    let m: RegExpMatchArray | null;

    if (TODAY_RE.test(path)) {
      if (method === "GET") return await today(url, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    if (REVIEW_RE.test(path)) {
      if (method === "GET") return await review(url, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    // Reorder before the item route: `reorder` is not a habit id.
    if (HABITS_REORDER_RE.test(path)) {
      if (method === "POST") return await reorderHabits(request, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    if (HABITS_RE.test(path)) {
      if (method === "GET") return await listHabits(url, deps, requestId, actor);
      if (method === "POST") return await createHabit(request, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(CHECKIN_RE))) {
      const id = parseHabitPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Habit not found", 404, requestId);
      if (method === "PUT") return await checkIn(request, deps, requestId, actor, id, m[2]!);
      if (method === "DELETE") return await undoCheckIn(deps, requestId, actor, id, m[2]!);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(HABIT_RE))) {
      const id = parseHabitPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Habit not found", 404, requestId);
      if (method === "PATCH") return await updateHabit(request, deps, requestId, actor, id);
      if (method === "DELETE") return await deleteHabit(deps, requestId, actor, id);
      return methodNotAllowed(requestId);
    }

    return notFound(requestId, path);
  } catch {
    return errorResponse("internal_error", "Internal error", 500, requestId);
  } finally {
    if (!depsOverride) await deps.dispose();
  }
}
