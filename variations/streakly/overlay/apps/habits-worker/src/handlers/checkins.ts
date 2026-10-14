import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicCheckIn } from "../mappers.js";
import { validateNote } from "../validation.js";
import { isDateString } from "../dates.js";
import type { CheckInResponse } from "@saas/contracts/habits";

export async function checkIn(request: Request, deps: Deps, requestId: string, actor: Actor, habitId: string, date: string): Promise<Response> {
  if (!isDateString(date)) return validationError(requestId, { date: ["Must be a calendar date, YYYY-MM-DD"] });

  const habit = await deps.repo.getHabit(actor.subjectId, habitId);
  if (!habit.ok) {
    if (habit.error.kind === "not_found") return errorResponse("not_found", "Habit not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }

  const body = await readJsonObject(request);
  const note = validateNote(body?.note);
  if (!note.ok) return validationError(requestId, { note: [note.reason] });

  const r = await deps.repo.checkIn({
    id: deps.newId(),
    habitId,
    userId: actor.subjectId,
    date,
    note: note.value,
  });
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: CheckInResponse = { checkIn: toPublicCheckIn(r.value) };
  return successResponse(res, requestId);
}

export async function undoCheckIn(deps: Deps, requestId: string, actor: Actor, habitId: string, date: string): Promise<Response> {
  if (!isDateString(date)) return validationError(requestId, { date: ["Must be a calendar date, YYYY-MM-DD"] });
  const r = await deps.repo.undoCheckIn(actor.subjectId, habitId, date);
  if (!r.ok) {
    // Undoing a day that was never checked in is not an error worth a body.
    if (r.error.kind === "not_found") return new Response(null, { status: 204 });
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  return new Response(null, { status: 204 });
}
