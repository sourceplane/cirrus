import type { CloudflareEmailSender } from "./providers/cloudflare-email.js";

export interface Env {
  SITE_DB?: D1Database;
  /** Cloudflare Email Service `send_email` binding (cloudflare-email provider). */
  EMAIL?: CloudflareEmailSender;
  ENVIRONMENT: string;
  /** "local-debug" (default) or "cloudflare-email". */
  MAIL_PROVIDER?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  SITE_NAME?: string;
  SITE_URL?: string;
  /** Public origin of site-api, for the unsubscribe links in broadcasts. */
  SITE_API_URL?: string;
  /** HMAC key for derived unsubscribe tokens (shared with site-api). */
  TOKEN_SECRET?: string;
}
