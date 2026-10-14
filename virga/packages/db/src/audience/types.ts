export type { SqlExecutor } from "../d1/executor.js";

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export type AudienceError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type AudienceResult<T> = { ok: true; value: T } | { ok: false; error: AudienceError };

export interface StoredSubscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  source: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export interface UpsertPendingInput {
  /** Used only when the address is new. */
  id: string;
  email: string;
  source: string | null;
  tags: string[];
  /** SHA-256 hex of the plaintext confirm token in the mail. */
  confirmTokenHash: string;
  now: string;
}

export interface UpsertPendingOutcome {
  subscriber: StoredSubscriber;
  /** What the address was before this call: `null` for a brand-new address. */
  previousStatus: SubscriberStatus | null;
  /** True when a confirmation mail should go out (new, pending, or revived). */
  needsConfirmation: boolean;
}

export interface ListSubscribersInput {
  status?: SubscriberStatus | undefined;
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

export interface SubscriberPage {
  items: StoredSubscriber[];
  nextCursor: string | null;
}

export interface AudienceRepository {
  upsertPending(input: UpsertPendingInput): Promise<AudienceResult<UpsertPendingOutcome>>;
  confirmByToken(confirmTokenHash: string, now: string): Promise<AudienceResult<StoredSubscriber>>;
  unsubscribeById(id: string, now: string): Promise<AudienceResult<StoredSubscriber>>;
  findById(id: string): Promise<AudienceResult<StoredSubscriber>>;
  findByEmail(email: string): Promise<AudienceResult<StoredSubscriber>>;
  list(input: ListSubscribersInput): Promise<AudienceResult<SubscriberPage>>;
  countByStatus(): Promise<AudienceResult<Record<SubscriberStatus, number>>>;
}
