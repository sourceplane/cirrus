# Current Context (compact)

Last updated: 2026-09-09.

## Where this baseline stands

Virga is the **single-owner website** baseline, born from Cirrus at
`8f41d16` by selection (see [provenance.md](provenance.md)). The epic is
[`specs/epics/virga-baseline/`](../../specs/epics/virga-baseline/README.md);
milestones VG0–VG7 are the whole programme.

## Ground truth (verify, don't trust — re-derive on boot)

- **What is verified:** the workspace installs, typechecks, lints, tests and
  builds; the control migration applies to a real SQLite engine.
- **What is NOT verified:** no Virga product has been bootstrapped; nothing
  in this repo claims a live deployment until `flows/phases/08-docs` writes
  one into `deployment.md`.

## Next

The next unshipped milestone in the epic's `IMPLEMENTATION-STATUS.md`.
