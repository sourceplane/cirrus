import type { Actor, Deps } from "../deps.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { summarizeClicks, windowStart } from "../analytics.js";
import type { AnalyticsResponse } from "@saas/contracts/pages";

const MAX_DAYS = 90;

export async function getMyAnalytics(url: URL, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const daysParam = url.searchParams.get("days");
  const days = daysParam === null ? 30 : Number(daysParam);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return validationError(requestId, { days: [`Must be an integer between 1 and ${MAX_DAYS}`] });
  }

  const now = deps.now();
  const [clicks, blocks] = await Promise.all([
    deps.repo.clicksSince(actor.subjectId, windowStart(days, now)),
    deps.repo.listBlocks(actor.subjectId),
  ]);
  if (!clicks.ok || !blocks.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  const summary = summarizeClicks(clicks.value, blocks.value, days, now);
  const res: AnalyticsResponse = { days, ...summary };
  return successResponse(res, requestId);
}
