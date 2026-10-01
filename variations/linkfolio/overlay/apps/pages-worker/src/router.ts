import type { Env } from "./env.js";
import { createDeps, resolveActor, type Deps } from "./deps.js";
import { errorResponse, methodNotAllowed, notFound } from "./http.js";
import { generateRequestId, parseBlockPublicId } from "./ids.js";
import { handleHealth } from "./handlers/health.js";
import { getMyPage, upsertMyPage } from "./handlers/me-page.js";
import { createMyBlock, deleteMyBlock, listMyBlocks, reorderMyBlocks, updateMyBlock } from "./handlers/me-blocks.js";
import { getMyAnalytics } from "./handlers/me-analytics.js";
import { getPublicPage, recordPublicClick } from "./handlers/public.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

// Owner surface — always authenticated.
const ME_PAGE_RE = /^\/v1\/me\/page$/;
const ME_BLOCKS_RE = /^\/v1\/me\/page\/blocks$/;
const ME_BLOCKS_REORDER_RE = /^\/v1\/me\/page\/blocks\/reorder$/;
const ME_BLOCK_RE = /^\/v1\/me\/page\/blocks\/([^/]+)$/;
const ME_ANALYTICS_RE = /^\/v1\/me\/page\/analytics$/;
// Public page — anonymous.
const PUBLIC_PAGE_RE = /^\/v1\/p\/([a-z0-9_-]+)$/;
const PUBLIC_CLICK_RE = /^\/v1\/p\/([a-z0-9_-]+)\/blocks\/([^/]+)\/click$/;

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

    // ── /v1/me/page ──────────────────────────────────────
    if (ME_PAGE_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await getMyPage(deps, requestId, actor!);
      if (method === "PUT") return await upsertMyPage(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    // Reorder is matched before the item route: `reorder` is not a block id.
    if (ME_BLOCKS_REORDER_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "POST") return await reorderMyBlocks(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    if (ME_ANALYTICS_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await getMyAnalytics(url, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    if (ME_BLOCKS_RE.test(path)) {
      const denied = requireUser();
      if (denied) return denied;
      if (method === "GET") return await listMyBlocks(deps, requestId, actor!);
      if (method === "POST") return await createMyBlock(request, deps, requestId, actor!);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(ME_BLOCK_RE))) {
      const denied = requireUser();
      if (denied) return denied;
      const id = parseBlockPublicId(m[1]!);
      if (!id) return errorResponse("not_found", "Block not found", 404, requestId);
      if (method === "PATCH") return await updateMyBlock(request, deps, requestId, actor!, id);
      if (method === "DELETE") return await deleteMyBlock(deps, requestId, actor!, id);
      return methodNotAllowed(requestId);
    }

    // ── /v1/p — the public page ──────────────────────────
    if ((m = path.match(PUBLIC_CLICK_RE))) {
      const blockId = parseBlockPublicId(m[2]!);
      if (!blockId) return errorResponse("not_found", "Block not found", 404, requestId);
      if (method === "POST") return await recordPublicClick(request, deps, requestId, m[1]!, blockId);
      return methodNotAllowed(requestId);
    }
    if ((m = path.match(PUBLIC_PAGE_RE))) {
      if (method === "GET") return await getPublicPage(deps, requestId, m[1]!);
      return methodNotAllowed(requestId);
    }

    return notFound(requestId, path);
  } catch {
    return errorResponse("internal_error", "Internal error", 500, requestId);
  } finally {
    if (!depsOverride) await deps.dispose();
  }
}
