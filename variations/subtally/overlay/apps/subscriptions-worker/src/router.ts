import type { Env } from "./env.js";
import { createDeps, resolveActor, type Deps } from "./deps.js";
import { errorResponse, methodNotAllowed, notFound, validationError } from "./http.js";
import { generateRequestId, parseSubscriptionPublicId } from "./ids.js";
import { isDateString } from "./renewals.js";
import { handleHealth } from "./handlers/health.js";
import { createSubscription, deleteSubscription, getSubscription, listSubscriptions, updateSubscription } from "./handlers/crud.js";
import { summary, upcoming } from "./handlers/views.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

// Every route is the owner's own: this product has no public surface.
const LIST_RE = /^\/v1\/me\/subscriptions$/;
const SUMMARY_RE = /^\/v1\/me\/subscriptions\/summary$/;
const UPCOMING_RE = /^\/v1\/me\/subscriptions\/upcoming$/;
const ITEM_RE = /^\/v1\/me\/subscriptions\/([^/]+)$/;

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

  // `asOf` drives every derived date, so a malformed one is rejected once here
  // rather than silently defaulting per handler.
  const asOfParam = url.searchParams.get("asOf");
  if (asOfParam !== null && !isDateString(asOfParam)) {
    return validationError(requestId, { asOf: ["Must be a calendar date, YYYY-MM-DD"] });
  }

  try {
    let m: RegExpMatchArray | null;

    // The named views come before the item route: `summary` is not an id.
    if (SUMMARY_RE.test(path)) {
      if (method === "GET") return await summary(url, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    if (UPCOMING_RE.test(path)) {
      if (method === "GET") return await upcoming(url, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    if (LIST_RE.test(path)) {
      if (method === "GET") return await listSubscriptions(url, deps, requestId, actor);
      if (method === "POST") return await createSubscription(request, url, deps, requestId, actor);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(ITEM_RE))) {
      const id = parseSubscriptionPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Subscription not found", 404, requestId);
      if (method === "GET") return await getSubscription(url, deps, requestId, actor, id);
      if (method === "PATCH") return await updateSubscription(request, url, deps, requestId, actor, id);
      if (method === "DELETE") return await deleteSubscription(deps, requestId, actor, id);
      return methodNotAllowed(requestId);
    }

    return notFound(requestId, path);
  } catch {
    return errorResponse("internal_error", "Internal error", 500, requestId);
  } finally {
    if (!depsOverride) await deps.dispose();
  }
}
