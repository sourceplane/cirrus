import type { MonitorsRepository } from "@saas/db/monitors";
import { createMonitorsRepository } from "@saas/db/monitors";
import { createSqlExecutor } from "@saas/db/d1";
import type { Env } from "./env.js";
import { httpProbe, type Probe } from "./probe.js";

/** Everything a handler needs beyond the request: injectable for tests. */
export interface Deps {
  repo: MonitorsRepository;
  probe: Probe;
  now: () => Date;
  newId: () => string;
  dispose: () => Promise<void>;
}

export function createDeps(env: Env): Deps | null {
  if (!env.PLATFORM_DB) return null;
  const executor = createSqlExecutor(env.PLATFORM_DB);
  return {
    repo: createMonitorsRepository(executor),
    probe: httpProbe,
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    dispose: () => executor.dispose(),
  };
}

export interface Actor {
  subjectId: string;
  subjectType: string;
}

export function resolveActor(request: Request): Actor | null {
  const subjectId = request.headers.get("x-actor-subject-id");
  const subjectType = request.headers.get("x-actor-subject-type");
  if (!subjectId || !subjectType) return null;
  return { subjectId, subjectType };
}
