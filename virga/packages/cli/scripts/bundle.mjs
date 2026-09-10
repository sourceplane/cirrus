#!/usr/bin/env node
// Bundles the CLI from TypeScript sources with esbuild so `dist/cli.js`
// runs under Node without resolving sibling workspaces (`@site/contracts`
// exports raw `.ts`). tsc is reserved for type-checking + .d.ts emit.

import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

await build({
  entryPoints: [resolve(pkgRoot, "src/cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: resolve(pkgRoot, "dist/cli.js"),
  legalComments: "none",
  minify: false,
  sourcemap: false,
  logLevel: "warning",
});

chmodSync(resolve(pkgRoot, "dist/cli.js"), 0o755);
