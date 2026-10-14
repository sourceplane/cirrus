# pages-worker — architecture

A `cloudflare-worker-turbo` component built from `apps/pages-worker`.

## Bindings and wiring

- **D1** → `PLATFORM_DB` (tables prefixed `pages_`; migration `200_pages_core`).
- No service bindings: the actor arrives on trusted internal headers set by
  api-edge; there is no organization to consult, so no membership/policy hop.

## Surface

| Route | Auth | Purpose |
|---|---|---|
| `GET` / `PUT /v1/me/page` | user | read / upsert the page (handle, title, bio, theme, published) |
| `GET` / `POST /v1/me/page/blocks` | user | list / append a block |
| `PATCH` / `DELETE /v1/me/page/blocks/:id` | user | edit / remove a block |
| `POST /v1/me/page/blocks/reorder` | user | rewrite block order from `{ ids }` |
| `GET /v1/me/page/analytics?days=` | user | click totals, per block and per day |
| `GET /v1/p/:handle` | public | the published page + its enabled blocks |
| `POST /v1/p/:handle/blocks/:id/click` | public | record a click, return the target URL |

An unpublished page 404s publicly. Public responses never carry the owner's
user id.
