# launches-worker

The Launches bounded context: the launch directory. Owns maker profiles,
products (launches), upvotes and comments. Reached only through the api-edge
`launches-facade`; user-scoped — every private row hangs off the
authenticated user's id (forwarded by the edge as `x-actor-subject-id`), and
the public reads (`/v1/launches*`, `/v1/makers/:handle`) carry no actor.
