# shared

Generic helpers with no domain knowledge: public-id minting (`<prefix>_<32 hex>`)
and the `ApplicationError` shape every Worker maps to an HTTP envelope.

A workspace package built by the turbo pipeline. It deploys nothing on its own —
its lane type-checks, lints, tests, and builds it for the components that depend
on it.

## Depends on

- (none)

## Depended on by

- **site-api**, **mail-worker**, **cli**
