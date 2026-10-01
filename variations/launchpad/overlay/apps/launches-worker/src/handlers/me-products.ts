import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicProduct } from "../mappers.js";
import { slugify, validateProductFields } from "../validation.js";
import type { ListMyProductsResponse, ProductResponse } from "@saas/contracts/launches";

export async function listMyProducts(deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const [products, maker] = await Promise.all([
    deps.repo.listProductsByUser(actor.subjectId),
    deps.repo.getMakerByUserId(actor.subjectId),
  ]);
  if (!products.ok || !maker.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const voted = await deps.repo.hasUpvoted(actor.subjectId, products.value.map((p) => p.id));
  const votedSet = voted.ok ? voted.value : new Set<string>();
  const body: ListMyProductsResponse = {
    products: products.value.map((p) => toPublicProduct(p, maker.value, votedSet.has(p.id))),
  };
  return successResponse(body, requestId);
}

export async function createMyProduct(request: Request, deps: Deps, requestId: string, actor: Actor): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateProductFields(body, false);
  if (!v.ok) return validationError(requestId, v.fields);
  const slug = v.value.slug ?? slugify(v.value.name!);
  if (!slug) return validationError(requestId, { slug: ["Could not derive a slug from the name"] });

  const created = await deps.repo.createProduct({
    id: deps.newId(),
    userId: actor.subjectId,
    slug,
    name: v.value.name!,
    tagline: v.value.tagline!,
    url: v.value.url!,
    ...(v.value.description !== undefined ? { description: v.value.description } : {}),
    ...(v.value.tags !== undefined ? { tags: v.value.tags } : {}),
  });
  if (!created.ok) {
    if (created.error.kind === "conflict") return errorResponse("conflict", "That slug is already taken", 409, requestId, { field: "slug" });
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const maker = await deps.repo.getMakerByUserId(actor.subjectId);
  const res: ProductResponse = { product: toPublicProduct(created.value, maker.ok ? maker.value : null, false) };
  return successResponse(res, requestId, 201);
}

export async function getMyProduct(deps: Deps, requestId: string, actor: Actor, productId: string): Promise<Response> {
  const r = await deps.repo.getProductForUser(actor.subjectId, productId);
  if (!r.ok) return mapErr(r.error.kind, requestId);
  const maker = await deps.repo.getMakerByUserId(actor.subjectId);
  const res: ProductResponse = { product: toPublicProduct(r.value, maker.ok ? maker.value : null, false) };
  return successResponse(res, requestId);
}

export async function updateMyProduct(request: Request, deps: Deps, requestId: string, actor: Actor, productId: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateProductFields(body, true);
  if (!v.ok) return validationError(requestId, v.fields);
  if (body.status !== undefined && body.status !== "archived" && body.status !== "draft") {
    return validationError(requestId, { status: ["Status may only be set to archived or draft"] });
  }
  const r = await deps.repo.updateProduct(actor.subjectId, productId, {
    ...(v.value.name !== undefined ? { name: v.value.name } : {}),
    ...(v.value.tagline !== undefined ? { tagline: v.value.tagline } : {}),
    ...(v.value.url !== undefined ? { url: v.value.url } : {}),
    ...(v.value.description !== undefined ? { description: v.value.description } : {}),
    ...(v.value.tags !== undefined ? { tags: v.value.tags } : {}),
    ...(body.status !== undefined ? { status: body.status as "archived" | "draft" } : {}),
  });
  if (!r.ok) return mapErr(r.error.kind, requestId);
  const maker = await deps.repo.getMakerByUserId(actor.subjectId);
  const res: ProductResponse = { product: toPublicProduct(r.value, maker.ok ? maker.value : null, false) };
  return successResponse(res, requestId);
}

export async function launchMyProduct(deps: Deps, requestId: string, actor: Actor, productId: string): Promise<Response> {
  const maker = await deps.repo.getMakerByUserId(actor.subjectId);
  if (!maker.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!maker.value) {
    return errorResponse("precondition_failed", "Create your maker profile before launching", 412, requestId, { reason: "maker_profile_required" });
  }
  const r = await deps.repo.launchProduct(actor.subjectId, productId, deps.now());
  if (!r.ok) return mapErr(r.error.kind, requestId);
  const res: ProductResponse = { product: toPublicProduct(r.value, maker.value, false) };
  return successResponse(res, requestId);
}

export async function deleteMyProduct(deps: Deps, requestId: string, actor: Actor, productId: string): Promise<Response> {
  const r = await deps.repo.deleteProduct(actor.subjectId, productId);
  if (!r.ok) return mapErr(r.error.kind, requestId);
  return new Response(null, { status: 204 });
}

function mapErr(kind: "not_found" | "conflict" | "internal", requestId: string): Response {
  if (kind === "not_found") return errorResponse("not_found", "Product not found", 404, requestId);
  if (kind === "conflict") return errorResponse("conflict", "Conflict", 409, requestId);
  return errorResponse("internal_error", "Service unavailable", 503, requestId);
}
