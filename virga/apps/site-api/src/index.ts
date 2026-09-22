import type { Env } from "./env.js";
import { route } from "./router.js";

export type { Env } from "./env.js";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return route(request, env);
  },
} satisfies ExportedHandler<Env>;
