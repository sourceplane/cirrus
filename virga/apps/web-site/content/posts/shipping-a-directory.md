---
title: "Shipping a launch directory on Cloudflare alone"
date: 2026-09-08
summary: "Upvotes, view counts and rankings without a database you have to run."
tags: [cloudflare, launches]
---

A launch directory needs exactly three things a static site cannot do:
count a view, take an upvote, and rank the list. Virga does all three in
one public Worker over D1, keyed on a daily visitor fingerprint that never
identifies a person.

```ts
// one upvote per visitor per slug, per day
POST /v1/reactions/launches/acme { "kind": "upvote" }
```

The ranking reads two small totals tables and never scans reactions.
