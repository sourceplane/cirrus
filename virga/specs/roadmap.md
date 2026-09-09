# Roadmap — Programme Register

Status: Normative direction. Sequencing is the Orchestrator's call.

| Cluster | Epic | Status | What it owns |
|---------|------|--------|--------------|
| **VG** | [`epics/virga-baseline/`](./epics/virga-baseline/) | In progress | VG0 genesis · VG1 data plane · VG2 site-api · VG3 mail-worker · VG4 web-site · VG5 CLI · VG6 infra + CI · VG7 baseline machinery |

## Sequencing notes

- **VG1 → VG2 → VG3 → VG4 is the hard chain**: schema, then the API, then
  delivery, then the site that calls both. VG5 (CLI) needs only VG2's owner
  routes. VG6 and VG7 are carried from Cirrus and re-targeted; they can land
  any time after VG0 but are last so they describe a finished tree.
- After VG7 the candidates are: Cloudflare Queues for broadcasts, an
  `import` path for existing subscriber lists, Turnstile on by default, and
  the secrets-sync rail (Cirrus SS) once it ships upstream.

## Ground rules

- Trust code reality over stale docs.
- Prefer the largest coherent reviewable unit with one primary outcome.
- Every public surface must look credible to a visitor before being declared done.
- Every internal seam must be extraction-safe before being declared done.
