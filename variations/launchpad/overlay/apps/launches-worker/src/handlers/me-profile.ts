import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicMaker } from "../mappers.js";
import { validateProfile } from "../validation.js";
import type { GetMyProfileResponse, UpsertMyProfileResponse } from "@saas/contracts/launches";

export async function getMyProfile(deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const r = await deps.repo.getMakerByUserId(actor.subjectId);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: GetMyProfileResponse = { maker: r.value ? toPublicMaker(r.value) : null };
  return successResponse(res, requestId);
}

export async function upsertMyProfile(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateProfile(body);
  if (!v.ok) return validationError(requestId, v.fields);
  // A handle belongs to one user: refuse to take somebody else's.
  const holder = await deps.repo.getMakerByHandle(v.value.handle);
  if (!holder.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (holder.value && holder.value.userId !== actor.subjectId) {
    return errorResponse("conflict", "That handle is already taken", 409, requestId, { field: "handle" });
  }
  const r = await deps.repo.upsertMaker({ userId: actor.subjectId, ...v.value });
  if (!r.ok) {
    if (r.error.kind === "conflict") return errorResponse("conflict", "That handle is already taken", 409, requestId, { field: "handle" });
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: UpsertMyProfileResponse = { maker: toPublicMaker(r.value) };
  return successResponse(res, requestId);
}
