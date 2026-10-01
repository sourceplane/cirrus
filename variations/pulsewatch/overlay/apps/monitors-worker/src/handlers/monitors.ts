import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { EMPTY_STATS, toPublicCheck, toPublicMonitor } from "../mappers.js";
import { statsFor, statsForAll } from "../stats.js";
import { validateMonitor } from "../validation.js";
import { runCheck } from "../checks.js";
import type { ListChecksResponse, ListMonitorsResponse, MonitorResponse, RunCheckResponse } from "@saas/contracts/monitors";

export async function listMonitors(deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const r = await deps.repo.listMonitors(actor.subjectId);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const stats = await statsForAll(deps, r.value);
  const res: ListMonitorsResponse = { monitors: r.value.map((m) => toPublicMonitor(m, stats.get(m.id) ?? EMPTY_STATS)) };
  return successResponse(res, requestId);
}

export async function createMonitor(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateMonitor(body, false);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.createMonitor({
    id: deps.newId(),
    userId: actor.subjectId,
    name: v.value.name!,
    url: v.value.url!,
    ...(v.value.method !== undefined ? { method: v.value.method } : {}),
    ...(v.value.intervalSec !== undefined ? { intervalSec: v.value.intervalSec } : {}),
    ...(v.value.expectedStatus !== undefined ? { expectedStatus: v.value.expectedStatus } : {}),
  });
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: MonitorResponse = { monitor: toPublicMonitor(r.value) };
  return successResponse(res, requestId, 201);
}

export async function getMonitor(deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const r = await deps.repo.getMonitor(actor.subjectId, id);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Monitor not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: MonitorResponse = { monitor: toPublicMonitor(r.value, await statsFor(deps, r.value)) };
  return successResponse(res, requestId);
}

export async function updateMonitor(request: Request, deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateMonitor(body, true);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.updateMonitor(actor.subjectId, id, v.value);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Monitor not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: MonitorResponse = { monitor: toPublicMonitor(r.value, await statsFor(deps, r.value)) };
  return successResponse(res, requestId);
}

export async function deleteMonitor(deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const r = await deps.repo.deleteMonitor(actor.subjectId, id);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Monitor not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  return new Response(null, { status: 204 });
}

export async function listChecks(url: URL, deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? 100 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return validationError(requestId, { limit: ["Must be an integer between 1 and 500"] });
  }
  // Read through the owner's monitor so another person's checks are unreachable.
  const monitor = await deps.repo.getMonitor(actor.subjectId, id);
  if (!monitor.ok) {
    if (monitor.error.kind === "not_found") return errorResponse("not_found", "Monitor not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const r = await deps.repo.listChecks(id, limit);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: ListChecksResponse = { checks: r.value.map(toPublicCheck) };
  return successResponse(res, requestId);
}

export async function runMonitorCheck(deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const monitor = await deps.repo.getMonitor(actor.subjectId, id);
  if (!monitor.ok) {
    if (monitor.error.kind === "not_found") return errorResponse("not_found", "Monitor not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }

  const outcome = await runCheck(deps, monitor.value);
  if (!outcome) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const res: RunCheckResponse = {
    check: toPublicCheck(outcome.check),
    monitor: toPublicMonitor(outcome.monitor, await statsFor(deps, outcome.monitor)),
  };
  return successResponse(res, requestId);
}
