// Fixture shared by the contract and CLI tests: a temp git repo with a tiny
// project, and the path of the built CLI they spawn.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Config } from "../src/core/schema.js";
import { tempRepo, testConfig, writeFiles } from "./helpers.js";

/** The built CLI. `npm test` in this package runs `npm run build` first (package.json). */
export const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

export function assertBuilt(): void {
  if (!existsSync(CLI)) {
    throw new Error(`${CLI} is missing. Run "npm run build" before these tests (npm test does it for you).`);
  }
}

/** Build and test commands that cost nothing: the running node binary exiting 0. */
export const fixtureConfig: Config = {
  ...testConfig,
  build: [process.execPath, "-e", "process.exit(0)"],
  test: [process.execPath, "-e", "process.exit(0)"],
};

export const CALC_V1 = ["export function add(a: number, b: number): number {", "  return a + b;", "}", ""].join("\n");

/** Adds `sub` with an off-by-one in its return statement (new line 6). */
export const CALC_V2 = CALC_V1 + ["", "export function sub(a: number, b: number): number {", "  return a - b + 1;", "}", ""].join("\n");

/** The rework: line 6 fixed. */
export const CALC_V3 = CALC_V1 + ["", "export function sub(a: number, b: number): number {", "  return a - b;", "}", ""].join("\n");

export const NOTES = "# Notes\nSubtraction is new.\n";

/**
 * A repo whose commit holds `.fagan/config.json`, `src/calc.ts` (V1) and a
 * README, with `src/calc.ts` changed to V2 and `docs/notes.md` untracked in the
 * working tree. Packet units: U001 docs/notes.md, U002 src/calc.ts.
 */
export function fixtureRepo(config: Config = fixtureConfig): { path: string; cleanup: () => void } {
  const repo = tempRepo({
    ".fagan/config.json": `${JSON.stringify(config, null, 2)}\n`,
    "src/calc.ts": CALC_V1,
    "README.md": "# demo\n",
  });
  writeFiles(repo.path, { "src/calc.ts": CALC_V2, "docs/notes.md": NOTES });
  return repo;
}
