# cloudflare-kv

Provisions the Cloudflare KV namespace backing the site-api rate limiter
(`rl:v1:*` token buckets and the `mail:confirm:*` throttle), one per
environment. Publishes the wiring document the site-api deploy resolves its
namespace id from.

## Depends on

- (none)

## Depended on by

- **site-api**
