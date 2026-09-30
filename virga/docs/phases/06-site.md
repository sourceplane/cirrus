# 06-site — the website

**Lands:** `apps/web-site`, `tests/web-site`.

Next.js 15 on Workers and Static Assets through `@opennextjs/cloudflare`.

## Content is the configuration

A section renders only when its folder under `content/` has files. One tree is
a launch directory, a newsletter and a portfolio at once, and a product turns a
section off by having nothing in it — not by a flag. That is the whole reason
this baseline is a variation of Cirrus rather than a mode of it: there is no
tenancy stack to configure down to one user.

## Verified by

`orun.http/probe@v1` on the site's stage and prod URLs. The build itself
prerenders every content route, so a route that cannot render fails the
convergence before the probe is reached.
