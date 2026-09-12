export type { SqlExecutor } from "../d1/executor.js";

export type ReactionKind = "upvote" | "like";

export type EngagementError = { kind: "internal"; message: string };

export type EngagementResult<T> = { ok: true; value: T } | { ok: false; error: EngagementError };

export interface ToggleReactionInput {
  /** Used only when the toggle turns the reaction on. */
  id: string;
  slug: string;
  kind: ReactionKind;
  visitor: string;
  now: string;
}

export interface ReactionSummary {
  slug: string;
  counts: Record<ReactionKind, number>;
  viewer: Record<ReactionKind, boolean>;
}

export interface ViewSummary {
  slug: string;
  total: number;
  last7Days: number;
}

export interface TopInput {
  prefix?: string | undefined;
  /** 0 or undefined = all time (read from the totals table). */
  windowDays?: number | undefined;
  limit?: number | undefined;
  /** YYYY-MM-DD (UTC) of "today", so tests can pin the clock. */
  today: string;
}

export interface RankedSlug {
  slug: string;
  upvotes: number;
  views: number;
  score: number;
}

export interface EngagementTotals {
  reactions: Record<ReactionKind, number>;
  views: { total: number; last7Days: number };
}

export interface EngagementRepository {
  toggleReaction(input: ToggleReactionInput): Promise<EngagementResult<ReactionSummary>>;
  reactionSummary(slug: string, visitor: string | null): Promise<EngagementResult<ReactionSummary>>;
  recordView(slug: string, day: string): Promise<EngagementResult<void>>;
  viewSummary(slug: string, today: string): Promise<EngagementResult<ViewSummary>>;
  top(input: TopInput): Promise<EngagementResult<RankedSlug[]>>;
  totals(today: string): Promise<EngagementResult<EngagementTotals>>;
}
