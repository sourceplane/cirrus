// The incident state machine and the uptime arithmetic.
//
// Pure: checks in, verdict out. Keeping it here means the rule that decides
// when a person gets woken up is one readable function with its own tests,
// rather than something implied by the order of database writes.

import type { Check, MonitorStatus } from "@saas/db/monitors";

/** One failure is a blip; two in a row is an outage. */
export const FAILURE_THRESHOLD = 2;

export interface MonitorState {
  status: MonitorStatus;
  consecutiveFailures: number;
  /** Whether an incident is currently open for this monitor. */
  incidentOpen: boolean;
}

export interface StateTransition {
  status: MonitorStatus;
  consecutiveFailures: number;
  /** Open a new incident now. */
  openIncident: boolean;
  /** Resolve the currently open incident now. */
  resolveIncident: boolean;
}

/**
 * Fold one check result into a monitor's state.
 *
 * A single failure leaves the status alone — endpoints hiccup — and only the
 * second consecutive one flips the monitor to `down` and opens an incident.
 * Recovery is immediate: the first success resolves an open incident, because
 * waiting to believe good news helps nobody.
 */
export function applyCheck(state: MonitorState, ok: boolean): StateTransition {
  if (ok) {
    return {
      status: "up",
      consecutiveFailures: 0,
      openIncident: false,
      resolveIncident: state.incidentOpen,
    };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  const down = consecutiveFailures >= FAILURE_THRESHOLD;
  return {
    status: down ? "down" : state.status,
    consecutiveFailures,
    // Only the crossing opens an incident, and never a second one on top of an
    // incident already open.
    openIncident: down && !state.incidentOpen,
    resolveIncident: false,
  };
}

/** Share of successful checks in the window, 0–100; null with no data. */
export function uptimePercent(checks: Check[], from: Date, to: Date): number | null {
  const inWindow = checks.filter((c) => c.checkedAt >= from && c.checkedAt <= to);
  if (inWindow.length === 0) return null;
  const up = inWindow.filter((c) => c.ok).length;
  return Math.round((up / inWindow.length) * 1000) / 10;
}

/** Mean latency of the successful checks, rounded; null with no data. */
export function avgLatency(checks: Check[]): number | null {
  const timed = checks.filter((c) => c.ok && typeof c.latencyMs === "number");
  if (timed.length === 0) return null;
  const total = timed.reduce((sum, c) => sum + (c.latencyMs ?? 0), 0);
  return Math.round(total / timed.length);
}

/** Is this monitor due at `now`, given when it was last checked? */
export function isDue(lastCheckedAt: Date | null, intervalSec: number, now: Date): boolean {
  if (!lastCheckedAt) return true;
  return now.getTime() - lastCheckedAt.getTime() >= intervalSec * 1000;
}
