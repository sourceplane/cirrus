import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicBlock } from "../mappers.js";
import { validateBlock } from "../validation.js";
import { parseBlockPublicId } from "../ids.js";
import type { BlockResponse, ListBlocksResponse, ReorderBlocksResponse } from "@saas/contracts/pages";

export async function listMyBlocks(deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const r = await deps.repo.listBlocks(actor.subjectId);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: ListBlocksResponse = { blocks: r.value.map(toPublicBlock) };
  return successResponse(res, requestId);
}

export async function createMyBlock(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateBlock(body, false);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.createBlock({
    id: deps.newId(),
    userId: actor.subjectId,
    kind: v.value.kind!,
    title: v.value.title!,
    ...(v.value.url !== undefined ? { url: v.value.url } : {}),
    ...(v.value.description !== undefined ? { description: v.value.description } : {}),
    ...(v.value.priceCents !== undefined ? { priceCents: v.value.priceCents } : {}),
    ...(v.value.currency !== undefined ? { currency: v.value.currency } : {}),
  });
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: BlockResponse = { block: toPublicBlock(r.value) };
  return successResponse(res, requestId, 201);
}

export async function updateMyBlock(request: Request, deps: Deps, requestId: string, actor: Actor, blockId: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);

  // The kind decides whether a URL is required, so read the existing block first.
  const existing = await deps.repo.getBlock(actor.subjectId, blockId);
  if (!existing.ok) {
    if (existing.error.kind === "not_found") return errorResponse("not_found", "Block not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const v = validateBlock(body, true, existing.value.kind);
  if (!v.ok) return validationError(requestId, v.fields);

  const r = await deps.repo.updateBlock(actor.subjectId, blockId, v.value);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Block not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const res: BlockResponse = { block: toPublicBlock(r.value) };
  return successResponse(res, requestId);
}

export async function deleteMyBlock(deps: Deps, requestId: string, actor: Actor, blockId: string): Promise<Response> {
  const r = await deps.repo.deleteBlock(actor.subjectId, blockId);
  if (!r.ok) {
    if (r.error.kind === "not_found") return errorResponse("not_found", "Block not found", 404, requestId);
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  return new Response(null, { status: 204 });
}

export async function reorderMyBlocks(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== "string")) {
    return validationError(requestId, { ids: ["Must be an array of block ids"] });
  }

  const decoded: string[] = [];
  for (const publicId of body.ids as string[]) {
    const id = parseBlockPublicId(publicId);
    if (!id) return validationError(requestId, { ids: ["Contains an id that is not a block id"] });
    decoded.push(id);
  }

  const owned = await deps.repo.listBlocks(actor.subjectId);
  if (!owned.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);

  // The order must be a permutation of exactly what the creator owns, or the
  // rewrite would strand blocks at parked positions.
  const ownedIds = new Set(owned.value.map((b) => b.id));
  const uniqueGiven = new Set(decoded);
  if (uniqueGiven.size !== decoded.length || decoded.length !== ownedIds.size || decoded.some((id) => !ownedIds.has(id))) {
    return validationError(requestId, { ids: ["Must list each of your blocks exactly once"] });
  }

  const r = await deps.repo.reorderBlocks(actor.subjectId, decoded);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: ReorderBlocksResponse = { blocks: r.value.map(toPublicBlock) };
  return successResponse(res, requestId);
}
