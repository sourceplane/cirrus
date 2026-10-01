# cloudflare-domain

Adopts the Cloudflare zone for the product domain and attaches the
per-environment custom hostname to the site Worker.

**Parked by design**: a fresh product has no zone in the connected account, so
every plan would fail with "no zone found". Phase 07 of the bootstrap restores
the `subscribe:` block once the zone exists.

## Depends on

- **web-site**

## Depended on by

- (none)
