import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, type DiffFile, type DiffHunk } from "../src/core/diff.js";
import { buildPacket, comparePaths, countChangedLoc, reworkDriftLoc, selectChecklist, splitHunk } from "../src/core/packet.js";
import { loadChecklists, assertConfigChecklists } from "../src/store/checklists.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConfigSchema, PacketSchema } from "../src/core/schema.js";
import { computeMetrics } from "../src/core/metrics.js";
import { buildReport, renderReportTxt } from "../src/core/report.js";
import { createInspectionState } from "../src/core/state.js";
import { PASS, SAMPLE_DIFF, testConfig } from "./helpers.js";

function hunkOf(kinds: string): DiffHunk {
  // kinds: string of '+', '-', ' ' characters.
  let o = 1;
  let n = 1;
  const lines = [...kinds].map((k, i) => {
    if (k === "+") return { kind: "add" as const, oldNo: null, newNo: n++, text: `l${i}`, noNewlineAtEof: false };
    if (k === "-") return { kind: "del" as const, oldNo: o++, newNo: null, text: `l${i}`, noNewlineAtEof: false };
    return { kind: "ctx" as const, oldNo: o++, newNo: n++, text: `l${i}`, noNewlineAtEof: false };
  });
  return { header: "@@ -1 +1 @@", section: "", oldStart: 1, oldCount: o - 1, newStart: 1, newCount: n - 1, lines };
}

describe("FM-R4.1 FM-R4.2 FM-R4.3 packet splitting", () => {
  // Review v1 issue 7: a change that only adds the final newline must not
  // reach the Reader as an identical -x/+x pair.
  it("FM-R4.7 keeps the no-newline-at-end-of-file marker in packet units and report.txt", () => {
    const diff = [
      "diff --git a/n.txt b/n.txt",
      "--- a/n.txt",
      "+++ b/n.txt",
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "\\ No newline at end of file",
      "+b",
      "",
    ].join("\n");
    const packet = buildPacket(parseUnifiedDiff(diff), testConfig);
    expect(packet.units[0]?.lines.map((l) => [l.kind, l.text, l.noNewlineAtEof])).toEqual([
      ["ctx", "a", false],
      ["del", "b", true],
      ["add", "b", false],
    ]);
    expect(PacketSchema.parse(packet)).toEqual(packet);
    const state = createInspectionState({
      id: "insp-0001",
      title: "Final newline",
      range: { base: "HEAD", head: "WORKTREE", baseSha: "a".repeat(40), headSha: null },
      authorOverview: null,
      entry: { build: PASS, tests: PASS, size: { changedLoc: packet.changedLoc, limit: 1500, passed: true } },
      packet,
      planningStart: "2026-11-15T10:00:00.000Z",
      planningEnd: "2026-11-15T10:00:01.000Z",
    });
    const metrics = computeMetrics({ timestamps: state.inspection.timestamps, changedLoc: packet.changedLoc, defects: [], attempts: [], rateWarnings: testConfig.rateWarnings, computedAt: "2026-11-15T10:00:02.000Z" });
    const txt = renderReportTxt(buildReport({ state, metrics, events: [], checklists: new Map(), generatorVersion: "0.0.0", exportedAt: "2026-11-15T10:00:02.000Z" }));
    const lines = txt.split("\n");
    const del = lines.findIndex((l) => /\s2 +- b[\s|]*$/.test(l));
    expect(del, txt).toBeGreaterThan(-1);
    expect(lines[del + 1]).toContain("\\ No newline at end of file");
    expect(lines.filter((l) => l.includes("No newline at end of file"))).toHaveLength(1);
  });
  it("orders files by byte order and numbers units without gaps", () => {
    const packet = buildPacket(parseUnifiedDiff(SAMPLE_DIFF), testConfig);
    expect(packet.files.map((f) => f.path)).toEqual(["docs/x.md", "src/a.ts"]);
    expect(packet.units.map((u) => [u.id, u.file, u.changedLoc])).toEqual([
      ["U001", "docs/x.md", 2],
      ["U002", "src/a.ts", 3],
    ]);
    expect(packet.changedLoc).toBe(5);
    expect(comparePaths("B", "a")).toBeLessThan(0);
  });

  it("splits a long hunk at changed lines and keeps context where it falls", () => {
    const units = splitHunk(hunkOf(" ++ + -  +"), 2);
    expect(units.map((u) => u.lines.map((l) => l.kind))).toEqual([
      ["ctx", "add", "add", "ctx"],
      ["add", "ctx", "del", "ctx", "ctx"],
      ["add"],
    ]);
    expect(units.map((u) => u.changedLoc)).toEqual([2, 2, 1]);
    expect(units[1]?.hunkHeader).toBe("@@ -3,4 +5,4 @@");
  });

  it("keeps the original header when a hunk is not split", () => {
    const units = splitHunk(hunkOf(" + "), 80);
    expect(units).toHaveLength(1);
    expect(units[0]?.hunkHeader).toBe("@@ -1 +1 @@");
  });

  it("FM-R4.4 FM-R4.5 skips binary and excluded files but lists them", () => {
    const diff = [
      SAMPLE_DIFF.trimEnd(),
      "diff --git a/package-lock.json b/package-lock.json",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1 +1 @@",
      "-{}",
      "+{ }",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
      "",
    ].join("\n");
    const files = parseUnifiedDiff(diff);
    const packet = buildPacket(files, testConfig);
    expect(packet.files.map((f) => [f.path, f.skipped])).toEqual([
      ["docs/x.md", null],
      ["logo.png", "binary"],
      ["package-lock.json", "excluded"],
      ["src/a.ts", null],
    ]);
    expect(packet.units.every((u) => u.file !== "package-lock.json" && u.file !== "logo.png")).toBe(true);
    expect(packet.changedLoc).toBe(5);
    expect(countChangedLoc(files, testConfig.exclude)).toBe(5);
  });

  it("FM-R4.8 stores blob hashes per file", () => {
    const packet = buildPacket(
      parseUnifiedDiff(SAMPLE_DIFF),
      testConfig,
      new Map([["src/a.ts", { blobBefore: "b1", blobAfter: "b2" }]]),
    );
    expect(packet.files.find((f) => f.path === "src/a.ts")).toMatchObject({ blobBefore: "b1", blobAfter: "b2" });
    expect(packet.files.find((f) => f.path === "docs/x.md")).toMatchObject({ blobBefore: null, blobAfter: null });
  });

  // Review v2 issue 2: rework drift counts toward the hook suggest threshold.
  it("FM-R15.2 rework drift counts the changed lines that differ between two diffs of a file", () => {
    const fileDiff = (path: string, body: string[]): DiffFile => {
      const [file] = parseUnifiedDiff([`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...body, ""].join("\n"));
      return file as DiffFile;
    };
    const inspected = fileDiff("src/a.ts", ["@@ -1,2 +1,2 @@", " keep", "-old", "+new"]);
    expect(reworkDriftLoc(inspected, inspected, [])).toBe(0);
    // The fix rewrites the added line: one line gone, one line new.
    const fixed = fileDiff("src/a.ts", ["@@ -1,2 +1,2 @@", " keep", "-old", "+newer"]);
    expect(reworkDriftLoc(inspected, fixed, [])).toBe(2);
    // Three lines added during rework count 3, in either order of arguments.
    const grown = fileDiff("src/a.ts", ["@@ -1,2 +1,5 @@", " keep", "-old", "+new", "+a", "+b", "+c"]);
    expect(reworkDriftLoc(inspected, grown, [])).toBe(3);
    expect(reworkDriftLoc(grown, inspected, [])).toBe(3);
    // A line that only gains its final newline is a different line.
    const eof = fileDiff("src/a.ts", ["@@ -1,2 +1,2 @@", " keep", "-old", "+new", "\\ No newline at end of file"]);
    expect(reworkDriftLoc(inspected, eof, [])).toBe(2);
    // Excluded files count 0, as in FM-R4.4.
    const lock = fileDiff("package-lock.json", ["@@ -1 +1 @@", "-{}", "+{ }"]);
    expect(reworkDriftLoc(fileDiff("package-lock.json", ["@@ -1 +1 @@", "-{}", "+[]"]), lock, testConfig.exclude)).toBe(0);
  });
});

describe("FM-R4.6 checklist selection", () => {
  const repoConfig = ConfigSchema.parse(
    JSON.parse(readFileSync(fileURLToPath(new URL("../../../.fagan/config.json", import.meta.url)), "utf8")),
  );

  it("uses the first matching rule in config order", () => {
    expect(selectChecklist("packages/x/test/a.test.ts", testConfig.checklists, "general")).toBe("tests");
    expect(selectChecklist("src/a.ts", testConfig.checklists, "general")).toBe("typescript");
    expect(selectChecklist("README.md", testConfig.checklists, "general")).toBe("docs");
  });

  it("falls back to the default checklist", () => {
    expect(selectChecklist("LICENSE", testConfig.checklists, "general")).toBe("general");
  });

  it("matches dot folders such as .kiro/ with this repo's config", () => {
    expect(selectChecklist(".kiro/settings/mcp.json", repoConfig.checklists, repoConfig.defaultChecklist)).toBe("json-config");
    expect(selectChecklist(".kiro/steering/tech.md", repoConfig.checklists, repoConfig.defaultChecklist)).toBe("json-config");
    expect(selectChecklist("packages/fagan-mcp/test/x.property.test.ts", repoConfig.checklists, "general")).toBe("tests");
  });

  it("FM-R3.8 bundled checklists load and cover every ID the repo config names", async () => {
    const checklists = await loadChecklists();
    expect([...checklists.keys()]).toEqual(["docs", "general", "json-config", "tests", "typescript"]);
    expect(() => assertConfigChecklists(repoConfig, checklists)).not.toThrow();
    expect(() => assertConfigChecklists({ ...repoConfig, defaultChecklist: "nope" }, checklists)).toThrow(/nope/);
  });
});
