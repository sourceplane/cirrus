// The cron entry point: probe everything that is due.
//
// The Worker wakes every minute; each monitor's own interval decides whether
// it is actually checked, so a one-minute monitor is probed every wake and an
// hourly one every sixtieth.

import type { Deps } from "./deps.js";
import { runCheck } from "./checks.js";

/** How many monitors one wake will probe, and how many at a time. */
const BATCH = 100;
const CONCURRENCY = 10;

export interface SchedulerResult {
  due: number;
  checked: number;
}

export async function runDueChecks(deps: Deps): Promise<SchedulerResult> {
  const due = await deps.repo.dueMonitors(deps.now(), BATCH);
  if (!due.ok) return { due: 0, checked: 0 };

  let checked = 0;
  // Bounded concurrency: a wake must not open a hundred sockets at once, and
  // a slow endpoint must not stall the whole batch behind it.
  for (let i = 0; i < due.value.length; i += CONCURRENCY) {
    const slice = due.value.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((m) => runCheck(deps, m)));
    checked += results.filter((r) => r !== null).length;
  }

  return { due: due.value.length, checked };
}
