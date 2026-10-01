// Everything a handler needs, built once per request.

import type { Timings } from "@site/contracts/timing";
import { createSqlExecutor, type SqlExecutor } from "@site/db/d1";
import { createAudienceRepository, type AudienceRepository } from "@site/db/audience";
import { createFormsRepository, type FormsRepository } from "@site/db/forms";
import { createEngagementRepository, type EngagementRepository } from "@site/db/engagement";
import { createNewsletterRepository, type NewsletterRepository } from "@site/db/newsletter";
import type { Env } from "./env.js";
import { createMailClient, type MailClient } from "./mail-client.js";

export interface RequestContext {
  env: Env;
  requestId: string;
  timings: Timings;
  now: Date;
  /** YYYY-MM-DD (UTC). */
  today: string;
  visitor: string;
  executor: SqlExecutor;
  audience: AudienceRepository;
  forms: FormsRepository;
  engagement: EngagementRepository;
  newsletter: NewsletterRepository;
  mail: MailClient;
}

export function buildContext(
  env: Env,
  requestId: string,
  timings: Timings,
  visitor: string,
  now: Date,
): RequestContext {
  if (!env.SITE_DB) throw new Error("SITE_DB binding is not configured");
  const executor = createSqlExecutor(env.SITE_DB);
  return {
    env,
    requestId,
    timings,
    now,
    today: now.toISOString().slice(0, 10),
    visitor,
    executor,
    audience: createAudienceRepository(executor),
    forms: createFormsRepository(executor),
    engagement: createEngagementRepository(executor),
    newsletter: createNewsletterRepository(executor),
    mail: createMailClient(env),
  };
}
