import type { Actor, Deps } from "../deps.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { toPublicIncident } from "../mappers.js";
import type { ListIncidentsResponse } from "@saas/contracts/monitors";

export async function listIncidents(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? 50 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return validationError(requestId, { limit: ["Must be an integer between 1 and 200"] });
  }

  const [incidents, monitors] = await Promise.all([
    deps.repo.listIncidents(actor.subjectId, limit),
    deps.repo.listMonitors(actor.subjectId),
  ]);
  if (!incidents.ok || !monitors.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  // An incident without its monitor's name is unreadable, so the names come
  // from the owner's own list rather than a per-incident read.
  const names = new Map(monitors.value.map((m) => [m.id, m.name]));
  const res: ListIncidentsResponse = {
    incidents: incidents.value.map((i) => toPublicIncident(i, names.get(i.monitorId) ?? "Deleted monitor")),
  };
  return successResponse(res, requestId);
}
