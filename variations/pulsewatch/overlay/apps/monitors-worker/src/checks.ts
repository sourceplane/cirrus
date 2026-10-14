// Running a check and folding its result into the monitor's state.
//
// Shared by the scheduler (many monitors, on a cron) and the "run check now"
// button (one monitor, on demand), so both take exactly the same path through
// the incident state machine.

import type { Monitor } from "@saas/db/monitors";
import type { Check } from "@saas/db/monitors";
import type { Deps } from "./deps.js";
import { applyCheck } from "./incidents.js";

const MAX_ERROR_LENGTH = 500;

export interface CheckOutcome {
  check: Check;
  monitor: Monitor;
}

/**
 * Probe one monitor, persist the result, and open or resolve an incident when
 * the state machine says so.
 *
 * D1 has no interactive transaction, so the writes are ordered by what a
 * failure between them would cost: the check row first (the evidence), then
 * the incident (the story), then the monitor's own state (the summary that can
 * be recomputed from the other two).
 */
export async function runCheck(deps: Deps, monitor: Monitor): Promise<CheckOutcome | null> {
  const startedAt = deps.now();
  const result = await deps.probe(monitor.url, monitor.method, monitor.expectedStatus);

  const recorded = await deps.repo.recordCheck({
    id: deps.newId(),
    monitorId: monitor.id,
    userId: monitor.userId,
    checkedAt: startedAt,
    ok: result.ok,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    error: result.error ? result.error.slice(0, MAX_ERROR_LENGTH) : null,
  });
  if (!recorded.ok) return null;

  const transition = applyCheck(
    {
      status: monitor.lastStatus,
      consecutiveFailures: monitor.consecutiveFailures,
      // `down` is exactly the state in which an incident is open, so the
      // monitor's own status is the answer — no extra read.
      incidentOpen: monitor.lastStatus === "down",
    },
    result.ok,
  );

  if (transition.openIncident) {
    await deps.repo.openIncident({
      id: deps.newId(),
      monitorId: monitor.id,
      userId: monitor.userId,
      openedAt: startedAt,
      cause: result.error ?? `Unexpected status ${result.statusCode ?? "none"}`,
    });
  }
  if (transition.resolveIncident) {
    await deps.repo.resolveOpenIncident(monitor.id, startedAt);
  }

  const updated = await deps.repo.applyMonitorState(monitor.id, {
    lastCheckedAt: startedAt,
    lastStatus: transition.status,
    consecutiveFailures: transition.consecutiveFailures,
  });
  if (!updated.ok) return null;

  return { check: recorded.value, monitor: updated.value };
}
