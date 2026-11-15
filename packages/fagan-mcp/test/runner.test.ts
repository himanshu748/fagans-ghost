import { describe, expect, it } from "vitest";
import { FaganError } from "../src/core/errors.js";
import { runChecks, runCommand } from "../src/runner/runner.js";
import { tempDir } from "./helpers.js";

const node = process.execPath;

describe("FM-R2.6 FM-R2.8 runner", () => {
  it("captures exit codes and duration", async () => {
    const d = tempDir();
    try {
      const ok = await runCommand([node, "-e", "process.exit(0)"], d.path, 10_000);
      expect(ok).toMatchObject({ ran: true, passed: true, exitCode: 0 });
      expect(ok.durationMs).toBeGreaterThanOrEqual(0);
      const bad = await runCommand([node, "-e", "process.exit(3)"], d.path, 10_000);
      expect(bad).toMatchObject({ ran: true, passed: false, exitCode: 3 });
      const missing = await runCommand(["fagan-no-such-command-xyz"], d.path, 10_000);
      expect(missing).toMatchObject({ ran: true, passed: false, exitCode: null });
    } finally {
      d.cleanup();
    }
  });

  it("passes arguments without a shell", async () => {
    const d = tempDir();
    try {
      // With a shell, `$(exit 7)` or `;` would change the exit code.
      const r = await runCommand([node, "-e", "process.exit(process.argv[1] === '; exit 7 $(exit 7)' ? 0 : 1)", "; exit 7 $(exit 7)"], d.path, 10_000);
      expect(r.exitCode).toBe(0);
    } finally {
      d.cleanup();
    }
  });

  it("throws COMMAND_TIMEOUT and stops the process", async () => {
    const d = tempDir();
    try {
      const started = Date.now();
      const err = await runCommand([node, "-e", "setInterval(() => {}, 1000)"], d.path, 300).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(FaganError);
      expect((err as FaganError).code).toBe("COMMAND_TIMEOUT");
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      d.cleanup();
    }
  });

  it("runs tests only after a passing build", async () => {
    const d = tempDir();
    try {
      const failed = await runChecks({ build: [node, "-e", "process.exit(1)"], test: [node, "-e", "process.exit(0)"], commandTimeoutMs: 10_000 }, d.path);
      expect(failed.tests).toEqual({ ran: false, passed: false, exitCode: null, durationMs: null });
      const passed = await runChecks({ build: [node, "-e", "0"], test: [node, "-e", "process.exit(2)"], commandTimeoutMs: 10_000 }, d.path);
      expect(passed.build.passed).toBe(true);
      expect(passed.tests).toMatchObject({ ran: true, passed: false, exitCode: 2 });
    } finally {
      d.cleanup();
    }
  });
});
