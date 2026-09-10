# habits-worker

The Habits bounded context: a private habit and streak tracker. Owns habits
(name, cadence, colour, order, archive state) and their daily check-ins.
Reached only through the api-edge `habits-facade`; entirely user-scoped —
every row hangs off the authenticated user's id (forwarded by the edge as
`x-actor-subject-id`) and there is no public surface.

Dates are the CLIENT's local calendar dates (`YYYY-MM-DD`): the browser decides
what "today" is and sends it, so the server does no timezone math.
