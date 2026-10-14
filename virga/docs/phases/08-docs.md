# 08-docs — the deployment, recorded

**Lands:** `ai/context/deployment.md` (the live-deployment manifest) and the
operating contract, rendered from the deployment rather than from this
document.

This phase places **no module**. Its content does not exist in the baseline to
be copied: `hooks/render-deployment-docs.sh` probes the live deployment and
writes what it finds. `01-scaffold` placed `ai/context/deployment.md` as the
baseline's own copy; this phase replaces it with the product's reality.

## Why a render and not a template

A templated manifest states what the blueprint INTENDED. This one states what
answered. The difference is the whole value of the file: an operator reading it
six months later needs the URLs that work, the resource ids that exist, and the
environments that are actually live — not the ones this repository planned.

## Verified by

`orun.http/probe@v1` over every live URL — both site-api `/health` endpoints
and both site URLs — one more time, after the record is merged. The task is
done when the committed manifest matches probed reality.
