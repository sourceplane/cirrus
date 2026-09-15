import type { ErrorCode } from "@site/contracts/errors";
import { newId } from "@site/shared/ids";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

export function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return newId("req");
}

export function json<T>(value: T, status = 200): Response {
  return Response.json(value, { status, headers: { "content-type": "application/json" } });
}

export function errorResponse(code: ErrorCode | string, message: string, status: number, requestId: string, details?: Record<string, unknown>): Response {
  return Response.json({ error: { code, message, details: details ?? {}, requestId } }, { status, headers: { "content-type": "application/json" } });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return null;
}
