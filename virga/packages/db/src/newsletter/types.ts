export type { SqlExecutor } from "../d1/executor.js";

export type IssueStatus = "draft" | "sending" | "sent";
export type DeliveryStatus = "queued" | "sent" | "failed" | "skipped";

export type NewsletterError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type NewsletterResult<T> = { ok: true; value: T } | { ok: false; error: NewsletterError };

export interface StoredIssue {
  id: string;
  slug: string;
  subject: string;
  html: string;
  text: string;
  status: IssueStatus;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface CreateIssueInput {
  id: string;
  slug: string;
  subject: string;
  html: string;
  text: string;
  now: string;
}

export interface StoredDelivery {
  id: string;
  issueId: string;
  subscriberId: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
  attemptedAt: string | null;
}

/** A queued delivery joined with what the sender needs to address it. */
export interface QueuedDelivery extends StoredDelivery {
  email: string;
}

export interface MarkDeliveryInput {
  id: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
  attemptedAt: string;
}

export interface DeliveryCounts {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface ListIssuesInput {
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

export interface IssuePage {
  items: StoredIssue[];
  nextCursor: string | null;
}

export interface NewsletterRepository {
  createIssue(input: CreateIssueInput): Promise<NewsletterResult<StoredIssue>>;
  findIssueById(id: string): Promise<NewsletterResult<StoredIssue>>;
  findIssueBySlug(slug: string): Promise<NewsletterResult<StoredIssue>>;
  listIssues(input: ListIssuesInput): Promise<NewsletterResult<IssuePage>>;
  markIssueStatus(id: string, status: IssueStatus, now: string): Promise<NewsletterResult<StoredIssue>>;
  /** Queue one delivery per confirmed subscriber not yet queued; returns how many were added. */
  enqueueDeliveries(issueId: string): Promise<NewsletterResult<number>>;
  nextQueuedDeliveries(issueId: string, limit: number): Promise<NewsletterResult<QueuedDelivery[]>>;
  markDelivery(input: MarkDeliveryInput): Promise<NewsletterResult<StoredDelivery>>;
  deliveryCounts(issueId: string): Promise<NewsletterResult<DeliveryCounts>>;
  countIssues(): Promise<NewsletterResult<{ sent: number; drafts: number }>>;
}
