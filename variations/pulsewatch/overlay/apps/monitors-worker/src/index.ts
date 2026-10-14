import type { Env } from "./env.js";
import { createDeps } from "./deps.js";
import { route } from "./router.js";
import { runDueChecks } from "./scheduler.js";

/**
 * Two entry points, one worker: HTTP for the product's API, and the cron that
 * actually does the monitoring. The cron wakes every minute (see
 * wrangler.template.jsonc) and each monitor's interval decides whether it is
 * probed on that wake.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return route(request, env);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const deps = createDeps(env);
    if (!deps) return;
    // waitUntil keeps the batch alive past the handler's return without making
    // the cron wait on it.
    ctx.waitUntil(
      (async () => {
        try {
          await runDueChecks(deps);
        } finally {
          await deps.dispose();
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
