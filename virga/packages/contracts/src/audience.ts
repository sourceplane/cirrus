// Audience contract — the people who asked to hear from the site.
//
// Subscription is double opt-in: `POST /v1/subscribers` records a pending
// subscriber and sends a confirmation mail; following the link confirms.
// Every subscriber-facing token is single-purpose, hashed at rest, and
// carried only in URLs the mail-worker rendered.

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export const SUBSCRIBER_STATUSES: readonly SubscriberStatus[] = [
  "pending",
  "confirmed",
  "unsubscribed",
];

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  /** Where the signup came from — a page slug, a form key, `cli`, `import`. */
  source: string | null;
  tags: string[];
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export interface SubscribeRequest {
  email: string;
  source?: string;
  tags?: string[];
  /** Cloudflare Turnstile response, required when the edge has a secret configured. */
  turnstileToken?: string;
}

export interface SubscribeResponse {
  /** `pending` when a confirmation mail was (re)sent; `confirmed` when the address already was. */
  status: "pending" | "confirmed";
}

export interface ConfirmSubscriptionResponse {
  status: "confirmed";
  email: string;
}

export interface UnsubscribeRequest {
  token: string;
}

export interface UnsubscribeResponse {
  status: "unsubscribed";
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;

/** Canonical form of an address: trimmed, lower-cased. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
