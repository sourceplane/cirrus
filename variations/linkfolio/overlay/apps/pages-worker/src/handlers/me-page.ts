import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicPage } from "../mappers.js";
import { validatePage } from "../validation.js";
import type { GetMyPageResponse, UpsertMyPageResponse } from "@saas/contracts/pages";

export async function getMyPage(deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const r = await deps.repo.getPageByUserId(actor.subjectId);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: GetMyPageResponse = { page: r.value ? toPublicPage(r.value) : null };
  return successResponse(res, requestId);
}

export async function upsertMyPage(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validatePage(body);
  if (!v.ok) return validationError(requestId, v.fields);

  // A handle belongs to one creator: never take somebody else's, published or not.
  const holder = await deps.repo.getPageByUserId(actor.subjectId);
  if (!holder.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const r = await deps.repo.upsertPage({ userId: actor.subjectId, ...v.value });
  if (!r.ok) {
    if (r.error.kind === "conflict") {
      return errorResponse("conflict", "That handle is already taken", 409, requestId, { field: "handle" });
    }
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: UpsertMyPageResponse = { page: toPublicPage(r.value) };
  return successResponse(res, requestId);
}
