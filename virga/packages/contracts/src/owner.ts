// Owner contract — the routes behind `Authorization: Bearer <OWNER_TOKEN>`.
//
// There is no console: the owner operates through the CLI, which speaks
// exactly these shapes. Every owner route is under `/v1/owner/` so the edge
// can gate them in one place.

import type { SubscriberStatus } from "./audience.js";
import type { SubmissionStatus } from "./forms.js";

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page; null when this is the last page. */
  nextCursor: string | null;
}

export interface ListSubscribersQuery {
  status?: SubscriberStatus;
  cursor?: string;
  limit?: number;
}

export interface ListSubmissionsQuery {
  form?: string;
  status?: SubmissionStatus;
  cursor?: string;
  limit?: number;
}

export interface UpdateSubmissionRequest {
  status: SubmissionStatus;
}

export interface SiteStats {
  subscribers: Record<SubscriberStatus, number>;
  submissions: { new: number; total: number };
  views: { total: number; last7Days: number };
  reactions: { upvotes: number; likes: number };
  issues: { sent: number; drafts: number };
  generatedAt: string;
}

export const OWNER_PAGE_LIMIT = { default: 50, max: 500 } as const;
