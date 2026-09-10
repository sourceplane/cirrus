import type { Monitor } from "@saas/db/monitors";
import type { Deps } from "./deps.js";
import { avgLatency, uptimePercent } from "./incidents.js";
import type { MonitorStats } from "./mappers.js";

const DAY_MS = 86_400_000;

/** The 24-hour and 7-day rollups shown next to a monitor. */
export async function statsFor(deps: Deps, monitor: Monitor): Promise<MonitorStats> {
  const now = deps.now();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);

  // One read covers both windows: the 24-hour figures are a filter over the
  // week's checks rather than a second query.
  const week = await deps.repo.checksSince(monitor.id, weekAgo);
  if (!week.ok) return { uptime24h: null, uptime7d: null, avgLatencyMs24h: null };

  const lastDay = week.value.filter((c) => c.checkedAt >= dayAgo);
  return {
    uptime24h: uptimePercent(week.value, dayAgo, now),
    uptime7d: uptimePercent(week.value, weekAgo, now),
    avgLatencyMs24h: avgLatency(lastDay),
  };
}

/** Stats for a list of monitors, resolved together. */
export async function statsForAll(deps: Deps, monitors: Monitor[]): Promise<Map<string, MonitorStats>> {
  const entries = await Promise.all(monitors.map(async (m) => [m.id, await statsFor(deps, m)] as const));
  return new Map(entries);
}
