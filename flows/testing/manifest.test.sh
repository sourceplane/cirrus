#!/usr/bin/env bash
# The manifest must state what the flows DO (saas-bootstrap-console BC2/BC3).
#
# `blueprint.yaml` is the contract the platform's bootstrap door reads and the
# console renders screen for screen. A manifest that drifts from the flows is a
# console that lies — showing an operator secrets that will not be created, or a
# programme that will not be laid out, with nothing failing until a customer's
# build is already running.
#
# Every check compares the manifest to THE THING THAT DOES THE WORK, never to
# another copy of the same claim. `spec.source.tag` sat at `baseline-v1` against
# a live `baseline-v4` for three releases (and `baseline-v17` against
# `baseline-v27` in lumen — ten) because nothing compared it to anything that
# moved. A drift test between two files catches nothing.
#
# TWO SHAPES OF REPO, one test. A repo may carry more than one baseline:
# stratus serves both the `stratus` and `stratus-coolify` registry rows from one
# tree, with different briefs and umbrellas. So every `blueprint*.yaml` at the
# root is checked, and each is checked against ITS OWN declared umbrella rather
# than against a single assumed one.
#
# And a baseline need not have every mechanism. Stratus has no
# `flows/common/create-secrets.sh` and no `ensure-milestone` calls at all, so it
# declares no `secrets` and no `programme`. That is allowed — but only
# BOTH-OR-NEITHER, checked in both directions: if the mechanism exists the block
# must match it, and if the block exists the mechanism must be there to realize
# it. "Absent" is never permission to skip a check silently; it is a fact that
# must agree with the other side.
#
# bash + python3 + PyYAML + git. No network, no fakes, no credential.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

echo "── blueprint manifests against the flows that realize them"
python3 - "$root" <<'PY'
import pathlib, re, sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required for the manifest contract test (pip install pyyaml)")

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

manifests = sorted(root.glob("blueprint*.yaml"))
if not manifests:
    sys.exit("no blueprint*.yaml at the repo root — this check has gone blind")

# The secrets mechanism is shared across a repo's baselines when it exists.
secrets_script = root / "flows/common/create-secrets.sh"
script_text = secrets_script.read_text() if secrets_script.exists() else None
script_secrets = {
    m.group(1): (m.group(2), m.group(3))
    for m in re.finditer(r"^create\s+([A-Z][A-Z0-9_]*)\s+(\S+)\s+\S+\s+(\S+)\s*$", script_text or "", re.M)
}
if script_text is not None and not script_secrets:
    bad("create-secrets.sh exists but no `create <KEY> <provider> <conn> <template>` calls "
        "were found — the script's shape changed and this check has gone blind")

checked = []
for path in manifests:
    name = path.name
    spec = (yaml.safe_load(path.read_text()) or {}).get("spec") or {}
    def B(m): bad(f"{name}: {m}")

    # ── the field that cannot be true ─────────────────────────────────────
    if "tag" in (spec.get("source") or {}):
        B("spec.source.tag is back. The registry pins the tag; this file is fetched at it.")

    # ── blocks every baseline must carry ──────────────────────────────────
    for key in ("source", "overview", "requires", "inputs", "bootstrap"):
        if key not in spec:
            B(f"spec.{key} is missing — the console renders it")

    # ── inputs v3: every input is collected by the console (BE3) ──────────
    #
    # `askedBy` is gone with the agent. It split inputs into ones a form
    # collects and ones asked for in a session, and the second half no longer
    # exists — so the field could only ever hold one value.
    #
    # The exemption it carried is what these checks replace: an `askedBy:
    # agent` input needed no `pattern`, because prose asked for it and prose
    # does not validate.
    input_keys = {f.get("key") for f in (spec.get("inputs") or [])}
    ACTION_ID = re.compile(r"^[a-z][a-z0-9.]*/[a-z][a-z0-9-]*@v[0-9]+$")
    REBRAND = "tooling/rebrand/rebrand.mjs"
    for i, field in enumerate(spec.get("inputs") or []):
        key = field.get("key", f"#{i}")
        if "askedBy" in field:
            B(f"inputs[{key}] declares askedBy — there is no agent to ask, so "
              f"every input is collected by the console")
        if not field.get("pattern"):
            B(f"inputs[{key}] declares no pattern — it is collected in a form "
              f"and validated before Continue, so it must say what a valid "
              f"value looks like")

        # from / derive / probe each answer "where does this value come from
        # when nobody types it". Two of them is two answers.
        sources = [k for k in ("from", "derive", "probe") if k in field]
        if len(sources) > 1:
            B(f"inputs[{key}] declares {' and '.join(sources)} — an input has "
              f"one source")

        # A derivation must name inputs this manifest actually declares.
        derive = field.get("derive")
        if derive is not None:
            refs = re.findall(r"\{([a-z][a-z0-9_]*)\}", derive)
            if not refs:
                B(f"inputs[{key}].derive has no {{key}} reference — a constant "
                  f"is a default, not a derivation")
            for ref in refs:
                if ref == key:
                    B(f"inputs[{key}].derive references itself")
                elif ref not in input_keys:
                    B(f"inputs[{key}].derive references {{{ref}}}, which is not "
                      f"a declared input")

        # A DERIVATION HAS A SECOND IMPLEMENTATION, and they must agree.
        #
        # `rebrand.mjs` has computed this value since long before the manifest
        # could say so:
        #
        #     const apiBaseUrl = values.apiBaseUrl ?? `https://api.${productDomain}`;
        #
        # Both paths are live. The console resolves `derive` and the flow hands
        # it down, so on a console bootstrap the manifest's rule wins; a phase
        # run by hand passes nothing and rebrand's fallback wins. One rule, two
        # implementations — which is the thing this file's header warns about,
        # unless something holds them equal. This does.
        if derive is not None and (root / REBRAND).exists():
            js = (root / REBRAND).read_text(errors="replace")
            for m in re.finditer(r"const (\w+) = values\.\w+ \?\? `([^`]+)`", js):
                # `${productDomain}` there is `{productdomain}` here.
                want = re.sub(r"\$\{([A-Za-z]+)\}", lambda g: "{" + g.group(1).lower() + "}", m.group(2))
                if m.group(1).lower() == key and want != derive:
                    B(f"inputs[{key}].derive is {derive!r} and {REBRAND} falls back "
                      f"to {want!r} — one value, two rules, and which one a "
                      f"product gets depends on whether the console resolved it")

        # A probe names an orun action. Shape only — this repository does not
        # own the registry and cannot know which ids a runner has. The id being
        # WELL-FORMED is what it can check; whether it is REGISTERED is the
        # runner's answer, at parse time, where the real list lives.
        probe = field.get("probe")
        if probe is not None:
            uses = (probe or {}).get("uses")
            if not uses or not ACTION_ID.match(uses):
                B(f"inputs[{key}].probe.uses is {uses!r} — not an action id "
                  f"(<namespace>/<verb>@v<major>)")

        # `from` says the CONSOLE already holds this value, so it renders no
        # field for it (saas-bootstrap-console BC-K5). Two ways to get it
        # wrong, and the platform refuses both — check them here too, so the
        # mistake is caught in this repo rather than at a live bootstrap.
        src = field.get("from")
        if src is not None and src not in ("repo.name", "repo.owner", "repo.fullName"):
            B(f"inputs[{key}].from is {src!r} — must be repo.name, repo.owner or repo.fullName")

    # ── secrets: BOTH or NEITHER, checked both ways ───────────────────────
    declared = {s.get("key"): (s.get("provider"), s.get("template")) for s in (spec.get("secrets") or [])}
    if script_text is None:
        if declared:
            B(f"declares {len(declared)} secret(s) but the repo has no "
              f"flows/common/create-secrets.sh to create them")
    else:
        if "secrets" not in spec:
            B("create-secrets.sh exists and creates keys, but the manifest declares no secrets")
        for k in sorted(set(script_secrets) - set(declared)):
            B(f"create-secrets.sh creates {k} and the manifest does not declare it")
        for k in sorted(set(declared) - set(script_secrets)):
            B(f"declares secret {k} and create-secrets.sh never creates it")
        for k in sorted(set(script_secrets) & set(declared)):
            if script_secrets[k] != declared[k]:
                B(f"{k}: manifest says provider/template {declared[k]}, the script uses {script_secrets[k]}")

    # ── the umbrella THIS manifest declares ───────────────────────────────
    boot = spec.get("bootstrap") or {}
    for field in ("umbrella", "agentBrief"):
        rel = boot.get(field)
        if not rel:
            B(f"bootstrap.{field} is missing")
        elif not (root / rel).exists():
            B(f"bootstrap.{field} names {rel}, which does not exist")

    # ── the brief reads the CONTRACT, not its own copy of the questions ───
    #
    # BC-K5. The brief used to name its intake itself ("ask the operator these
    # three things"), which works for exactly one baseline: adding an input
    # then needs an edit to prose in this repo at a pinned tag, and the
    # manifest and the question an operator is actually asked drift apart with
    # nothing to notice. The platform now hands the session an `asks` list
    # derived from THIS file, so the brief must defer to it.
    brief_rel = boot.get("agentBrief")
    brief = (root / brief_rel).read_text() if brief_rel and (root / brief_rel).exists() else ""
    if brief:
        if "asks" not in brief:
            B(f"{brief_rel} never mentions the contract's `asks` list — it is still "
              "carrying its own intake, so a new input here would not be asked for")
        # The check that follows used to list the `askedBy: agent` inputs and
        # refuse a brief that numbered them as questions. There are none now —
        # every input is collected before Build, so the contract's `asks` is
        # empty for every manifest — and a brief numbering ANY input as an
        # intake question is carrying its own intake, which is the thing this
        # check exists to catch. So it reads the whole set.
        for n, k in enumerate([f.get("key") for f in (spec.get("inputs") or [])], start=1):
            if re.search(rf"^\s*{n}\.\s.*\b{re.escape(k or '')}\b", brief, re.M):
                B(f"{brief_rel} numbers {k} as intake question {n} — every input is "
                  "collected by the console before Build, so a session asks for none")

    umb_rel = boot.get("umbrella")
    umb = (root / umb_rel).read_text() if umb_rel and (root / umb_rel).exists() else ""

    # ── every declared input is one the umbrella ACCEPTS ──────────────────
    #
    # The manifest's keys are the umbrella's input names, and orun's flow
    # engine fails closed on a `--set` it does not declare (`unknown input
    # "apibaseurl"`). So a manifest input the umbrella has never heard of is
    # either a bootstrap that dies at step zero, or — worse, because it is
    # silent — a value the console resolves, shows the operator, and drops.
    #
    # ONE DIRECTION ONLY. The umbrella declares more than this file does:
    # `workspace`, `out`, `baselineref`, `watch`, `dryrun`, `track`, `epicslug`
    # and `domain` are how the PLATFORM drives a build, not what a product is
    # configured with, and the console supplies them itself. What must hold is
    # that nothing this file declares arrives at a flow that cannot take it.
    if umb:
        # Parsed, not grepped. A regex over the file would also match a key in
        # a step body, and the "gone blind" guard below cannot tell a wrong
        # match from a right one.
        umb_inputs = set(((yaml.safe_load(umb) or {}).get("inputs") or {}).keys())
        if not umb_inputs:
            B(f"no inputs found in {umb_rel} — this check has gone blind")
        for key in [f.get("key") for f in (spec.get("inputs") or [])]:
            if key and key not in umb_inputs:
                B(f"inputs[{key}] is not an input of {umb_rel} — the console "
                  f"would resolve it and the flow would refuse it (orun's flow "
                  f"engine fails closed on an undeclared --set)")

    # ── programme: BOTH or NEITHER, against THIS manifest's umbrella ──────
    loop = re.search(r"for phase in ([0-9a-z\- ]+); do", umb)
    extra = re.findall(r'ensure-milestone "\$epic" ([0-9][0-9a-z\-]+)', umb)
    conditional = set(re.findall(r'!= "true" \]\s*\|\|.*?ensure-milestone "\$epic" ([0-9][0-9a-z\-]+)', umb))
    ensured = (loop.group(1).split() if loop else []) + extra

    prog = spec.get("programme")
    if not ensured:
        if prog:
            B(f"declares a programme but {umb_rel} ensures no milestones")
    else:
        if not prog:
            B(f"{umb_rel} ensures {len(ensured)} milestone(s) and the manifest declares no programme")
        else:
            ms = prog.get("milestones") or []
            if any(not isinstance(m, dict) or "name" not in m for m in ms):
                B("every programme.milestones entry must be a mapping with a `name` "
                  "(so a conditional one can carry its `when`)")
            else:
                names = [m["name"] for m in ms]
                dcond = {m["name"] for m in ms if m.get("when")}
                if names != ensured:
                    B(f"programme.milestones {names} != {umb_rel}'s {ensured}")
                if dcond != conditional:
                    B(f"conditional milestones disagree: manifest says {sorted(dcond) or '[]'}, "
                      f"the umbrella guards {sorted(conditional) or '[]'}")
            slug = re.search(r'epicslug:\s*\n\s*type: string\s*\n\s*default: "([^"]+)"', umb)
            if slug and prog.get("epicSlug") != slug.group(1):
                B(f"programme.epicSlug {prog.get('epicSlug')!r} != the umbrella's default {slug.group(1)!r}")

    # ── verify is optional, but must not name an input that is not there ──
    input_keys = {f.get("key") for f in (spec.get("inputs") or [])} | {"env"}
    for url in ((spec.get("verify") or {}).get("urls") or []):
        for ph in re.findall(r"\{([a-zA-Z0-9_]+)\}", url):
            if ph not in input_keys:
                B(f"verify url interpolates {{{ph}}}, which is not an input")

    checked.append((name, len(declared), len((prog or {}).get("milestones") or [])))

if problems:
    print("FAIL: a manifest and the flows disagree:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

for name, ns, nm in checked:
    print(f"   {name}: {ns} secret(s), {nm} milestone(s) agree with the flows")
PY

echo "manifest.test.sh: ok"
