import type { HealthResponse } from "@site/contracts/health";
import { createD1Adapter } from "@site/db/d1";
import type { Env } from "./env.js";
import { handleBroadcast } from "./handlers/broadcast.js";
import { handleSend } from "./handlers/send.js";
import { errorResponse, json, resolveRequestId } from "./http.js";
import { resolveProvider } from "./providers/index.js";

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);
  const withId = (res: Response) => {
    const headers = new Headers(res.headers);
    headers.set("x-request-id", requestId);
    return new Response(res.body, { status: res.status, headers });
  };
  try {
    if (url.pathname === "/health" && request.method === "GET") {
      const db = await createD1Adapter(env.SITE_DB ?? null).ping();
      const body: HealthResponse & { checks: Record<string, unknown> } = {
        status: db.configured && db.reachable ? "ok" : "degraded",
        service: "mail-worker",
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
        checks: { db, provider: (env.MAIL_PROVIDER ?? "local-debug").toLowerCase() },
      };
      return withId(json(body, body.status === "ok" ? 200 : 503));
    }
    if (url.pathname === "/v1/mail/send" && request.method === "POST") {
      return withId(await handleSend(request, env, resolveProvider(env), requestId));
    }
    if (url.pathname === "/v1/mail/broadcast" && request.method === "POST") {
      return withId(await handleBroadcast(request, env, resolveProvider(env), requestId));
    }
    return withId(errorResponse("not_found", `Route not found: ${url.pathname}`, 404, requestId));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "unhandled", requestId, error: err instanceof Error ? err.message : String(err) }));
    return withId(errorResponse("internal_error", "Unexpected error", 500, requestId));
  }
}
