# 05-api — the public site API

**Lands:** `apps/site-api`, `tests/site-api`.

The one Worker the internet reaches. Everything a visitor does that writes
goes through it: subscribe (double opt-in), confirm, unsubscribe, form
submissions, reaction toggles, view counters, launch rankings — plus the owner
routes behind a constant-time bearer check.

It binds to the mail Worker `04-mail` deployed (`MAIL_WORKER`). The edge
points backwards, which is why this baseline needs no cycle broken and no
second worker landing.

## Verified by

`orun.http/probe@v1` on `/health` for stage and prod, after the convergence
watch. The probe retries route propagation: a fresh Worker's route can take a
few minutes to answer, and a 404 in that window is not a failure.
