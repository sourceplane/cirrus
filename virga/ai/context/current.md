# Current Context (compact)

Last updated: 2026-09-10.

## Where this baseline stands

Virga is the **single-owner website** baseline, born from Cirrus at
`8f41d16` by selection (see [provenance.md](provenance.md)). The epic is
[`specs/epics/virga-baseline/`](../../specs/epics/virga-baseline/README.md);
milestones VG0–VG7 are the whole programme.

## Ground truth (verify, don't trust — re-derive on boot)

- **What is verified:** the workspace installs, typechecks, lints, tests
  (110 tests) and builds; every migration applies to a real SQLite engine;
  both Workers render a deployable config from their fixture and pass
  `wrangler deploy --dry-run`; the rebrand instantiates a second identity
  cleanly and that instance passes its own pipeline.
- **What is NOT verified:** no Virga product has been bootstrapped; nothing
  in this repo claims a live deployment until `flows/phases/08-docs` writes
  one into `deployment.md`.

## Next

Not a milestone — a **bootstrap**. VG0–VG7 are shipped and the workspace is
green, but nothing has ever been deployed from this tree:

1. Run `flows/phases/00-all` against a real workspace and Cloudflare account,
   and record the real timings in `flows/phases/TIMINGS.md`.
2. Let phase 08 write `ai/context/deployment.md` from probed reality.
3. Tag `baseline-v1` and point the platform's blueprint registry at the tag.

Until step 2 has run, no file in this repo may claim a live deployment.
