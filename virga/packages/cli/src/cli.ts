#!/usr/bin/env node
// `virga` — the owner's console is a terminal. Tiny entrypoint; everything
// testable lives in runner.ts and takes its I/O by injection.

import { readFile } from "node:fs/promises";
import { runCli } from "./runner.js";

const result = await runCli(process.argv.slice(2), {
  env: process.env,
  fetch: globalThis.fetch,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  readFile: (path) => readFile(path, "utf8"),
});
process.exit(result.exitCode);
