import type { Env } from "./env.js";
import { createDeps, resolveActor, type Deps } from "./deps.js";
import { errorResponse, methodNotAllowed, notFound } from "./http.js";
import { generateRequestId, parseProductPublicId } from "./ids.js";
import { handleHealth } from "./handlers/health.js";
import { createMyProduct, deleteMyProduct, getMyProduct, launchMyProduct, listMyProducts, updateMyProduct } from "./handlers/me-products.js";
import { getMyProfile, upsertMyProfile } from "./handlers/me-profile.js";
import { addComment, getLaunch, getMaker, listComments, listLaunches, setUpvote } from "./handlers/public.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

// Owner surface — always authenticated.
const ME_PRODUCTS_RE = /^\/v1\/me\/products$/;
const ME_PRODUCT_RE = /^\/v1\/me\/products\/([^/]+)$/;
const ME_PRODUCT_LAUNCH_RE = /^\/v1\/me\/products\/([^/]+)\/launch$/;
const ME_PROFILE_RE = /^\/v1\/me\/profile$/;
// Directory — public reads, authenticated writes.
const LAUNCHES_RE = /^\/v1\/launches$/;
const LAUNCH_RE = /^\/v1\/launches\/([a-z0-9-]+)$/;
const LAUNCH_COMMENTS_RE = /^\/v1\/launches\/([a-z0-9-]+)\/comments$/;
const LAUNCH_UPVOTE_RE = /^\/v1\/launches\/([a-z0-9-]+)\/upvote$/;
const MAKER_RE = /^\/v1\/makers\/([a-z0-9_-]+)$/;

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
  const requireUser = (): Response | null =>
    actor && actor.subjectType === "user" ? null : errorResponse("unauthenticated", "Authentication required", 401, requestId);

  try {
    let m: RegExpMatchArray | null;

    // ── /v1/me ────────────────────────────────────────────
    if (ME_PRODUCTS_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await listMyProducts(deps, requestId, actor!);
      if (method === "POST") return await createMyProduct(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(ME_PRODUCT_LAUNCH_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      const id = parseProductPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Product not found", 404, requestId);
      if (method === "POST") return await launchMyProduct(deps, requestId, actor!, id);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(ME_PRODUCT_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      const id = parseProductPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Product not found", 404, requestId);
      if (method === "GET") return await getMyProduct(deps, requestId, actor!, id);
      if (method === "PATCH") return await updateMyProduct(request, deps, requestId, actor!, id);
      if (method === "DELETE") return await deleteMyProduct(deps, requestId, actor!, id);
      return methodNotAllowed(requestId);
    }
    if (ME_PROFILE_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await getMyProfile(deps, requestId, actor!);
      if (method === "PUT") return await upsertMyProfile(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }

    // ── Directory ────────────────────────────────────────
    const viewer = actor && actor.subjectType === "user" ? actor : null;
    if (LAUNCHES_RE.test(path)) {
      if (method === "GET") return await listLaunches(url, deps, requestId, viewer);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(LAUNCH_COMMENTS_RE))) {
      if (method === "GET") return await listComments(deps, requestId, m[1]!);
      if (method === "POST") {
        const denied = requireUser();
        if (denied) return denied;
        return await addComment(request, deps, requestId, actor!, m[1]!);
      }
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(LAUNCH_UPVOTE_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "PUT") return await setUpvote(deps, requestId, actor!, m[1]!, true);
      if (method === "DELETE") return await setUpvote(deps, requestId, actor!, m[1]!, false);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(LAUNCH_RE))) {
      if (method === "GET") return await getLaunch(deps, requestId, viewer, m[1]!);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(MAKER_RE))) {
      if (method === "GET") return await getMaker(deps, requestId, viewer, m[1]!);
      return methodNotAllowed(requestId);
    }

    return notFound(requestId, path);
  } catch {
    return errorResponse("internal_error", "Internal error", 500, requestId);
  } finally {
    if (!depsOverride) await deps.dispose();
  }
}
