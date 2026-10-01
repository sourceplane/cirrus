import type { Actor, Deps } from "../deps.js";
import { errorResponse, readJsonObject, successResponse, validationError } from "../http.js";
import { toPublicComment, toPublicMaker, toPublicProduct } from "../mappers.js";
import { validateComment } from "../validation.js";
import type { Maker, Product } from "@saas/db/launches";
import type {
  CreateCommentResponse,
  FeedRange,
  GetLaunchResponse,
  GetMakerResponse,
  ListCommentsResponse,
  ListLaunchesResponse,
  UpvoteResponse,
} from "@saas/contracts/launches";

const RANGES: FeedRange[] = ["today", "week", "all"];

/** Resolve the distinct makers behind a product list (one read per maker). */
async function makersFor(deps: Deps, products: Product[]): Promise<Map<string, Maker>> {
  const map = new Map<string, Maker>();
  const ids = [...new Set(products.map((p) => p.userId))];
  await Promise.all(
    ids.map(async (id) => {
      const r = await deps.repo.getMakerByUserId(id);
      if (r.ok && r.value) map.set(id, r.value);
    }),
  );
  return map;
}

async function votedSet(deps: Deps, viewer: Actor | null, products: Product[]): Promise<Set<string>> {
  if (!viewer) return new Set();
  const r = await deps.repo.hasUpvoted(viewer.subjectId, products.map((p) => p.id));
  return r.ok ? r.value : new Set();
}

export async function listLaunches(url: URL, deps: Deps, requestId: string, viewer: Actor | null): Promise<Response> {
  const rangeParam = url.searchParams.get("range") ?? "today";
  if (!RANGES.includes(rangeParam as FeedRange)) return validationError(requestId, { range: ["Must be today, week or all"] });
  const range = rangeParam as FeedRange;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? 50 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return validationError(requestId, { limit: ["Must be an integer between 1 and 100"] });

  const feed = await deps.repo.feed({ range, limit, now: deps.now() });
  if (!feed.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const [makers, voted] = await Promise.all([makersFor(deps, feed.value), votedSet(deps, viewer, feed.value)]);
  const res: ListLaunchesResponse = {
    range,
    products: feed.value.map((p) => toPublicProduct(p, makers.get(p.userId) ?? null, voted.has(p.id))),
  };
  return successResponse(res, requestId);
}

export async function getLaunch(deps: Deps, requestId: string, viewer: Actor | null, slug: string): Promise<Response> {
  const r = await deps.repo.getLiveProductBySlug(slug);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!r.value) return errorResponse("not_found", "Launch not found", 404, requestId);
  const [maker, voted] = await Promise.all([deps.repo.getMakerByUserId(r.value.userId), votedSet(deps, viewer, [r.value])]);
  const res: GetLaunchResponse = { product: toPublicProduct(r.value, maker.ok ? maker.value : null, voted.has(r.value.id)) };
  return successResponse(res, requestId);
}

export async function listComments(deps: Deps, requestId: string, slug: string): Promise<Response> {
  const p = await deps.repo.getLiveProductBySlug(slug);
  if (!p.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!p.value) return errorResponse("not_found", "Launch not found", 404, requestId);
  const c = await deps.repo.listComments(p.value.id, 200);
  if (!c.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const authors = new Map<string, Maker>();
  await Promise.all(
    [...new Set(c.value.map((x) => x.userId))].map(async (id) => {
      const m = await deps.repo.getMakerByUserId(id);
      if (m.ok && m.value) authors.set(id, m.value);
    }),
  );
  const res: ListCommentsResponse = { comments: c.value.map((x) => toPublicComment(x, authors.get(x.userId) ?? null)) };
  return successResponse(res, requestId);
}

export async function addComment(request: Request, deps: Deps, requestId: string, actor: Actor, slug: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const v = validateComment(body);
  if (!v.ok) return validationError(requestId, v.fields);
  const p = await deps.repo.getLiveProductBySlug(slug);
  if (!p.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!p.value) return errorResponse("not_found", "Launch not found", 404, requestId);
  const c = await deps.repo.addComment({ id: deps.newId(), productId: p.value.id, userId: actor.subjectId, body: v.value });
  if (!c.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const author = await deps.repo.getMakerByUserId(actor.subjectId);
  const res: CreateCommentResponse = { comment: toPublicComment(c.value, author.ok ? author.value : null) };
  return successResponse(res, requestId, 201);
}

export async function setUpvote(deps: Deps, requestId: string, actor: Actor, slug: string, on: boolean): Promise<Response> {
  const p = await deps.repo.getLiveProductBySlug(slug);
  if (!p.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!p.value) return errorResponse("not_found", "Launch not found", 404, requestId);
  const r = on ? await deps.repo.upvote(p.value.id, actor.subjectId) : await deps.repo.removeUpvote(p.value.id, actor.subjectId);
  if (!r.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const res: UpvoteResponse = { upvoteCount: r.value.upvoteCount, viewerHasUpvoted: on };
  return successResponse(res, requestId);
}

export async function getMaker(deps: Deps, requestId: string, viewer: Actor | null, handle: string): Promise<Response> {
  const m = await deps.repo.getMakerByHandle(handle);
  if (!m.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  if (!m.value) return errorResponse("not_found", "Maker not found", 404, requestId);
  const products = await deps.repo.listLiveProductsByUser(m.value.userId);
  if (!products.ok) return errorResponse("internal_error", "Service unavailable", 503, requestId);
  const voted = await votedSet(deps, viewer, products.value);
  const maker = m.value;
  const res: GetMakerResponse = {
    maker: toPublicMaker(maker),
    products: products.value.map((p) => toPublicProduct(p, maker, voted.has(p.id))),
  };
  return successResponse(res, requestId);
}
