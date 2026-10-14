# testing

Test-only helpers shared by every `tests/*` suite: deterministic public ids,
contract fixtures, and a `D1Binding` backed by `node:sqlite` with the
migrations applied — so repository and Worker suites run their SQL through a
real engine.

## Depends on

- **contracts**, **db**

## Depended on by

- every `tests/*` component
