# monitors-worker

The Monitors bounded context: uptime monitoring and public status pages. Owns
HTTP monitors, the checks that probe them, the incidents those checks open and
resolve, and the owner's status-page settings. Reached through the api-edge
`monitors-facade`, and woken every minute by a Cloudflare cron trigger to probe
whatever is due.

User-scoped: the owner surface hangs off the authenticated user's id
(forwarded by the edge as `x-actor-subject-id`); the public status page carries
no actor and never exposes a monitored URL.
