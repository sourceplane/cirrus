// Engagement contract — reactions and view counts on any slug.
//
// A slug is whatever the site addresses: `posts/hello`, `launches/acme`,
// `projects/tool`. Reactions are toggles keyed on a salted visitor
// fingerprint (one upvote per visitor per slug); views are daily counters.
// Neither identifies a person: the fingerprint is SHA-256(ip + user-agent +
// a daily-rotating salt) and the salt is never stored.

export type ReactionKind = "upvote" | "like";

export const REACTION_KINDS: readonly ReactionKind[] = ["upvote", "like"];

export const SLUG_RE = /^[a-z0-9][a-z0-9/_-]{0,119}$/;

export interface ReactRequest {
  kind: ReactionKind;
}

export interface ReactionSummary {
  slug: string;
  counts: Record<ReactionKind, number>;
  /** Which reactions THIS visitor currently holds on the slug. */
  viewer: Record<ReactionKind, boolean>;
}

export interface ViewSummary {
  slug: string;
  total: number;
  last7Days: number;
}

export interface RankedSlug {
  slug: string;
  upvotes: number;
  views: number;
  /** Ranking score: upvotes weighted over views, decayed by age when known. */
  score: number;
}

export interface TopRequest {
  /** Restrict to slugs under a prefix, e.g. `launches/`. */
  prefix?: string;
  /** Window in days over which reactions count; 0 = all time. */
  windowDays?: number;
  limit?: number;
}
