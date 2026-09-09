// The owner is a bearer token (decision D3).

import type { Env } from "./env.js";
import { sha256Hex, timingSafeEqual } from "./crypto.js";
import { errorResponse } from "./http.js";

export type OwnerAuth =
  | { kind: "ok"; tokenKey: string }
  | { kind: "denied"; response: Response };

export async function authenticateOwner(request: Request, env: Env, requestId: string): Promise<OwnerAuth> {
  const secret = env.OWNER_TOKEN;
  if (!secret || secret.length < 16) {
    return {
      kind: "denied",
      response: errorResponse("precondition_failed", "Owner routes are not configured on this deployment", 503, requestId),
    };
  }
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!presented || !timingSafeEqual(presented, secret)) {
    return { kind: "denied", response: errorResponse("unauthenticated", "Owner token required", 401, requestId) };
  }
  return { kind: "ok", tokenKey: (await sha256Hex(presented)).slice(0, 32) };
}
