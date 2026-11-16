// Tests for scripts/fagan-hook.mjs, the launcher the Kiro hooks run (RA-R7).
// The fallback cases run a copy of the launcher in a temp folder that has no
// packages/fagan-mcp/dist, like a fresh clone before `npm run build`. The
// forwarding cases run the real launcher with cwd set to a temp repo, never
// against this repo's own .fagan store.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { systemClock } from "../src/clock.js";
import {
  closeMeetingService,
  getPacketService,
  logDefectService,
  openInspection,
  recordReadingService,
  type ServiceContext,
} from "../src/service/service.js";
import { CLI, assertBuilt, fixtureRepo } from "./fixture.js";
import { tempDir } from "./helpers.js";
import { LAUNCHER, REPO_ROOT, loadLauncher, type Launcher } from "./launcher.js";

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(script: string, cwd: string, args: string[], input = ""): Run {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, input, encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const payload = (command: unknown): string => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "execute_bash", tool_input: { command } });

describe("hook launcher without a built CLI (fresh clone)", () => {
  const dir = tempDir("fagan-launcher-");
  const copy = join(dir.path, "scripts", "fagan-hook.mjs");

  beforeAll(() => {
    mkdirSync(join(dir.path, "scripts"), { recursive: true });
    copyFileSync(LAUNCHER, copy);
  });
  afterAll(() => dir.cleanup());

  it("RA-R7.2 blocks a git commit with exit 2 and tells the user to build", () => {
    for (const command of ["git commit -m x", "npm run build && git commit -am y", "sudo git -C . commit"]) {
      const r = run(copy, dir.path, ["hook", "gate"], payload(command));
      expect(r.status, command).toBe(2);
      expect(r.stdout).toContain("npm run build");
      expect(r.stderr).toContain("npm run build");
    }
    const viaCmd = run(copy, dir.path, ["hook", "gate"], JSON.stringify({ tool_input: { cmd: "git commit -m x" } }));
    expect(viaCmd.status).toBe(2);
  });

  it("RA-R7.3 lets other commands through, including the build that fixes it", () => {
    for (const command of ["git status", "npm run build", "ls -la", "git log --oneline -5"]) {
      expect(run(copy, dir.path, ["hook", "gate"], payload(command)), command).toEqual({ status: 0, stdout: "", stderr: "" });
    }
  });

  it("RA-R7.3 allows with a warning when the payload is not JSON or has no command string", () => {
    const notJson = run(copy, dir.path, ["hook", "gate"], "git commit -m x");
    expect(notJson.status).toBe(0);
    expect(notJson.stderr).toContain("not JSON");
    expect(notJson.stderr).toContain("npm run build");
    const noCommand = run(copy, dir.path, ["hook", "gate"], JSON.stringify({ tool_input: { command: 42 } }));
    expect(noCommand.status).toBe(0);
    expect(noCommand.stderr).toContain("no command string");
    expect(run(copy, dir.path, ["hook", "gate"], "").status).toBe(0);
  });

  it("RA-R7.4 hook suggest and follow-up warn and exit 0", () => {
    for (const args of [["hook", "suggest"], ["follow-up", "--latest"]]) {
      const r = run(copy, dir.path, args, JSON.stringify({ hook_event_name: "Stop", cwd: dir.path }));
      expect(r.status, args.join(" ")).toBe(0);
      expect(r.stderr).toContain("npm run build");
      expect(r.stdout).toContain("npm run build");
    }
  });

  it("RA-R7.6 other commands fail with exit 1 instead of pretending to work", () => {
    const r = run(copy, dir.path, ["export", "insp-0001"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("npm run build");
  });
});

describe("hook launcher exports", () => {
  let launcher: Launcher;
  beforeAll(async () => {
    launcher = await loadLauncher();
  });

  it("RA-R7.1 resolves the CLI from its own folder, not the working directory", () => {
    expect(launcher.CLI_PATH).toBe(join(REPO_ROOT, "packages", "fagan-mcp", "dist", "cli.js"));
    expect(launcher.CLI_PATH).toBe(CLI);
  });

  it("RA-R7.2 reads the command the same way as the CLI and blocks with the same exit code", () => {
    // src/cli.ts runs its main() on import, so its constants are read from the source.
    const source = readFileSync(join(REPO_ROOT, "packages", "fagan-mcp", "src", "cli.ts"), "utf8");
    const exit = /export const EXIT_BLOCK = (\d+);/.exec(source);
    expect(exit).not.toBeNull();
    expect(launcher.EXIT_BLOCK).toBe(Number((exit as RegExpExecArray)[1]));
    const m = /export const COMMAND_FIELDS = (\[[^\]]*\]) as const;/.exec(source);
    expect(m).not.toBeNull();
    expect([...launcher.COMMAND_FIELDS]).toEqual(JSON.parse((m as RegExpExecArray)[1] as string));
    expect(launcher.commandFromPayload({ tool_input: { command: "a", cmd: "b" } })).toBe("a");
    expect(launcher.commandFromPayload({ tool_input: { cmd: "b" } })).toBe("b");
    expect(launcher.commandFromPayload({ tool_input: { command: 1 } })).toBeNull();
    expect(launcher.commandFromPayload({ tool_input: ["git commit"] })).toBeNull();
    expect(launcher.commandFromPayload(null)).toBeNull();
  });

  it("RA-R7.5 classifies spelled-out commits as possible commits", () => {
    for (const command of ["git commit", "git c'o'm\"m\"i\\t", "git com\\\nmit", "git com$(true)mit", "git co`:`mmit", "x; git commit"]) {
      expect(launcher.couldBeGitCommit(command), command).toBe(true);
    }
    for (const command of ["git status", "npm run build", "ls", "git log --oneline", "echo cmt"]) {
      expect(launcher.couldBeGitCommit(command), command).toBe(false);
    }
  });
});

describe("hook launcher with the built CLI", () => {
  const repos: Array<{ cleanup: () => void }> = [];
  const ID = "insp-0001";

  beforeAll(() => {
    assertBuilt();
  });
  afterEach(() => {
    while (repos.length > 0) repos.pop()?.cleanup();
  });

  /** A temp repo with insp-0001 in Rework and one open major, D001 (the cli.test.ts setup). */
  async function reworkRepo(): Promise<string> {
    const repo = fixtureRepo();
    repos.push(repo);
    const ctx: ServiceContext = { cwd: repo.path, clock: systemClock };
    await openInspection(ctx, { role: "moderator", title: "Add sub()", base: "HEAD", head: "WORKTREE", include_untracked: true, author_overview: null });
    const packet = { inspection_id: ID, unit_ids: null, cursor: null, limit: 20 };
    await getPacketService(ctx, { ...packet, role: "inspector-logic", phase: "preparation" });
    await getPacketService(ctx, { ...packet, role: "moderator", phase: "meeting" });
    for (const unit_id of ["U001", "U002"]) {
      await recordReadingService(ctx, { inspection_id: ID, role: "reader", unit_id, paraphrase: `Reading of ${unit_id}.` });
    }
    await logDefectService(ctx, {
      inspection_id: ID,
      role: "scribe",
      unit_id: "U002",
      file: "src/calc.ts",
      line_start: 6,
      line_end: 6,
      side: "new",
      type: "logic",
      class: null,
      severity: "major",
      raised_by: "inspector-logic",
      description: "sub adds 1 to the difference.",
      checklist_item_id: null,
    });
    await closeMeetingService(ctx, { inspection_id: ID, role: "moderator", notes: null });
    return repo.path;
  }

  it("RA-R7.1 forwards arguments, stdin and the exit code to the built CLI", async () => {
    const root = await reworkRepo();
    const blocked = run(LAUNCHER, root, ["hook", "gate"], payload("git commit -m x"));
    expect(blocked.status).toBe(2);
    expect(blocked.stdout).toContain("insp-0001: D001");
    expect(blocked.stderr).toContain("insp-0001: D001");
    expect(run(LAUNCHER, root, ["hook", "gate"], payload("git status"))).toEqual({ status: 0, stdout: "", stderr: "" });

    const exported = run(LAUNCHER, root, ["export", ID, "--format", "json"]);
    expect(exported.status).toBe(0);
    expect(exported.stdout).toContain("report.json sha256");
    expect(exported.stdout).not.toContain("report.txt");

    const usage = run(LAUNCHER, root, ["abandon", ID]);
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain("Usage:");
  });

  it("RA-R7.1 follow-up --latest runs in the working directory's repo", async () => {
    const root = await reworkRepo();
    const r = run(LAUNCHER, root, ["follow-up", "--latest"]);
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout) as { passed: boolean; blocking: string[] };
    expect(result.passed).toBe(false);
    expect(result.blocking).toEqual(["D001"]);
  });
});
