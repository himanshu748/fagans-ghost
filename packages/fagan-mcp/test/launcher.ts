// Loads scripts/fagan-hook.mjs, the dependency-free hook launcher (RA-R7),
// from TypeScript tests. The path is computed, so tsc does not resolve the
// .mjs file (no allowJs); the module is typed by the interface below.
import { fileURLToPath, pathToFileURL } from "node:url";

/** Repo root: packages/fagan-mcp/test/ is three levels down. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The launcher the hooks in .kiro/hooks/ run. */
export const LAUNCHER = fileURLToPath(new URL("../../../scripts/fagan-hook.mjs", import.meta.url));

/** The exports of scripts/fagan-hook.mjs. */
export interface Launcher {
  CLI_PATH: string;
  EXIT_BLOCK: number;
  COMMAND_FIELDS: readonly string[];
  commandFromPayload(payload: unknown): string | null;
  couldBeGitCommit(command: string): boolean;
  main(args: readonly string[]): Promise<number>;
}

export async function loadLauncher(): Promise<Launcher> {
  const href = pathToFileURL(LAUNCHER).href;
  return (await import(href)) as Launcher;
}
