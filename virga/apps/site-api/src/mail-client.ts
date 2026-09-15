// The site-api side of the mail seam: a thin client over the MAIL_WORKER
// service binding. Every call is best-effort from the caller's point of
// view — a mail failure is logged and reported, never thrown into a
// visitor's request.

import type { BroadcastRequest, IssueSendReport, MailSendRequest, MailSendResponse } from "@site/contracts";
import type { Env } from "./env.js";

const BASE = "https://mail-worker.internal";

export interface MailClient {
  send(request: MailSendRequest, requestId: string): Promise<MailSendResponse>;
  broadcast(request: BroadcastRequest, requestId: string): Promise<IssueSendReport | { error: string }>;
}

export function createMailClient(env: Env): MailClient {
  const binding = env.MAIL_WORKER;
  async function post<T>(path: string, body: unknown, requestId: string): Promise<T | { error: string }> {
    if (!binding) return { error: "mail_worker_unbound" };
    try {
      const res = await binding.fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as T | { error: { code?: string; message?: string } };
      if (!res.ok) {
        const err = (data as { error?: { code?: string } }).error;
        return { error: err?.code ?? `mail_worker_${res.status}` };
      }
      return data as T;
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", msg: "mail.call_failed", path, requestId, error: String(err) }));
      return { error: "mail_worker_unreachable" };
    }
  }
  return {
    async send(request, requestId) {
      const result = await post<MailSendResponse>("/v1/mail/send", request, requestId);
      if ("error" in result && typeof result.error === "string") {
        return { ok: false, provider: "none", providerMessageId: null, error: result.error };
      }
      return result as MailSendResponse;
    },
    broadcast(request, requestId) {
      return post<IssueSendReport>("/v1/mail/broadcast", request, requestId);
    },
  };
}
