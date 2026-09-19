import type { MailProvider, ProviderSendResult, RenderedMail } from "@site/contracts/mail";

export interface RecordedMail extends RenderedMail {
  to: string;
  messageId: string;
}

/**
 * Records a synthetic send and contacts nothing. The default everywhere a
 * real provider is not configured, and the worker's guarantee that it is
 * always deployable.
 */
export function createLocalDebugProvider(log = true): MailProvider & { sent: RecordedMail[] } {
  const sent: RecordedMail[] = [];
  return {
    name: "local-debug",
    sent,
    async send(message): Promise<ProviderSendResult> {
      const messageId = `local-${sent.length + 1}-${Date.now().toString(36)}`;
      sent.push({ ...message, messageId });
      if (log) {
        // eslint-disable-next-line no-console -- the debug provider's whole job is this line
        console.log(JSON.stringify({ level: "info", msg: "mail.local_debug", to: message.to, subject: message.subject, messageId }));
      }
      return { ok: true, providerMessageId: messageId, error: null };
    },
  };
}
