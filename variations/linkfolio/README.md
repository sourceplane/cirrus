# Variation: linkfolio — the creator page

Link-in-bio page and storefront: one public page per creator (links, section
headers, products, tips) with click analytics. Register row:
[`specs/variations/README.md`](../../specs/variations/README.md). Epic issue:
[sourceplane/cirrus#26](https://github.com/sourceplane/cirrus/issues/26).

- `values.json` — the rebrand identity (repo `linkfolio`, product "Linkfolio").
- `overlay/` — every file the variation adds or changes over the baseline,
  authored in baseline naming (the rebrand renames at materialize time):
  `apps/pages-worker`, migration `200_pages_core`, `@saas/db/pages`,
  `@saas/contracts/pages`, api-edge `pages-facade` (+ `PAGES_WORKER` binding,
  `pages` rate-limit family), `client.pages` in the SDK, the console's product
  registration and pages (editor, appearance, analytics, public page), tests,
  README/specs.

```bash
tooling/variations/materialize.sh linkfolio ~/sourceplane/linkfolio --verify
cd ~/sourceplane/linkfolio && git remote add origin git@github.com:sourceplane/linkfolio.git && git push -u origin main
```
