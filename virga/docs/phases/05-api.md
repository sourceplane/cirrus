# 05-api — the public site API, and the website in front of it

**Lands:** `apps/site-api` and `tests/site-api`, and `apps/web-site` and
`tests/web-site`.

## The API

The one Worker the internet reaches. Everything a visitor does that writes
goes through it: subscribe (double opt-in), confirm, unsubscribe, form
submissions, reaction toggles, view counters, launch rankings — plus the owner
routes behind a constant-time bearer check.

It binds to the mail Worker `04-mail` deployed (`MAIL_WORKER`). The edge
points backwards, which is why this baseline needs no cycle broken and no
second worker landing.

## The site

Next.js 15 on Workers and Static Assets through `@opennextjs/cloudflare`.

**Content is the configuration.** A section renders only when its folder under
`content/` has files. One tree is a launch directory, a newsletter and a
portfolio at once, and a product turns a section off by having nothing in it —
not by a flag. That is the whole reason this baseline is a variation of Cirrus
rather than a mode of it: there is no tenancy stack to configure down to one
user.

## Two landings folded into one

The site was its own phase, `06-site`. A landing costs about four minutes
whatever it carries, and that fixed cost was the whole of what a separate
landing bought here. Cirrus folded its console into its edge for the same
reason (`43ca81b`); this is that change taken.

The ORDER is not lost by folding. `web-site` still `dependsOn: site-api` —
its deploy smoke health-checks the API, so the API must be live first — and
one convergence honours that edge exactly as two landings did. What goes away
is the second landing's fixed cost, not the ordering.

The numbering keeps its gap — `06` is not reused — so the surviving phase
names stay the identities the task plane, the milestones and `--phase` use.

## Verified by

`orun.http/probe@v1`, after the convergence watch, on four URLs: `/health` on
the API and the site root, each on stage and prod. The probe retries route
propagation: a fresh Worker's route can take a few minutes to answer, and a
404 in that window is not a failure. The site build prerenders every content
route, so a route that cannot render fails the convergence before the probe is
reached.
