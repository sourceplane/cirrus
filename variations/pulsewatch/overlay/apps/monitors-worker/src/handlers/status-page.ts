import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { EMPTY_STATS, toPublicIncident, toPublicStatusMonitor, toPublicStatusPage } from "../mappers.js";
import { statsForAll } from "../stats.js";
import { validateStatusPage } from "../validation.js";
import type { GetStatusPageResponse, PublicStatusResponse, StatusPageResponse } from "@saas/contracts/monitors";

export async function getMyStatusPage(deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const r = await deps.repo.getStatusPage(actor.subjectId);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: GetStatusPageResponse = { statusPage: r.value ? toPublicStatusPage(r.value) : null };
  return successResponse(res, requestId);
}

export async function upsertMyStatusPage(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateStatusPage(body);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.upsertStatusPage({ userId: actor.subjectId, ...v.value });
  if (!r.ok) {
    if (r.error.kind === "conflict") {
      return errorResponse("conflict", "That handle is already taken", 409, requestId, { field: "handle" });
    }
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: StatusPageResponse = { statusPage: toPublicStatusPage(r.value) };
  return successResponse(res, requestId);
}

/** The anonymous status page: what is up, never where it lives. */
export async function getPublicStatus(deps: Deps, requestId: string, handle: string): Promise<Response> {
  const page = await deps.repo.getPublicStatusPageByHandle(handle);
  if (!page.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!page.value) return errorResponse("not_found", "Status page not found", 404, requestId);

  const monitors = await deps.repo.listMonitors(page.value.userId);
  if (!monitors.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  // A disabled monitor is not being watched, so it says nothing about status.
  const shown = monitors.value.filter((m) => m.enabled);
  const [stats, incidents] = await Promise.all([
    statsForAll(deps, shown),
    deps.repo.listIncidentsForMonitors(shown.map((m) => m.id), 10),
  ]);

  const names = new Map(shown.map((m) => [m.id, m.name]));
  const res: PublicStatusResponse = {
    page: { handle: page.value.handle, title: page.value.title, description: page.value.description },
    monitors: shown.map((m) => toPublicStatusMonitor(m, stats.get(m.id) ?? EMPTY_STATS)),
    incidents: incidents.ok ? incidents.value.map((i) => toPublicIncident(i, names.get(i.monitorId) ?? "Monitor")) : [],
  };
  return successResponse(res, requestId);
}
