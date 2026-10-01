import type { HealthResponse } from "@site/contracts/health";
import { createD1Adapter } from "@site/db/d1";
import type { Env } from "../env.js";
import { json } from "../http.js";

export async function handleHealth(env: Env, now: Date): Promise<Response> {
  const db = await createD1Adapter(env.SITE_DB ?? null).ping();
  const body: HealthResponse & { checks: Record<string, unknown> } = {
    status: db.configured && db.reachable ? "ok" : "degraded",
    service: "site-api",
    environment: env.ENVIRONMENT,
    timestamp: now.toISOString(),
    checks: { db, mail: Boolean(env.MAIL_WORKER), owner: Boolean(env.OWNER_TOKEN) },
  };
  return json(body, body.status === "ok" ? 200 : 503);
}
