import type { MailProvider } from "@site/contracts/mail";
import type { Env } from "../env.js";
import { createCloudflareEmailProvider } from "./cloudflare-email.js";
import { createLocalDebugProvider } from "./local-debug.js";

/**
 * Resolve the provider for this deployment. Unknown values — and a
 * cloudflare-email selection whose binding or from-address is missing —
 * fall back to local-debug with a warning: the worker must always deploy.
 */
export function resolveProvider(env: Env): MailProvider {
  const name = (env.MAIL_PROVIDER ?? "local-debug").toLowerCase();
  switch (name) {
    case "local-debug":
      return createLocalDebugProvider();
    case "cloudflare-email":
      if (!env.EMAIL || !env.EMAIL_FROM_ADDRESS) {
        console.warn("[mail-worker] MAIL_PROVIDER=cloudflare-email but the EMAIL binding or EMAIL_FROM_ADDRESS is not configured; falling back to local-debug.");
        return createLocalDebugProvider();
      }
      return createCloudflareEmailProvider({ email: env.EMAIL, fromAddress: env.EMAIL_FROM_ADDRESS, fromName: env.EMAIL_FROM_NAME });
    default:
      console.warn(`[mail-worker] Unknown MAIL_PROVIDER=${name}; falling back to local-debug.`);
      return createLocalDebugProvider();
  }
}
