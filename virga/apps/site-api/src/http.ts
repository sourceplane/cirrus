import type { ErrorCode } from "@site/contracts/errors";
import type { Timings } from "@site/contracts/timing";
import { appendServerTiming, shouldEmitTimingLog } from "@site/contracts/timing";
import { newId } from "@site/shared/ids";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

export function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return newId("req");
}

/** Success bodies ARE the contract shapes; only errors wear an envelope. */
export function json<T>(value: T, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { "content-type": "application/json", ...headers } });
}

export function errorResponse(
  code: ErrorCode | string,
  message: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    { error: { code, message, details: details ?? {}, requestId } },
    { status, headers: { "content-type": "application/json" } },
  );
}

export function notFound(requestId: string, path: string): Response {
  return errorResponse("not_found", `Route not found: ${path}`, 404, requestId);
}

export function methodNotAllowed(requestId: string): Response {
  return errorResponse("unsupported", "Method not allowed", 405, requestId);
}

export function validationError(requestId: string, fields: Record<string, string[]>): Response {
  return errorResponse("validation_failed", "Validation failed", 422, requestId, { fields });
}

/** Parse a JSON object body; anything else is `null`. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Decorate a response with the request id, timings and extra headers. */
export function finalize(
  response: Response,
  requestId: string,
  route: string,
  timings: Timings,
  extra: Record<string, string> = {},
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  const addition = timings.header();
  if (addition) headers.set("Server-Timing", appendServerTiming(headers.get("Server-Timing"), addition));
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  const phases = timings.toJSON();
  if (shouldEmitTimingLog(phases)) {
    // eslint-disable-next-line no-console -- structured timing line for observability
    console.log(JSON.stringify({ level: "info", msg: "timing", route, requestId, phases }));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Today's date as YYYY-MM-DD (UTC). */
export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
