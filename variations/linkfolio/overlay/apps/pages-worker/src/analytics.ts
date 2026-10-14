// Pure click aggregation for the analytics view. Kept separate from the
// handler so the windowing and bucketing rules are unit-testable without a
// database.

import type { Block, ClickRow } from "@saas/db/pages";
import type { BlockClickCount, DailyClickCount } from "@saas/contracts/pages";
import { blockPublicId } from "./ids.js";

/** Midnight UTC, `days` days back inclusive of today (days=1 → today only). */
export function windowStart(days: number, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every day in the window, oldest first — so the chart has no gaps. */
export function dayKeys(days: number, now: Date): string[] {
  const start = windowStart(days, now);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(dayKey(d));
  }
  return out;
}

export interface ClickSummary {
  totalClicks: number;
  byBlock: BlockClickCount[];
  byDay: DailyClickCount[];
}

/**
 * Aggregate raw click rows into the analytics response shape. Blocks with no
 * clicks are still listed (at zero) so the table matches the editor, and every
 * day in the window appears even when empty.
 */
export function summarizeClicks(clicks: ClickRow[], blocks: Block[], days: number, now: Date): ClickSummary {
  const perBlock = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const key of dayKeys(days, now)) perDay.set(key, 0);

  for (const c of clicks) {
    perBlock.set(c.blockId, (perBlock.get(c.blockId) ?? 0) + 1);
    const key = dayKey(c.occurredAt);
    // A click older than the window (or clock skew ahead of it) is counted in
    // the total but has no bucket to land in.
    if (perDay.has(key)) perDay.set(key, perDay.get(key)! + 1);
  }

  const byBlock: BlockClickCount[] = blocks
    .map((b) => ({ blockId: blockPublicId(b.id), title: b.title, clicks: perBlock.get(b.id) ?? 0 }))
    .sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title));

  const byDay: DailyClickCount[] = [...perDay.entries()].map(([date, count]) => ({ date, clicks: count }));

  return { totalClicks: clicks.length, byBlock, byDay };
}
