import type { Env } from "./env.js";

// The site is the only browser client. Its origins come from SITE_ORIGINS
// (comma-separated, set per environment in the wrangler template); local
// dev hosts are allowed outside prod.

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ALLOWED_HEADERS = "content-type, x-request-id, authorization";
const EXPOSED_HEADERS = "x-request-id, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset";
const ALLOWED_METHODS = "GET, POST, PATCH, OPTIONS";

export function allowedOrigins(env: Env): string[] {
  return (env.SITE_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  if (env.ENVIRONMENT !== "prod" && LOCALHOST_RE.test(origin)) return true;
  return allowedOrigins(env).includes(origin);
}

export function handlePreflight(request: Request, env: Env): Response | null {
  if (request.method !== "OPTIONS") return null;
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin!,
      "access-control-allow-methods": ALLOWED_METHODS,
      "access-control-allow-headers": ALLOWED_HEADERS,
      "access-control-expose-headers": EXPOSED_HEADERS,
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}

export function applyCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, env)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin!);
  headers.set("access-control-expose-headers", EXPOSED_HEADERS);
  headers.set("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
