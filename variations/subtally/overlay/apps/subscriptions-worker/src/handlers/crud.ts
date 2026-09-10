import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicSubscription } from "../mappers.js";
import { validateSubscription, STATUSES } from "../validation.js";
import type { TrackedSubscriptionStatus } from "@saas/db/subscriptions";
import type { ListSubscriptionsResponse, SubscriptionResponse } from "@saas/contracts/subscriptions";

/** The reference instant for every derived date on this request. */
export function asOfFrom(url: URL, deps: Deps): string {
  const param = url.searchParams.get("asOf");
  if (param) return param;
  return deps.now().toISOString().slice(0, 10);
}

export async function listSubscriptions(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const statusParam = url.searchParams.get("status");
  if (statusParam !== null && !STATUSES.includes(statusParam as TrackedSubscriptionStatus)) {
    return validationError(requestId, { status: ["Must be active, paused or cancelled"] });
  }
  const asOf = asOfFrom(url, deps);
  const r = await deps.repo.list(actor.subjectId, (statusParam as TrackedSubscriptionStatus | null) ?? undefined);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: ListSubscriptionsResponse = { subscriptions: r.value.map((s) => toPublicSubscription(s, asOf)) };
  return successResponse(res, requestId);
}

export async function createSubscription(request: Request, url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateSubscription(body, false);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.create({
    id: deps.newId(),
    userId: actor.subjectId,
    name: v.value.name!,
    amountCents: v.value.amountCents!,
    currency: v.value.currency!,
    cadence: v.value.cadence!,
    anchorDate: v.value.anchorDate!,
    ...(v.value.intervalDays !== undefined ? { intervalDays: v.value.intervalDays } : {}),
    ...(v.value.category !== undefined ? { category: v.value.category } : {}),
    ...(v.value.url !== undefined ? { url: v.value.url } : {}),
    ...(v.value.notes !== undefined ? { notes: v.value.notes } : {}),
  });
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: SubscriptionResponse = { subscription: toPublicSubscription(r.value, asOfFrom(url, deps)) };
  return successResponse(res, requestId, 201);
}

export async function getSubscription(url: URL, deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const r = await deps.repo.get(actor.subjectId, id);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Subscription not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: SubscriptionResponse = { subscription: toPublicSubscription(r.value, asOfFrom(url, deps)) };
  return successResponse(res, requestId);
}

export async function updateSubscription(request: Request, url: URL, deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);

  // The stored cadence decides whether an interval is required or forbidden.
  const existing = await deps.repo.get(actor.subjectId, id);
  if (!existing.ok) {
    if (existing.error.kind === "not_found") return errorResponse("not_found", "Subscription not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const v = validateSubscription(body, true, existing.value.cadence);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.update(actor.subjectId, id, v.value);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Subscription not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: SubscriptionResponse = { subscription: toPublicSubscription(r.value, asOfFrom(url, deps)) };
  return successResponse(res, requestId);
}

export async function deleteSubscription(deps: Deps, requestId: string, actor: Actor, id: string): Promise<Response> {
  const r = await deps.repo.remove(actor.subjectId, id);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Subscription not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  return new Response(null, { status: 204 });
}
