import { createTimings } from "@site/contracts/timing";
import type { Env } from "./env.js";
import { buildContext, type RequestContext } from "./context.js";
import { applyCorsHeaders, handlePreflight } from "./cors.js";
import { fingerprint } from "./fingerprint.js";
import { errorResponse, finalize, methodNotAllowed, notFound, resolveRequestId } from "./http.js";
import { authenticateOwner } from "./owner-auth.js";
import { enforceRateLimit, type RouteFamily } from "./rate-limit.js";
import { handleHealth } from "./handlers/health.js";
import { handleConfirm, handleSubscribe, handleUnsubscribe } from "./handlers/subscribers.js";
import { handleFormSubmit } from "./handlers/forms.js";
import { handleGetReactions, handleGetViews, handleReact, handleRecordView, handleTop } from "./handlers/engagement.js";
import {
  handleCreateIssue,
  handleExportSubscribers,
  handleGetIssue,
  handleListIssues,
  handleListSubmissions,
  handleListSubscribers,
  handleSendIssue,
  handleStats,
  handleUpdateSubmission,
} from "./handlers/owner.js";

type Handler = (ctx: RequestContext, request: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  family: RouteFamily;
  /** Durable (KV) limiter for writes; in-isolate for reads. */
  durable: boolean;
  owner?: boolean;
  handler: Handler;
}

const ROUTES: Route[] = [
  { method: "POST", pattern: /^\/v1\/subscribers$/, family: "subscribe", durable: true, handler: (c, r) => handleSubscribe(c, r) },
  { method: "GET", pattern: /^\/v1\/subscribers\/confirm$/, family: "tokens", durable: true, handler: (c, r) => handleConfirm(c, r) },
  { method: "GET", pattern: /^\/v1\/subscribers\/unsubscribe$/, family: "tokens", durable: true, handler: (c, r) => handleUnsubscribe(c, r) },
  { method: "POST", pattern: /^\/v1\/subscribers\/unsubscribe$/, family: "tokens", durable: true, handler: (c, r) => handleUnsubscribe(c, r) },
  { method: "POST", pattern: /^\/v1\/forms\/(?<form>[^/]+)$/, family: "forms", durable: true, handler: (c, r, p) => handleFormSubmit(c, r, p.form!) },
  { method: "GET", pattern: /^\/v1\/reactions\/(?<slug>.+)$/, family: "reads", durable: false, handler: (c, _r, p) => handleGetReactions(c, p.slug!) },
  { method: "POST", pattern: /^\/v1\/reactions\/(?<slug>.+)$/, family: "reactions", durable: true, handler: (c, r, p) => handleReact(c, r, p.slug!) },
  { method: "GET", pattern: /^\/v1\/views\/(?<slug>.+)$/, family: "reads", durable: false, handler: (c, _r, p) => handleGetViews(c, p.slug!) },
  { method: "POST", pattern: /^\/v1\/views\/(?<slug>.+)$/, family: "views", durable: true, handler: (c, _r, p) => handleRecordView(c, p.slug!) },
  { method: "GET", pattern: /^\/v1\/launches\/top$/, family: "reads", durable: false, handler: (c, r) => handleTop(c, r) },
  { method: "GET", pattern: /^\/v1\/owner\/subscribers$/, family: "owner", durable: false, owner: true, handler: (c, r) => handleListSubscribers(c, r) },
  { method: "GET", pattern: /^\/v1\/owner\/subscribers\/export$/, family: "owner", durable: false, owner: true, handler: (c, r) => handleExportSubscribers(c, r) },
  { method: "GET", pattern: /^\/v1\/owner\/submissions$/, family: "owner", durable: false, owner: true, handler: (c, r) => handleListSubmissions(c, r) },
  { method: "PATCH", pattern: /^\/v1\/owner\/submissions\/(?<id>[^/]+)$/, family: "owner", durable: false, owner: true, handler: (c, r, p) => handleUpdateSubmission(c, r, p.id!) },
  { method: "GET", pattern: /^\/v1\/owner\/issues$/, family: "owner", durable: false, owner: true, handler: (c, r) => handleListIssues(c, r) },
  { method: "POST", pattern: /^\/v1\/owner\/issues$/, family: "owner", durable: false, owner: true, handler: (c, r) => handleCreateIssue(c, r) },
  { method: "GET", pattern: /^\/v1\/owner\/issues\/(?<id>[^/]+)$/, family: "owner", durable: false, owner: true, handler: (c, _r, p) => handleGetIssue(c, p.id!) },
  { method: "POST", pattern: /^\/v1\/owner\/issues\/(?<id>[^/]+)\/send$/, family: "owner", durable: false, owner: true, handler: (c, _r, p) => handleSendIssue(c, p.id!) },
  { method: "GET", pattern: /^\/v1\/owner\/stats$/, family: "owner", durable: false, owner: true, handler: (c) => handleStats(c) },
];

export interface RouteOptions {
  now?: () => Date;
}

export async function route(request: Request, env: Env, options: RouteOptions = {}): Promise<Response> {
  const requestId = resolveRequestId(request);
  const timings = createTimings();
  const url = new URL(request.url);
  const now = options.now ? options.now() : new Date();
  const path = url.pathname;

  const preflight = handlePreflight(request, env);
  if (preflight) return finalize(preflight, requestId, "preflight", timings);

  let response: Response;
  try {
    if (path === "/health") {
      response = request.method === "GET" ? await handleHealth(env, now) : methodNotAllowed(requestId);
      return finalize(applyCorsHeaders(response, request, env), requestId, "health", timings);
    }

    const candidates = ROUTES.filter((r) => r.pattern.test(path));
    if (candidates.length === 0) {
      return finalize(applyCorsHeaders(notFound(requestId, path), request, env), requestId, "unmatched", timings);
    }
    const matched = candidates.find((r) => r.method === request.method);
    if (!matched) {
      return finalize(applyCorsHeaders(methodNotAllowed(requestId), request, env), requestId, "unmatched", timings);
    }
    const params = (matched.pattern.exec(path)?.groups ?? {}) as Record<string, string>;
    for (const k of Object.keys(params)) params[k] = decodeURIComponent(params[k]!);
    const routeName = `${matched.method} ${matched.pattern.source}`;

    const today = now.toISOString().slice(0, 10);
    const visitor = await fingerprint(request, env, today);

    let limitKey = visitor;
    if (matched.owner) {
      const auth = await authenticateOwner(request, env, requestId);
      if (auth.kind === "denied") {
        return finalize(applyCorsHeaders(auth.response, request, env), requestId, routeName, timings);
      }
      limitKey = auth.tokenKey;
    }

    const limit = await timings.measure("ratelimit", () =>
      enforceRateLimit(env, matched.family, limitKey, requestId, matched.durable, now.getTime() / 1000),
    );
    if (limit.kind === "denied") {
      return finalize(applyCorsHeaders(limit.response, request, env), requestId, routeName, timings);
    }

    const ctx = buildContext(env, requestId, timings, visitor, now);
    response = await matched.handler(ctx, request, params);
    return finalize(applyCorsHeaders(response, request, env), requestId, routeName, timings, limit.headers);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "unhandled", requestId, path, error: err instanceof Error ? err.message : String(err) }));
    const failure = errorResponse("internal_error", "Unexpected error", 500, requestId);
    return finalize(applyCorsHeaders(failure, request, env), requestId, "error", timings);
  }
}
