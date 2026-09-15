/** Exit codes, per specs/components/05-cli.md. */
export const EXIT = {
  ok: 0,
  api: 1,
  usage: 2,
  unauthenticated: 3,
  network: 4,
} as const;
