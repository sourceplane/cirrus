import type { HabitsRepository } from "@saas/db/habits";
import { createHabitsRepository } from "@saas/db/habits";
import { createSqlExecutor } from "@saas/db/d1";
import type { Env } from "./env.js";

/** Everything a handler needs beyond the request: injectable for tests. */
export interface Deps {
  repo: HabitsRepository;
  now: () => Date;
  newId: () => string;
  dispose: () => Promise<void>;
}

export function createDeps(env: Env): Deps | null {
  if (!env.PLATFORM_DB) return null;
  const executor = createSqlExecutor(env.PLATFORM_DB);
  return {
    repo: createHabitsRepository(executor),
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
