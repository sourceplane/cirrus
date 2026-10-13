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
| `02-foundation` | 7 m | the 6 m the packages were estimated at, plus the 3 m the data plane was, minus a landing's ~4 m fixed cost and the overlap of running both in one convergence |
| `04-mail` | 12 m | one Worker plus the migration run. Cirrus's 12-worker landing took ~20 m |
| `05-api` | 11 m | the 8 m the API was estimated at plus the 9 m the site was, minus a landing's ~4 m fixed cost. The site still deploys after the API — the edge survives the fold — so only the landing is saved, not the ordering |
| `07-domain` | 4 m | measured on Cirrus, and skipped by default here |
| `08-docs` | 3 m | measured on Cirrus (a render, a landing and a probe) |
| **total, `--resume`, no domain** | **~35 m** | sum of the above |

The two folds (`03-infrastructure` into `02-foundation`, `06-site` into
`05-api`) account for the drop from ~43 m. A landing's fixed cost — place, PR,
merge, a convergence of its own — is the ~4 m each fold removes, and it is the
one number in this table taken from cirrus's own run record of a real
bootstrap rather than from an estimate. The plan-only bootstrap PR and the
advisory pull-request edges should take more off, and nothing here claims
them: they are not in these estimates at all.

Replace a row with a measured number the first time a real bootstrap produces
one, and say in the basis column which run it came from. An estimate that has
quietly become folklore is worse than no number.
