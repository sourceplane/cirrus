# pages-worker

The Pages bounded context: the creator's link-in-bio page and storefront. Owns
the page (handle, title, bio, theme, published), its ordered blocks (links,
headers, products, tips) and the click log behind the analytics view. Reached
only through the api-edge `pages-facade`; user-scoped — every owner row hangs
off the authenticated user's id (forwarded by the edge as
`x-actor-subject-id`), and the public page reads carry no actor.
