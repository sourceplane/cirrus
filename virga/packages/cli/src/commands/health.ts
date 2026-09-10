import type { HealthResponse } from "@site/contracts/health";
import type { CommandContext } from "../runner.js";
import { EXIT } from "../exit.js";
import { json } from "../output.js";
import { fail } from "./shared.js";

export async function runHealth(ctx: CommandContext): Promise<number> {
  const r = await ctx.client.json<HealthResponse & { checks?: Record<string, unknown> }>("GET", "/health");
  if (!r.ok) {
    // A degraded deployment answers 503 with a body; show it rather than the envelope.
    if (r.failure.kind === "api" && r.failure.status === 503) {
      ctx.out(ctx.json ? json({ status: "degraded" }) : "degraded: site-api is up but a dependency is not reachable");
      return EXIT.api;
    }
    return fail(ctx, r.failure);
  }
  if (ctx.json) ctx.out(json(r.value));
  else ctx.out(`${r.value.status}: ${r.value.service} (${r.value.environment}) at ${r.value.timestamp}`);
  return EXIT.ok;
}
