# Timings

What each phase costs in wall-clock, and — more importantly — **which of these
numbers have been measured and which are still estimates.**

**NOTHING IN THIS TABLE HAS BEEN MEASURED ON VIRGA.** No Virga product has
been bootstrapped. Every number below is an estimate derived from Cirrus's
measured phases, adjusted for Virga's smaller surface (three deployables
instead of fourteen, no console, no SDK). They are in the blueprint as
`expectedMinutes` so the narration can say something useful; they are not
evidence.

| phase | estimate | basis |
|---|---|---|
| `01-scaffold` | 2 m | measured on Cirrus; the work is identical (repo create + one landing) |
| `02-foundation` | 6 m | Cirrus's 13 packages took ~9 m; Virga has 5 |
| `03-infrastructure` | 3 m | measured on Cirrus. D1 and KV create in seconds; the wait is the convergence around them |
| `04-mail` | 12 m | one Worker plus the migration run. Cirrus's 12-worker landing took ~20 m |
| `05-api` | 8 m | one Worker plus route propagation on two environments |
| `06-site` | 9 m | the Next.js build dominates; Cirrus's console phase took ~10 m |
| `07-domain` | 4 m | measured on Cirrus, and skipped by default here |
| `08-docs` | 3 m | measured on Cirrus (a render, a landing and a probe) |
| **total, `--resume`, no domain** | **~43 m** | sum of the above |

Replace a row with a measured number the first time a real bootstrap produces
one, and say in the basis column which run it came from. An estimate that has
quietly become folklore is worse than no number.
