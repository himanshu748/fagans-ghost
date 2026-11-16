// CLI tests: hook payloads on STDIN into the built `fagan` CLI, plus the
// follow-up, abandon and export commands (task 12.2). The store is set up
// in-process through the same services the MCP server uses.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { systemClock } from "../src/clock.js";
import { readEvents } from "../src/store/store.js";
import {
  abandonService,
  closeMeetingService,
  followUpService,
  getPacketService,
  logDefectService,
  openInspection,
  recordReadingService,
  recordReworkService,
  type ServiceContext,
} from "../src/service/service.js";
import { CALC_V3, CLI, NOTES, assertBuilt, fixtureConfig, fixtureRepo } from "./fixture.js";

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function fagan(cwd: string, args: string[], input = ""): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, input, encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const payload = (command: unknown, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "shell", tool_input: { command }, ...extra });

/**
 * A hook payload Kiro CLI V3 sent in a live session (docs/experiments.md E1,
 * E2), with the scratch repo path replaced by `@REPO@`, which this fills in.
 */
const recorded = (name: string, root: string): string =>
  readFileSync(new URL(`./fixtures/kiro-payloads/${name}`, import.meta.url), "utf8").split("@REPO@").join(root);

const repos: Array<{ cleanup: () => void }> = [];
function repo(config = fixtureConfig): string {
  const r = fixtureRepo(config);
  repos.push(r);
  return r.path;
}

const ID = "insp-0001";
const ctxFor = (root: string): ServiceContext => ({ cwd: root, clock: systemClock });

async function toMeeting(root: string): Promise<void> {
  const ctx = ctxFor(root);
  await openInspection(ctx, { role: "moderator", title: "Add sub()", base: "HEAD", head: "WORKTREE", include_untracked: true, author_overview: null });
  const packet = { inspection_id: ID, unit_ids: null, cursor: null, limit: 20 };
  await getPacketService(ctx, { ...packet, role: "inspector-logic", phase: "preparation" });
  await getPacketService(ctx, { ...packet, role: "moderator", phase: "meeting" });
  for (const unit_id of ["U001", "U002"]) {
    await recordReadingService(ctx, { inspection_id: ID, role: "reader", unit_id, paraphrase: `Reading of ${unit_id}.` });
  }
}

/** insp-0001 in Rework with one open major, D001. */
async function toReworkWithMajor(root: string): Promise<void> {
  await toMeeting(root);
  const ctx = ctxFor(root);
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
}

beforeAll(() => {
  assertBuilt();
});

afterEach(() => {
  while (repos.length > 0) repos.pop()?.cleanup();
});

describe("fagan hook gate", () => {
  it("FM-R16.1 FM-R16.3 blocks only git commit while a major is open", async () => {
    const root = repo();
    await toReworkWithMajor(root);

    const status = fagan(root, ["hook", "gate"], payload("git status"));
    expect(status).toEqual({ status: 0, stdout: "", stderr: "" });
    expect(fagan(root, ["hook", "gate"], payload('echo "git commit" && git log --grep commit')).status).toBe(0);

    for (const cmd of ["git commit -m x", "git -c user.name=x commit -am y", "npm test && git commit -m z", "cd sub; git --no-pager commit"]) {
      const r = fagan(root, ["hook", "gate"], payload(cmd));
      expect(r.status, cmd).toBe(2);
      expect(r.stdout).toContain("insp-0001: D001");
      expect(r.stderr).toContain("insp-0001: D001");
    }
    const viaCmd = fagan(root, ["hook", "gate"], JSON.stringify({ tool_input: { cmd: "git commit -m x" } }));
    expect(viaCmd.status).toBe(2);
    // Review v1 issue 6: wrapped commits are commits too.
    for (const cmd of ["sudo git commit -m x", "timeout 60 git commit -m x", "nice -n 5 git commit", "echo m | xargs git commit -m"]) {
      expect(fagan(root, ["hook", "gate"], payload(cmd)).status, cmd).toBe(2);
    }
  });

  it("FM-R16.2 FM-R16.3 checks the repo named by git -C, not only the payload cwd (review v1 issue 6)", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const clean = repo();
    expect(fagan(clean, ["hook", "gate"], payload(`git -C ${JSON.stringify(root)} commit -m x`)).status).toBe(2);
    expect(fagan(clean, ["hook", "gate"], payload(`sudo -D ${JSON.stringify(root)} git commit -m x`)).status).toBe(2);
    expect(fagan(root, ["hook", "gate"], payload(`git -C ${JSON.stringify(clean)} commit -m x`)).status).toBe(0);
    // A missing directory falls back to the payload cwd repo, which is clean here (review v2 issue 1).
    expect(fagan(clean, ["hook", "gate"], payload("git -C does-not-exist commit -m x")).status).toBe(0);
  });

  it("FM-R16.2 FM-R16.3 falls back to the payload cwd for -C words the shell would expand or that are not a repo (review v2 issue 1)", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const fromHome = relative(homedir(), root);
    for (const cmd of [
      'git -C "$PWD" commit -m x',
      "git -C $PWD commit -m x",
      `git -C ~/${fromHome} commit -m x`,
      'git -C "$(git rev-parse --show-toplevel)/src" commit -m x',
      "git -C `pwd` commit -m x",
      "env -C $PWD git commit -m x",
      "sudo --chdir=${PWD} git commit -m x",
      "git -C does-not-exist commit -m x",
      "git -C '$PWD' commit -m x",
    ]) {
      const r = fagan(root, ["hook", "gate"], payload(cmd));
      expect(r.status, cmd).toBe(2);
      expect(r.stdout, cmd).toContain("insp-0001: D001");
    }
    // A literal or tilde path still names the other repo, whatever the payload cwd holds.
    const clean = repo();
    expect(fagan(clean, ["hook", "gate"], payload(`git -C ~/${fromHome} commit -m x`)).status).toBe(2);
    expect(fagan(clean, ["hook", "gate"], payload('git -C "$PWD" commit -m x')).status).toBe(0);
    // An absolute path after an unknown word is known again; a relative one is not.
    expect(fagan(clean, ["hook", "gate"], payload(`env -C $PWD git -C ${JSON.stringify(root)} commit -m x`)).status).toBe(2);
    expect(fagan(root, ["hook", "gate"], payload(`env -C $PWD git -C ${JSON.stringify(relative(root, clean))} commit -m x`)).status).toBe(2);
  });

  it("FM-R9.3 FM-R16.3 a fixed major blocks until follow-up verifies it (review v1 issue 3)", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const ctx = ctxFor(root);
    writeFileSync(join(root, "src", "calc.ts"), CALC_V3);
    await recordReworkService(ctx, { inspection_id: ID, role: "author", items: [{ defect_id: "D001", resolution: "fixed", note: "Removed the + 1." }] });
    const blocked = fagan(root, ["hook", "gate"], payload("git commit -m x"));
    expect(blocked.status).toBe(2);
    expect(blocked.stdout).toContain("insp-0001: D001");
    const fu = await followUpService(ctx, { inspection_id: ID, caller: { kind: "tool", role: "moderator" }, run_checks: true });
    expect(fu.passed).toBe(true);
    expect(fagan(root, ["hook", "gate"], payload("git commit -m x")).status).toBe(0);
  });

  it("FM-R15.2 FM-R16.3 uses the payload cwd when present", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    expect(fagan(tmpdir(), ["hook", "gate"], payload("git commit -m x", { cwd: root })).status).toBe(2);
    expect(fagan(tmpdir(), ["hook", "gate"], payload("git commit -m x")).status).toBe(0);
  });

  it("FM-R16.3 FM-R16.4 FM-R16.5 recorded Kiro payloads: the commit exits 2 with an open major and 0 without (E2)", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const blocked = fagan(tmpdir(), ["hook", "gate"], recorded("pre-tool-use-commit.json", root));
    expect(blocked.status).toBe(2);
    expect(blocked.stdout).toContain("insp-0001: D001");
    expect(blocked.stderr).toContain("insp-0001: D001");
    const fresh = repo();
    expect(fagan(tmpdir(), ["hook", "gate"], recorded("pre-tool-use-commit.json", fresh))).toEqual({ status: 0, stdout: "", stderr: "" });
    // The recorded git status calls, with and without the tool's cwd, and the PostToolUse shape.
    for (const name of ["pre-tool-use-git-status.json", "pre-tool-use-git-status-tool-cwd.json", "post-tool-use-git-status.json"]) {
      expect(fagan(tmpdir(), ["hook", "gate"], recorded(name, root)), name).toEqual({ status: 0, stdout: "", stderr: "" });
    }
  });

  it("FM-R16.2 FM-R16.3 checks the repo in tool_input.cwd before the payload cwd (E2)", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const clean = repo();
    /** The recorded commit payload with session cwd `session`, tool cwd `cwd` and, optionally, another command. */
    const gate = (session: string, cwd: unknown, command?: string): number | null => {
      const p = JSON.parse(recorded("pre-tool-use-commit.json", session)) as { tool_input: Record<string, unknown> };
      p.tool_input["cwd"] = cwd;
      if (command !== undefined) p.tool_input["command"] = command;
      return fagan(tmpdir(), ["hook", "gate"], JSON.stringify(p)).status;
    };
    // The shell tool runs the command in tool_input.cwd, so that repo is checked.
    expect(gate(clean, root)).toBe(2);
    expect(gate(clean, join(root, "src"))).toBe(2);
    expect(gate(root, clean)).toBe(0);
    // A relative tool cwd resolves against the payload cwd.
    expect(gate(clean, relative(clean, join(root, "src")))).toBe(2);
    expect(gate(root, relative(root, clean))).toBe(0);
    // -C and --chdir start from the tool cwd.
    expect(gate(clean, join(root, "src"), "git -C .. commit -m x")).toBe(2);
    expect(gate(root, join(clean, "src"), "git -C .. commit -m x")).toBe(0);
    expect(gate(root, clean, `git -C ${JSON.stringify(root)} commit -m x`)).toBe(2);
    // An unknown -C word falls back to the tool cwd repo; a tool cwd outside any repo falls back to the payload cwd repo.
    expect(gate(clean, root, 'git -C "$PWD" commit -m x')).toBe(2);
    expect(gate(root, clean, 'git -C "$PWD" commit -m x')).toBe(0);
    expect(gate(root, tmpdir())).toBe(2);
    expect(gate(clean, tmpdir())).toBe(0);
    // A null (as recorded), empty or non-string tool cwd means the payload cwd.
    for (const cwd of [null, "", 42]) {
      expect(gate(root, cwd), String(cwd)).toBe(2);
      expect(gate(clean, cwd), String(cwd)).toBe(0);
    }
  });

  it("FM-R16.4 allows a commit when there is no store or no open major", async () => {
    const fresh = repo();
    expect(fagan(fresh, ["hook", "gate"], payload("git commit -m x"))).toEqual({ status: 0, stdout: "", stderr: "" });

    const waived = repo();
    await toReworkWithMajor(waived);
    await recordReworkService(ctxFor(waived), {
      inspection_id: ID,
      role: "author",
      items: [{ defect_id: "D001", resolution: "waived", reason: "Accepted: the caller compensates for it." }],
    });
    expect(fagan(waived, ["hook", "gate"], payload("git commit -m x")).status).toBe(0);

    const abandoned = repo();
    await toReworkWithMajor(abandoned);
    await abandonService(ctxFor(abandoned), { inspection_id: ID, reason: "Superseded by a smaller change." });
    expect(fagan(abandoned, ["hook", "gate"], payload("git commit -m x")).status).toBe(0);
  });

  it("FM-R16.5 allows with a warning when the payload is not usable", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    for (const input of ["not json", "", "[1,2]", JSON.stringify({ tool_input: { command: 42 } }), JSON.stringify({ other: 1 })]) {
      const r = fagan(root, ["hook", "gate"], input);
      expect(r.status, input).toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("warning");
    }
  });

  it("FM-R16.6 blocks a commit when the store cannot be read", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    writeFileSync(join(root, ".fagan", "inspections", ID, "defects.json"), "{ not json");
    const r = fagan(root, ["hook", "gate"], payload("git commit -m x"));
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("STORE_CORRUPT");
    expect(fagan(root, ["hook", "gate"], payload("ls")).status).toBe(0);
  });
});

describe("fagan hook suggest", () => {
  it("FM-R15.2 FM-R15.3 prints a suggestion only above the threshold", () => {
    const low = repo({ ...fixtureConfig, suggestThresholdLoc: 0 });
    const r = fagan(low, ["hook", "suggest"], "{}");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^fagan: \d+ changed lines against HEAD \(threshold 0\)/);

    const high = repo({ ...fixtureConfig, suggestThresholdLoc: 200 });
    expect(fagan(high, ["hook", "suggest"], "{}")).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it("FM-R15.2 stays quiet while an inspection is open or a Closed one covers the diff", async () => {
    const open = repo({ ...fixtureConfig, suggestThresholdLoc: 0 });
    await toMeeting(open);
    expect(fagan(open, ["hook", "suggest"], "{}").stdout).toBe("");

    // No defects: close the meeting and pass follow-up, so the inspection is Closed.
    const closed = repo({ ...fixtureConfig, suggestThresholdLoc: 0 });
    await toMeeting(closed);
    await closeMeetingService(ctxFor(closed), { inspection_id: ID, role: "moderator", notes: null });
    const fu = await followUpService(ctxFor(closed), { inspection_id: ID, caller: { kind: "tool", role: "moderator" }, run_checks: true });
    expect(fu.phase).toBe("Closed");
    // The inspection's own files are untracked now; they must not count as changes.
    expect(fagan(closed, ["hook", "suggest"], "{}").stdout).toBe("");
    // A new change makes the diff differ again.
    writeFileSync(join(closed, "README.md"), "# demo\nmore\n");
    expect(fagan(closed, ["hook", "suggest"], "{}").stdout).toContain("changed lines against HEAD");
  });

  it("FM-R15.2 stays quiet after a Closed inspection whose rework changed the diff (review v1 issue 5)", async () => {
    // Threshold 2: the fix below rewrites one line, which is 2 changed lines of rework drift.
    const root = repo({ ...fixtureConfig, suggestThresholdLoc: 2 });
    await toReworkWithMajor(root);
    const ctx = ctxFor(root);
    writeFileSync(join(root, "src", "calc.ts"), CALC_V3);
    await recordReworkService(ctx, { inspection_id: ID, role: "author", items: [{ defect_id: "D001", resolution: "fixed", note: "Removed the + 1." }] });
    const fu = await followUpService(ctx, { inspection_id: ID, caller: { kind: "tool", role: "moderator" }, run_checks: true });
    expect(fu.phase).toBe("Closed");
    // The working tree now differs from diff.patch (the fix), but it is what the inspection accepted.
    expect(fagan(root, ["hook", "suggest"], "{}")).toEqual({ status: 0, stdout: "", stderr: "" });
    // Editing an inspected file after the close makes it uncovered again.
    writeFileSync(join(root, "src", "calc.ts"), `${CALC_V3}// later\n`);
    expect(fagan(root, ["hook", "suggest"], "{}").stdout).toMatch(/1 file\(s\) already covered/);
  });

  it("FM-R15.2 counts code added during rework against the threshold (review v2 issue 2)", async () => {
    const extra = Array.from({ length: 20 }, (_, i) => `export const k${i} = ${i};`).join("\n");
    const root = repo({ ...fixtureConfig, suggestThresholdLoc: 10 });
    await toReworkWithMajor(root);
    const ctx = ctxFor(root);
    // The fix (2 changed lines) plus 20 new lines no Reader paraphrased.
    writeFileSync(join(root, "src", "calc.ts"), `${CALC_V3}${extra}\n`);
    await recordReworkService(ctx, { inspection_id: ID, role: "author", items: [{ defect_id: "D001", resolution: "fixed", note: "Removed the + 1." }] });
    expect((await followUpService(ctx, { inspection_id: ID, caller: { kind: "tool", role: "moderator" }, run_checks: true })).phase).toBe("Closed");
    const r = fagan(root, ["hook", "suggest"], "{}");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^fagan: 22 changed lines against HEAD \(threshold 10\)/);
    expect(r.stdout).toContain("2 file(s) already covered by a Closed inspection add only the 22 line(s) changed since the inspection read them");

    // A no-defect inspection waiting in FollowUp: edits made before follow_up count too.
    const waiting = repo({ ...fixtureConfig, suggestThresholdLoc: 10 });
    await toMeeting(waiting);
    await closeMeetingService(ctxFor(waiting), { inspection_id: ID, role: "moderator", notes: null });
    writeFileSync(join(waiting, "docs", "notes.md"), `${NOTES}${extra}\n`);
    const fu = await followUpService(ctxFor(waiting), { inspection_id: ID, caller: { kind: "tool", role: "moderator" }, run_checks: true });
    expect(fu.phase).toBe("Closed");
    expect(fagan(waiting, ["hook", "suggest"], "{}").stdout).toMatch(/^fagan: 20 changed lines against HEAD \(threshold 10\)/);
  });

  it("FM-R15.2 says when the diff is above sizeLimitLoc (review v1 issue 5)", () => {
    const root = repo({ ...fixtureConfig, suggestThresholdLoc: 0, sizeLimitLoc: 1 });
    const r = fagan(root, ["hook", "suggest"], "{}");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("above sizeLimitLoc 1");
    expect(r.stdout).toContain("SIZE_LIMIT_EXCEEDED");
  });

  it("FM-R15.3 exits 0 for garbage input and outside a git repo", () => {
    for (const input of ["not json", "", "null"]) {
      const r = fagan(tmpdir(), ["hook", "suggest"], input);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    }
    const root = repo({ ...fixtureConfig, suggestThresholdLoc: 0 });
    expect(fagan(tmpdir(), ["hook", "suggest"], JSON.stringify({ cwd: root })).stdout).toContain("changed lines");
  });

  it("FM-R15.2 FM-R15.3 the recorded Stop payload suggests for its cwd (E1, E16)", () => {
    const low = repo({ ...fixtureConfig, suggestThresholdLoc: 0 });
    const r = fagan(tmpdir(), ["hook", "suggest"], recorded("stop.json", low));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^fagan: \d+ changed lines against HEAD \(threshold 0\)/);
    const high = repo({ ...fixtureConfig, suggestThresholdLoc: 200 });
    expect(fagan(tmpdir(), ["hook", "suggest"], recorded("stop.json", high))).toEqual({ status: 0, stdout: "", stderr: "" });
  });
});

describe("fagan follow-up, abandon, export", () => {
  it("FM-R15.4 follow-up --latest with nothing to do exits 0", () => {
    const root = repo();
    const r = fagan(root, ["follow-up", "--latest"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("nothing to do");
  });

  it("FM-R15.4 follow-up --latest runs follow-up and records a cli:follow-up event", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const r = fagan(root, ["follow-up", "--latest"]);
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout) as { inspection_id: string; passed: boolean; blocking: string[] };
    expect(result).toMatchObject({ inspection_id: ID, passed: false, blocking: ["D001"] });
    const last = (await readEvents(root, ID)).at(-1);
    expect(last).toMatchObject({ tool: "cli:follow-up", role: "human" });
    expect(fagan(root, ["follow-up", ID]).status).toBe(0);
  });

  it("FM-R15.5 FM-R15.7 abandon needs a valid reason", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const short = fagan(root, ["abandon", ID, "--reason", "meh"]);
    expect(short.status).toBe(1);
    expect(JSON.parse(short.stderr)).toMatchObject({ code: "WAIVER_REASON_REQUIRED" });
    const r = fagan(root, ["abandon", ID, "--reason", "Superseded by a smaller change."]);
    expect(r.status).toBe(0);
    const inspection = JSON.parse(readFileSync(join(root, ".fagan", "inspections", ID, "inspection.json"), "utf8")) as {
      phase: string;
      abandonReason: string;
    };
    expect(inspection).toMatchObject({ phase: "Abandoned", abandonReason: "Superseded by a smaller change." });
    expect(fagan(root, ["abandon", ID, "--reason", "Superseded by a smaller change."]).status).toBe(1);
  });

  it("FM-R15.6 FM-R15.7 export writes the report files and rejects bad IDs", async () => {
    const root = repo();
    await toReworkWithMajor(root);
    const r = fagan(root, ["export", ID, "--format", "txt"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^\.fagan\/inspections\/insp-0001\/report\.txt sha256 [0-9a-f]{64} \d+ bytes\n$/);
    expect(existsSync(join(root, ".fagan", "inspections", ID, "report.txt"))).toBe(true);
    expect(existsSync(join(root, ".fagan", "inspections", ID, "report.json"))).toBe(false);

    const bad = fagan(root, ["export", "../x"]);
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stderr)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fagan(root, ["export"]).status).toBe(1);
    expect(fagan(root, ["nonsense"]).status).toBe(1);
  });
});
