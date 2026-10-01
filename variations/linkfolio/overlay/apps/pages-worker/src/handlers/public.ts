import type { Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse } from "../http.js";
import { toPublicBlock, toPublicPage } from "../mappers.js";
import { normalizeReferrer } from "../validation.js";
import type { GetPublicPageResponse, RecordClickResponse } from "@saas/contracts/pages";

export async function getPublicPage(deps: Deps, requestId: string, handle: string): Promise<Response> {
  const page = await deps.repo.getPublishedPageByHandle(handle);
  if (!page.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!page.value) return errorResponse("not_found", "Page not found", 404, requestId);

  const blocks = await deps.repo.listEnabledBlocks(page.value.userId);
  if (!blocks.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  // The owner's user id never crosses the public boundary.
  const res: GetPublicPageResponse = {
    page: toPublicPage(page.value),
    blocks: blocks.value.map(toPublicBlock),
  };
  return successResponse(res, requestId);
}

export async function recordPublicClick(
  request: Request,
  deps: Deps,
  requestId: string,
  handle: string,
  blockId: string,
): Promise<Response> {
  const page = await deps.repo.getPublishedPageByHandle(handle);
  if (!page.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!page.value) return errorResponse("not_found", "Page not found", 404, requestId);

  const block = await deps.repo.getBlock(page.value.userId, blockId);
  if (!block.ok) {
    if (block.error.kind === "not_found") return errorResponse("not_found", "Block not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  // A disabled block is not on the page, and a header has nowhere to go.
  if (!block.value.enabled || !block.value.url) return errorResponse("not_found", "Block not found", 404, requestId);

  const body = await readJsonObject(request);
  const referrer = normalizeReferrer(body?.referrer);

  // A failed click write must not cost the visitor their navigation.
  await deps.repo.recordClick({
    id: deps.newId(),
    blockId: block.value.id,
    userId: page.value.userId,
    referrer,
  });

  const res: RecordClickResponse = { url: block.value.url };
  return successResponse(res, requestId);
}
