import type { Env } from "../env.js";
import { successResponse } from "../http.js";

export function handleHealth(env: Env, requestId: string): Response {
  return successResponse(
    {
      service: "habits-worker",
      environment: env.ENVIRONMENT ?? "local",
      checks: { database: { configured: !!env.PLATFORM_DB } },
    },
    requestId,
  );
}
