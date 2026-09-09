---
title: "site-api"
summary: "The public Worker behind every Virga site: subscribers, forms, reactions, views, rankings."
url: "https://github.com/sourceplane/virga/tree/main/apps/site-api"
repo: "sourceplane/virga"
order: 1
tags: [cloudflare-workers, d1]
---

A single Worker with a KV token-bucket limiter, CORS scoped to the site,
optional Turnstile, and bearer-token owner routes — no console required.
