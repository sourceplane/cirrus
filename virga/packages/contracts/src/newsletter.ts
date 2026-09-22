// Newsletter contract — issues the owner writes and the mail-worker sends.
//
// An issue is authored in the repo (or via the CLI) and sent once; the
// deliveries table is the receipt: one row per confirmed subscriber at send
// time, so a re-run of a broadcast only reaches recipients that were never
// attempted.

export type IssueStatus = "draft" | "sending" | "sent";

export const ISSUE_STATUSES: readonly IssueStatus[] = ["draft", "sending", "sent"];

export type DeliveryStatus = "queued" | "sent" | "failed" | "skipped";

export interface Issue {
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

export interface CreateIssueRequest {
  slug: string;
  subject: string;
  html: string;
  /** Plain-text alternative; derived from the HTML when omitted. */
  text?: string;
}

export interface Delivery {
  id: string;
  issueId: string;
  subscriberId: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
  attemptedAt: string | null;
}

export interface IssueSendReport {
  issueId: string;
  status: IssueStatus;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}
