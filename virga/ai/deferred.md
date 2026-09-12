# Deferred candidates

Candidates that need a human answer before they can proceed. Deferred is not
blocked: the loop continues with the next human-independent task.

| Candidate | Unblock signal |
|---|---|
| Real email delivery on stage/prod | Workers Paid plan + sending domain verified in Email Service; `EMAIL_FROM_ADDRESS` on that domain. |
| Custom domain (phase 07) | The product zone exists in the connected Cloudflare account. |
| Cloudflare Queues for broadcasts | Decision on the Queues plan; until then broadcasts are batched in-request. |
