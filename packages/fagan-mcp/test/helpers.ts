// Shared test fixtures: fake clock, temp folders and git repos, a sample state.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Clock } from "../src/clock.js";
import { parseUnifiedDiff } from "../src/core/diff.js";
import { buildPacket } from "../src/core/packet.js";
import type { Checklist, CheckResult, Config, Entry } from "../src/core/schema.js";
import { createInspectionState, type InspectionState } from "../src/core/state.js";

/** A clock that starts at `start` and moves `stepMs` forward on every read. */
export function fakeClock(start = "2026-11-15T10:00:00.000Z", stepMs = 1000): Clock & { reads: number } {
  const t0 = Date.parse(start);
  const clock = {
    reads: 0,
    now(): Date {
      const d = new Date(t0 + clock.reads * stepMs);
      clock.reads++;
      return d;
    },
  };
  return clock;
}

export function tempDir(prefix = "fagan-test-"): { path: string; cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "fagan-test",
      GIT_AUTHOR_EMAIL: "fagan-test@example.invalid",
      GIT_COMMITTER_NAME: "fagan-test",
      GIT_COMMITTER_EMAIL: "fagan-test@example.invalid",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

export function writeFiles(root: string, files: Record<string, string | Buffer>): void {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

/** A temp git repo with one commit holding `files`. */
export function tempRepo(files: Record<string, string | Buffer> = { "README.md": "hello\n" }): {
  path: string;
  cleanup: () => void;
} {
  const dir = tempDir("fagan-repo-");
  git(dir.path, "init", "-q", "-b", "main");
  writeFiles(dir.path, files);
  git(dir.path, "add", "-A");
  git(dir.path, "commit", "-q", "-m", "init");
  return dir;
}

export const testConfig: Config = {
  schemaVersion: "fagan-config/1",
  sizeLimitLoc: 1500,
  suggestThresholdLoc: 200,
  maxUnitLines: 80,
  build: ["node", "-e", "process.exit(0)"],
  test: ["node", "-e", "process.exit(0)"],
  commandTimeoutMs: 60000,
  exclude: ["package-lock.json"],
  checklists: [
    { match: ["**/*.test.ts"], checklist: "tests" },
    { match: ["**/*.ts"], checklist: "typescript" },
    { match: ["**/*.md"], checklist: "docs" },
  ],
  defaultChecklist: "general",
  requireLocationChange: true,
  waiverMinChars: 20,
  judgmentWords: ["bug", "wrong", "should", "shouldn't", "fix"],
  rateWarnings: { maxPreparationLocPerHour: null, maxInspectionLocPerHour: null },
};

export const testChecklists = new Map<string, Checklist>(
  ["general", "typescript", "docs", "tests"].map((id) => [
    id,
    {
      schemaVersion: "fagan-checklist/1",
      id,
      title: `${id} checklist`,
      items: [
        { id: `${id}-01`, question: `first ${id} question?`, typeHint: "logic" },
        { id: `${id}-02`, question: `second ${id} question?`, typeHint: "interface" },
      ],
    },
  ]),
);

export const SAMPLE_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,4 +1,5 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " export { a };",
  " // end",
  "diff --git a/docs/x.md b/docs/x.md",
  "new file mode 100644",
  "index 0000000..3333333",
  "--- /dev/null",
  "+++ b/docs/x.md",
  "@@ -0,0 +1,2 @@",
  "+# Title",
  "+Body",
  "",
].join("\n");

export const PASS: CheckResult = { ran: true, passed: true, exitCode: 0, durationMs: 5 };
export const FAIL: CheckResult = { ran: true, passed: false, exitCode: 1, durationMs: 5 };

/** A fresh Overview-phase state built from SAMPLE_DIFF (units U001 docs/x.md, U002 src/a.ts). */
export function sampleState(id = "insp-0001", diff = SAMPLE_DIFF): InspectionState {
  const packet = buildPacket(parseUnifiedDiff(diff), testConfig, new Map([
    ["src/a.ts", { blobBefore: "1111111", blobAfter: "2222222" }],
    ["docs/x.md", { blobBefore: null, blobAfter: "3333333" }],
  ]));
  const entry: Entry = { build: PASS, tests: PASS, size: { changedLoc: packet.changedLoc, limit: 1500, passed: true } };
  return createInspectionState({
    id,
    title: "Sample inspection",
    range: { base: "HEAD", head: "WORKTREE", baseSha: "a".repeat(40), headSha: null },
    authorOverview: null,
    entry,
    packet,
    planningStart: "2026-11-15T10:00:00.000Z",
    planningEnd: "2026-11-15T10:00:01.000Z",
  });
}
