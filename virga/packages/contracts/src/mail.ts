// Mail contract — the seam between site-api and mail-worker.
//
// site-api never renders an email and never holds a provider credential: it
// asks mail-worker for a template by key with redaction-safe data, and
// mail-worker renders and sends through whichever provider the environment
// configured. Template data is bounded scalars only — never a raw token that
// is not meant for the recipient.

export type MailTemplateKey =
  | "subscribe.confirm"
  | "subscribe.welcome"
  | "form.receipt"
  | "issue.broadcast";

export const MAIL_TEMPLATE_KEYS: readonly MailTemplateKey[] = [
  "subscribe.confirm",
  "subscribe.welcome",
  "form.receipt",
  "issue.broadcast",
];

export type MailTemplateData = Record<string, string | number | boolean | null>;

export interface MailSendRequest {
  templateKey: MailTemplateKey;
  to: string;
  templateData: MailTemplateData;
}

export interface MailSendResponse {
  ok: boolean;
  provider: string;
  providerMessageId: string | null;
  error: string | null;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export interface ProviderSendResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
}

/** The adapter every delivery provider implements. */
export interface MailProvider {
  readonly name: string;
  send(message: RenderedMail & { to: string }): Promise<ProviderSendResult>;
}

export interface BroadcastRequest {
  issueId: string;
  /** Recipients per provider batch; the worker paces itself between batches. */
  batchSize?: number;
}
