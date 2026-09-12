# Risks and open questions

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Email Service prerequisites (Workers Paid, verified domain) are human-gated; until then no real mail leaves. | `local-debug` default outside prod; failed sends recorded, never hidden; `ai/deferred.md` carries the unblock signal. |
| R2 | A big broadcast in one Worker invocation hits CPU/subrequest limits. | Batches + resumable deliveries; Queues as the upgrade (Q1). |
| R3 | Public write paths get abused. | Rate limit per fingerprint, honeypot, optional Turnstile; fail-open so the site never goes down with KV. |
| R4 | One owner token. | Constant-time compare, never logged, rotated with `wrangler secret put`; 503 when unset. |
| R5 | Unbootstrapped baseline: the flows are inherited, not yet proven for this tree. | VG7 re-targets them; the first bootstrap records timings; nothing claims "live" until phase 08 writes it. |

## Open questions

| # | Question | Default until answered |
|---|---|---|
| Q1 | Cloudflare Queues for broadcasts? | No — in-request batches with resume. |
| Q2 | Should reactions persist beyond the daily salt (a signed cookie)? | No — a visitor's upvote is per day; directories care about ranking, not ledgers. |
| Q3 | Import of an existing subscriber list (CSV → confirmed)? | Not in VG; a `virga subscribers import` candidate after VG7. |
