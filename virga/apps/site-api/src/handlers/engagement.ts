import { REACTION_KINDS, SLUG_RE } from "@site/contracts/engagement";
import type { RankedSlug, ReactionKind, ReactionSummary, ViewSummary } from "@site/contracts/engagement";
import { newId, ID_PREFIX } from "@site/shared/ids";
import type { RequestContext } from "../context.js";
import { errorResponse, json, readJsonObject, validationError } from "../http.js";

const PUBLIC_CACHE = { "cache-control": "public, max-age=15" };

export function validSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("//") && !slug.endsWith("/");
}

export async function handleGetReactions(ctx: RequestContext, slug: string): Promise<Response> {
  if (!validSlug(slug)) return errorResponse("not_found", "Unknown slug", 404, ctx.requestId);
  const result = await ctx.timings.measure("db", () => ctx.engagement.reactionSummary(slug, ctx.visitor));
  if (!result.ok) return errorResponse("internal_error", "Could not read reactions", 500, ctx.requestId);
  const body: ReactionSummary = result.value;
  return json(body);
}

export async function handleReact(ctx: RequestContext, request: Request, slug: string): Promise<Response> {
  if (!validSlug(slug)) return errorResponse("not_found", "Unknown slug", 404, ctx.requestId);
  const body = await readJsonObject(request);
  const kind = body?.kind;
  if (typeof kind !== "string" || !REACTION_KINDS.includes(kind as ReactionKind)) {
    return validationError(ctx.requestId, { kind: [`one of ${REACTION_KINDS.join(", ")}`] });
  }
  const result = await ctx.timings.measure("db", () =>
    ctx.engagement.toggleReaction({
      id: newId(ID_PREFIX.reaction),
      slug,
      kind: kind as ReactionKind,
      visitor: ctx.visitor,
      now: ctx.now.toISOString(),
    }),
  );
  if (!result.ok) return errorResponse("internal_error", "Could not record reaction", 500, ctx.requestId);
  const summary: ReactionSummary = result.value;
  return json(summary);
}

export async function handleRecordView(ctx: RequestContext, slug: string): Promise<Response> {
  if (!validSlug(slug)) return errorResponse("not_found", "Unknown slug", 404, ctx.requestId);
  const result = await ctx.timings.measure("db", () => ctx.engagement.recordView(slug, ctx.today));
  if (!result.ok) return errorResponse("internal_error", "Could not record view", 500, ctx.requestId);
  return new Response(null, { status: 204 });
}

export async function handleGetViews(ctx: RequestContext, slug: string): Promise<Response> {
  if (!validSlug(slug)) return errorResponse("not_found", "Unknown slug", 404, ctx.requestId);
  const result = await ctx.timings.measure("db", () => ctx.engagement.viewSummary(slug, ctx.today));
  if (!result.ok) return errorResponse("internal_error", "Could not read views", 500, ctx.requestId);
  const body: ViewSummary = result.value;
  return json(body, 200, PUBLIC_CACHE);
}

export async function handleTop(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") ?? "launches/";
  if (prefix.length > 0 && !/^[a-z0-9][a-z0-9/_-]{0,79}$/.test(prefix)) {
    return validationError(ctx.requestId, { prefix: ["invalid prefix"] });
  }
  const windowDays = Number(url.searchParams.get("windowDays") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "20");
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 365) {
    return validationError(ctx.requestId, { windowDays: ["0..365"] });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return validationError(ctx.requestId, { limit: ["1..100"] });
  }
  const result = await ctx.timings.measure("db", () =>
    ctx.engagement.top({ prefix, windowDays, limit, today: ctx.today }),
  );
  if (!result.ok) return errorResponse("internal_error", "Could not rank", 500, ctx.requestId);
  const body: RankedSlug[] = result.value;
  return json(body, 200, { "cache-control": "public, max-age=30" });
}
