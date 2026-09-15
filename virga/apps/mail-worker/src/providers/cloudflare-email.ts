import type { MailProvider, ProviderSendResult } from "@site/contracts/mail";
import { errorMessage } from "@site/shared/errors";

/**
 * Cloudflare Email Service provider. The `send_email` binding is the
 * credential — nothing to inject. Prerequisites (one-time, per account):
 * Workers Paid plan, sending domain verified in Email Service (DKIM/SPF),
 * EMAIL_FROM_ADDRESS on that domain.
 */

export interface CloudflareEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Structural type of the binding, so tests can hand in a fake. */
export interface CloudflareEmailSender {
  send(message: CloudflareEmailMessage): Promise<{ messageId: string }>;
}

export function createCloudflareEmailProvider(opts: {
  email: CloudflareEmailSender;
  fromAddress: string;
  fromName?: string | undefined;
}): MailProvider {
  const from = opts.fromName ? `${opts.fromName} <${opts.fromAddress}>` : opts.fromAddress;
  return {
    name: "cloudflare-email",
    async send(message): Promise<ProviderSendResult> {
      try {
        const result = await opts.email.send({ from, to: message.to, subject: message.subject, html: message.html, text: message.text });
        if (!result || typeof result.messageId !== "string" || result.messageId.length === 0) {
          return { ok: false, providerMessageId: null, error: "cloudflare_email_missing_message_id" };
        }
        return { ok: true, providerMessageId: result.messageId, error: null };
      } catch (err) {
        return { ok: false, providerMessageId: null, error: `cloudflare_email_send_failed: ${errorMessage(err, 160)}` };
      }
    },
  };
}
