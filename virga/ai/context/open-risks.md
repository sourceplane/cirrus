# Open risks

| # | Risk | Mitigation / signal |
|---|---|---|
| R1 | Email deliverability: Cloudflare Email Service needs Workers Paid + a verified sending domain (DKIM/SPF) before real mail leaves. | `local-debug` provider is the default everywhere but prod; failed sends are recorded on `newsletter_deliveries`, never retried silently. |
| R2 | Broadcast size: a Worker invocation has CPU and subrequest limits; a large list must be paced. | mail-worker sends in batches and records progress per delivery, so a re-run resumes. Queues are the upgrade path (see the epic's open questions). |
| R3 | Abuse of public write paths (subscribe, forms, reactions). | KV token-bucket rate limiting per fingerprint + optional Turnstile + honeypot; fail-open so an outage never takes the site down. |
| R4 | The owner token is a single secret. | Constant-time comparison, never logged, rotated via `wrangler secret put`; the CLI reads it from the environment only. |
| R5 | No Virga product has been bootstrapped end to end yet. | Phase workflows are carried from Cirrus, re-targeted in VG7; the first bootstrap records real timings in `flows/phases/TIMINGS.md`. |
