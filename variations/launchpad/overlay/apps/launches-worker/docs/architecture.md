# launches-worker — architecture

A `cloudflare-worker-turbo` component built from `apps/launches-worker`.

## Bindings and wiring

- **D1** → `PLATFORM_DB` (tables prefixed `launches_`; migration `200_launches_core`).
- No service bindings: the actor arrives on trusted internal headers set by
  api-edge; there is no organization to consult, so no membership/policy hop.

## Surface

| Route | Auth | Purpose |
|---|---|---|
| `GET /v1/launches?range=today\|week\|all&limit=` | public (optional viewer) | ranked feed of live products |
| `GET /v1/launches/:slug` | public (optional viewer) | product page |
| `GET /v1/launches/:slug/comments` | public | comments, oldest first |
| `POST /v1/launches/:slug/comments` | user | add a comment |
| `PUT` / `DELETE /v1/launches/:slug/upvote` | user | vote / unvote (one per user) |
| `GET /v1/makers/:handle` | public | maker profile + live products |
| `GET` / `POST /v1/me/products` | user | my launches / create a draft |
| `GET` / `PATCH` / `DELETE /v1/me/products/:id` | user | read / edit / delete my product |
| `POST /v1/me/products/:id/launch` | user | draft → live (needs a maker profile) |
| `GET` / `PUT /v1/me/profile` | user | my maker profile |
