// Static email templates, keyed by the `templateKey` site-api passes.
//
// Every substitution is HTML-escaped before it reaches the html body, so a
// hostile value in templateData (a form field, a subject line) can never
// inject markup. Renderers read only the fields they need; unknown template
// keys return null so the provider fails the send with a bounded reason
// instead of delivering an empty message.

import type { MailTemplateData, MailTemplateKey, RenderedMail } from "@site/contracts/mail";

export interface TemplateOptions {
  siteName: string;
  siteUrl: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(data: MailTemplateData, key: string): string {
  const v = data[key];
  return v === null || v === undefined ? "" : String(v);
}

function layout(title: string, bodyHtml: string, footerHtml: string): string {
  return [
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">`,
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">`,
    bodyHtml,
    `</div><p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#777">${footerHtml}</p>`,
    `</body></html>`,
  ].join("");
}

type Renderer = (data: MailTemplateData, opts: TemplateOptions) => RenderedMail;

const RENDERERS: Record<MailTemplateKey, Renderer> = {
  "subscribe.confirm": (data, opts) => {
    const site = str(data, "siteName") || opts.siteName;
    const url = str(data, "confirmUrl");
    return {
      subject: `Confirm your subscription to ${site}`,
      html: layout(
        `Confirm your subscription`,
        `<h1 style="font-size:20px;margin:0 0 16px">One more step</h1>` +
          `<p>Confirm that you want to hear from <strong>${escapeHtml(site)}</strong>:</p>` +
          `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;border-radius:6px;text-decoration:none">Confirm subscription</a></p>` +
          `<p style="font-size:13px;color:#555">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`,
        `If you did not ask for this, ignore this email and nothing will happen.`,
      ),
      text: `Confirm that you want to hear from ${site}:\n\n${url}\n\nIf you did not ask for this, ignore this email and nothing will happen.\n`,
    };
  },
  "subscribe.welcome": (data, opts) => {
    const site = str(data, "siteName") || opts.siteName;
    const siteUrl = str(data, "siteUrl") || opts.siteUrl;
    const unsubscribeUrl = str(data, "unsubscribeUrl");
    return {
      subject: `You're subscribed to ${site}`,
      html: layout(
        `Welcome`,
        `<h1 style="font-size:20px;margin:0 0 16px">You're in</h1>` +
          `<p>Thanks for subscribing to <strong>${escapeHtml(site)}</strong>. New issues land in this inbox.</p>` +
          (siteUrl ? `<p><a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a></p>` : ""),
        unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#777">Unsubscribe</a>` : "",
      ),
      text: `Thanks for subscribing to ${site}. New issues land in this inbox.\n${siteUrl ? `\n${siteUrl}\n` : ""}${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}\n` : ""}`,
    };
  },
  "form.receipt": (data, opts) => {
    const site = str(data, "siteName") || opts.siteName;
    const form = str(data, "form");
    const id = str(data, "submissionId");
    const summary = str(data, "summary");
    return {
      subject: `[${site}] New ${form} submission`,
      html: layout(
        `New ${form} submission`,
        `<h1 style="font-size:20px;margin:0 0 16px">New <code>${escapeHtml(form)}</code> submission</h1>` +
          `<pre style="white-space:pre-wrap;font-family:inherit;background:#f6f6f4;padding:12px;border-radius:6px">${escapeHtml(summary)}</pre>` +
          `<p style="font-size:13px;color:#555">Submission ${escapeHtml(id)} — triage with <code>virga submissions list</code>.</p>`,
        `Sent by ${escapeHtml(site)} to its owner.`,
      ),
      text: `New ${form} submission (${id}):\n\n${summary}\n\nTriage with: virga submissions list\n`,
    };
  },
  "issue.broadcast": (data, opts) => {
    const site = str(data, "siteName") || opts.siteName;
    const subject = str(data, "subject");
    const html = str(data, "html");
    const text = str(data, "text");
    const unsubscribeUrl = str(data, "unsubscribeUrl");
    // The issue body is the owner's own HTML: trusted, not escaped. Everything
    // around it is.
    return {
      subject,
      html: layout(
        subject,
        html,
        `${escapeHtml(site)}${unsubscribeUrl ? ` · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#777">Unsubscribe</a>` : ""}`,
      ),
      text: `${text}\n\n—\n${site}${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}\n`,
    };
  },
};

export function renderMail(key: string, data: MailTemplateData, opts: TemplateOptions): RenderedMail | null {
  const renderer = (RENDERERS as Record<string, Renderer | undefined>)[key];
  return renderer ? renderer(data, opts) : null;
}

export const TEMPLATE_KEYS = Object.keys(RENDERERS) as MailTemplateKey[];
