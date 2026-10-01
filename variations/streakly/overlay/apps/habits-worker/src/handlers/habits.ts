import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicHabit } from "../mappers.js";
import { validateHabit } from "../validation.js";
import { parseHabitPublicId } from "../ids.js";
import type { HabitResponse, ListHabitsResponse, ReorderHabitsResponse } from "@saas/contracts/habits";

export async function listHabits(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const r = await deps.repo.listHabits(actor.subjectId, includeArchived);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: ListHabitsResponse = { habits: r.value.map(toPublicHabit) };
  return successResponse(res, requestId);
}

export async function createHabit(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateHabit(body, false);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.createHabit({
    id: deps.newId(),
    userId: actor.subjectId,
    name: v.value.name!,
    cadence: v.value.cadence!,
    ...(v.value.targetPerWeek !== undefined ? { targetPerWeek: v.value.targetPerWeek } : {}),
    ...(v.value.color !== undefined ? { color: v.value.color } : {}),
  });
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: HabitResponse = { habit: toPublicHabit(r.value) };
  return successResponse(res, requestId, 201);
}

export async function updateHabit(request: Request, deps: Deps, requestId: string, actor: Actor, habitId: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);

  // The stored cadence decides whether a target is required or forbidden.
  const existing = await deps.repo.getHabit(actor.subjectId, habitId);
  if (!existing.ok) {
    if (existing.error.kind === "not_found") return errorResponse("not_found", "Habit not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const v = validateHabit(body, true, existing.value.cadence);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.updateHabit(actor.subjectId, habitId, v.value);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Habit not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: HabitResponse = { habit: toPublicHabit(r.value) };
  return successResponse(res, requestId);
}

export async function deleteHabit(deps: Deps, requestId: string, actor: Actor, habitId: string): Promise<Response> {
  const r = await deps.repo.deleteHabit(actor.subjectId, habitId);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Habit not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  return new Response(null, { status: 204 });
}

export async function reorderHabits(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== "string")) {
    return validationError(requestId, { ids: ["Must be an array of habit ids"] });
  }

  const decoded: string[] = [];
  for (const publicId of body.ids as string[]) {
    const id = parseHabitPublicId(publicId);
    if (!id) return validationError(requestId, { ids: ["Contains an id that is not a habit id"] });
    decoded.push(id);
  }

  const owned = await deps.repo.listHabits(actor.subjectId, true);
  if (!owned.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  // A partial order would strand habits at parked positions.
  const ownedIds = new Set(owned.value.map((h) => h.id));
  const unique = new Set(decoded);
  if (unique.size !== decoded.length || decoded.length !== ownedIds.size || decoded.some((id) => !ownedIds.has(id))) {
    return validationError(requestId, { ids: ["Must list each of your habits exactly once"] });
  }

  const r = await deps.repo.reorderHabits(actor.subjectId, decoded);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: ReorderHabitsResponse = { habits: r.value.map(toPublicHabit) };
  return successResponse(res, requestId);
}
