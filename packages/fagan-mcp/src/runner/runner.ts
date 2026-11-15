// Runs the configured build and test argv with a timeout, capturing exit code
// and duration only (FM-R2.6, FM-R2.8). No shell; output is discarded so it
// can never reach the MCP protocol stream on stdout.
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { FaganError } from "../core/errors.js";
import type { CheckResult } from "../core/schema.js";

/** Grace period between SIGTERM and SIGKILL after a timeout. */
export const KILL_GRACE_MS = 2_000;

export const NOT_RUN: CheckResult = { ran: false, passed: false, exitCode: null, durationMs: null };

function killTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    // The child leads its own process group (detached), so this reaches npm's children too.
    if (process.platform !== "win32") process.kill(-pid, signal);
    else process.kill(pid, signal);
  } catch {
    // Already gone.
  }
}

/**
 * Runs `argv[0]` with `argv.slice(1)` in `cwd`. Resolves with the outcome, or
 * throws `COMMAND_TIMEOUT` when it runs longer than `timeoutMs`. A command that
 * cannot start counts as failed with exit code null.
 */
export function runCommand(argv: readonly string[], cwd: string, timeoutMs: number): Promise<CheckResult> {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    return Promise.reject(new FaganError("CONFIG_INVALID", "command argv is empty", { issues: [] }));
  }
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let timedOut = false;
    let settled = false;
    const child = spawn(cmd, args, {
      cwd,
      stdio: "ignore",
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const elapsed = (): number => Math.max(0, Math.round(performance.now() - started));
    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, "SIGTERM");
      killTimer = setTimeout(() => killTree(child.pid, "SIGKILL"), KILL_GRACE_MS);
    }, timeoutMs);
    const finish = (result: CheckResult | FaganError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (result instanceof FaganError) reject(result);
      else resolve(result);
    };
    child.on("error", () => {
      finish({ ran: true, passed: false, exitCode: null, durationMs: elapsed() });
    });
    child.on("exit", (code) => {
      if (timedOut) {
        finish(
          new FaganError("COMMAND_TIMEOUT", `${argv.join(" ")} ran longer than ${timeoutMs} ms`, {
            argv: [...argv],
            timeout_ms: timeoutMs,
          }),
        );
        return;
      }
      finish({ ran: true, passed: code === 0, exitCode: code, durationMs: elapsed() });
    });
  });
}

/** Build first; tests only if the build passed (FM-R2.6). */
export async function runChecks(
  config: { build: readonly string[]; test: readonly string[]; commandTimeoutMs: number },
  cwd: string,
): Promise<{ build: CheckResult; tests: CheckResult }> {
  const build = await runCommand(config.build, cwd, config.commandTimeoutMs);
  const tests = build.passed ? await runCommand(config.test, cwd, config.commandTimeoutMs) : NOT_RUN;
  return { build, tests };
}
